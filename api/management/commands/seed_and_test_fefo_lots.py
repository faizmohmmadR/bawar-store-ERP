"""
Seed varied supermarket lot/expiry data and verify FEFO behaviour.

Creates biscuit + milk products with Track expiry, three purchase lots each
(expired / soon / far), then asserts:
  - separate lots per purchase
  - sales consume nearest-expiry first (FEFO)
  - expiring API lists the right lots
  - expiry write-off only hits expired lots
  - receiving without expiry is rejected

Usage:
  ./venv/bin/python manage.py seed_and_test_fefo_lots
  ./venv/bin/python manage.py seed_and_test_fefo_lots --reset
"""
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.test.utils import override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from account.models import User
from api.models.data.customers import Customer
from api.models.data.inventory_ledger import InventoryBalance, InventoryLot, StockMovement
from api.models.data.product_packaging import ProductPackaging, ProductPrice
from api.models.data.products import Product, ProductCategory
from api.models.data.purchases import Purchase, PurchaseItem
from api.models.data.sales import Sales, SalesItems
from api.models.data.stock_adjustment import StockAdjustment
from api.models.data.uom import UnitCategory, UnitOfMeasure
from api.models.data.vendors import Vendor
from api.models.data.warehouse import Warehouse
from api.services.accounting.coa import ensure_accounting_ready
from api.services.inventory.engine import deliver_sale_item, receive_purchase_item
from api.services.inventory.expiry import record_expired_stock
from api.tests.accounting.helpers import AFN

MARKER = 'FEFO-LOT-TEST'
SKU_BISCUIT = 'FEFO-BISCUIT'
SKU_MILK = 'FEFO-MILK'


class Command(BaseCommand):
    help = 'Seed varied expiry lots and verify FEFO / write-off correctness'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Remove previous FEFO-LOT-TEST rows before seeding',
        )
        parser.add_argument(
            '--seed-only',
            action='store_true',
            help='Only seed demo lots (skip FEFO / write-off checks that consume stock)',
        )

    def handle(self, *args, **options):
        fails = 0

        def check(label, ok, detail=''):
            nonlocal fails
            if ok:
                self.stdout.write(self.style.SUCCESS(f'PASS  {label}{(" — " + detail) if detail else ""}'))
            else:
                fails += 1
                self.stdout.write(self.style.ERROR(f'FAIL  {label}{(" — " + detail) if detail else ""}'))

        ensure_accounting_ready(currency_id=AFN)

        if options['reset']:
            self._reset()
            self.stdout.write(self.style.WARNING('Reset previous FEFO-LOT-TEST data'))

        today = timezone.localdate()
        with transaction.atomic():
            ctx = self._seed(today)

        self.stdout.write('')
        self.stdout.write(self.style.NOTICE('=== Seeded lots ==='))
        for row in (
            InventoryBalance.objects.filter(
                product__sku__in=[SKU_BISCUIT, SKU_MILK],
                quantity_on_hand__gt=0,
            )
            .select_related('product', 'lot')
            .order_by('product__sku', 'lot__expiry_date')
        ):
            lot = row.lot
            self.stdout.write(
                f'  {row.product.sku}  lot={lot.lot_number if lot else "-"}  '
                f'expiry={lot.expiry_date if lot else "-"}  '
                f'on_hand={row.quantity_on_hand}'
            )

        if options['seed_only']:
            self.stdout.write(self.style.SUCCESS('Demo lots seeded (checks skipped)'))
            self.stdout.write(
                'UI: Stock → Expiring stock, or open biscuit/milk on Stock details to see lots.'
            )
            return

        # ── 1. Separate lots ────────────────────────────────────────────
        biscuit_lots = list(
            InventoryLot.objects.filter(product=ctx['biscuit']).order_by('expiry_date')
        )
        check(
            'biscuit has 3 lots',
            len(biscuit_lots) == 3,
            f'got {len(biscuit_lots)}',
        )
        if len(biscuit_lots) == 3:
            check(
                'biscuit lot order by expiry',
                [l.lot_number for l in biscuit_lots] == ['BIS-EXPIRED', 'BIS-SOON', 'BIS-FAR'],
                ', '.join(l.lot_number for l in biscuit_lots),
            )

        milk_lots = InventoryLot.objects.filter(product=ctx['milk']).count()
        check('milk has 3 lots', milk_lots == 3, f'got {milk_lots}')

        # ── 2. Receive without expiry rejected ──────────────────────────
        purchase = Purchase.objects.create(
            vendor=ctx['vendor'],
            warehouse=ctx['warehouse'],
            currency=AFN,
            status='received',
            total_amount=0,
            notes=f'{MARKER} reject-no-expiry',
        )
        bad_item = PurchaseItem.objects.create(
            purchase=purchase,
            product=ctx['biscuit'],
            packaging=ctx['biscuit_pack'],
            quantity=5,
            conversion_factor=1,
            price_per_unit=10,
            lot_number='BIS-NO-EXP',
        )
        rejected = False
        try:
            receive_purchase_item(bad_item)
        except ValidationError:
            rejected = True
        check('receive without expiry rejected', rejected)

        # ── 3. Expiring API (before sale, while expired still on hand) ───
        user = User.objects.filter(is_staff=True).first() or User.objects.first()
        if user is None:
            raise CommandError('Need at least one user for API checks')
        client = APIClient()
        client.force_authenticate(user)

        with override_settings(ALLOWED_HOSTS=['*', 'testserver', 'localhost']):
            resp = client.get('/api/inventory-balances/expiring/', {'days': 14})
        check('expiring API 200', resp.status_code == 200, f'status={resp.status_code}')
        payload = getattr(resp, 'data', None)
        if payload is None:
            import json
            payload = json.loads(resp.content.decode() or '[]')
        rows = payload.get('results', payload) if isinstance(payload, dict) else payload
        biscuit_rows = [r for r in rows if r.get('product') == ctx['biscuit'].id]
        biscuit_lot_nums = {r.get('lot_number') for r in biscuit_rows}
        # Within 14 days: expired + soon (7d). Far (90d) should be out.
        check(
            'expiring(14d) includes BIS-EXPIRED + BIS-SOON',
            {'BIS-EXPIRED', 'BIS-SOON'}.issubset(biscuit_lot_nums),
            str(biscuit_lot_nums),
        )
        check(
            'expiring(14d) excludes BIS-FAR',
            'BIS-FAR' not in biscuit_lot_nums,
            str(biscuit_lot_nums),
        )
        expired_row = next((r for r in biscuit_rows if r.get('lot_number') == 'BIS-EXPIRED'), None)
        soon_row = next((r for r in biscuit_rows if r.get('lot_number') == 'BIS-SOON'), None)
        check(
            'BIS-EXPIRED flagged is_expired',
            expired_row is not None and bool(expired_row.get('is_expired')),
            str(expired_row.get('is_expired') if expired_row else None),
        )
        check(
            'BIS-SOON flagged not expired',
            soon_row is not None and not soon_row.get('is_expired'),
            str(soon_row.get('is_expired') if soon_row else None),
        )

        # ── 4. FEFO sale: sell 25 pcs → take all 20 expired + 5 soon ─────
        sale = Sales.objects.create(
            customer=ctx['customer'],
            warehouse=ctx['warehouse'],
            currency=AFN,
            status='confirmed',
            total_amount=0,
            notes=f'{MARKER} fefo sale',
        )
        line = SalesItems.objects.create(
            sales=sale,
            product=ctx['biscuit'],
            packaging=ctx['biscuit_pack'],
            quantity=25,
            conversion_factor=1,
            sell_price=15,
        )
        deliver_sale_item(line, warehouse=ctx['warehouse'])

        bal_expired = InventoryBalance.objects.get(
            product=ctx['biscuit'], lot__lot_number='BIS-EXPIRED',
        )
        bal_soon = InventoryBalance.objects.get(
            product=ctx['biscuit'], lot__lot_number='BIS-SOON',
        )
        bal_far = InventoryBalance.objects.get(
            product=ctx['biscuit'], lot__lot_number='BIS-FAR',
        )
        check(
            'FEFO: expired lot emptied first',
            bal_expired.quantity_on_hand == Decimal('0.000000'),
            f'on_hand={bal_expired.quantity_on_hand}',
        )
        check(
            'FEFO: soon lot reduced by remainder (30→25)',
            bal_soon.quantity_on_hand == Decimal('25.000000'),
            f'on_hand={bal_soon.quantity_on_hand}',
        )
        check(
            'FEFO: far lot untouched (50)',
            bal_far.quantity_on_hand == Decimal('50.000000'),
            f'on_hand={bal_far.quantity_on_hand}',
        )

        sale_moves = StockMovement.objects.filter(
            object_id=line.id,
            movement_type=StockMovement.TYPE_SALES_DELIVERY,
        ).select_related('lot')
        sold_lots = sorted(
            {m.lot.lot_number for m in sale_moves if m.lot_id},
        )
        check(
            'FEFO sale movements only from expired+soon',
            sold_lots == ['BIS-EXPIRED', 'BIS-SOON'],
            str(sold_lots),
        )

        # ── 5. Expiry write-off: milk expired lot only ───────────────────
        milk_expired_before = InventoryBalance.objects.get(
            product=ctx['milk'], lot__lot_number='MILK-EXPIRED',
        ).quantity_on_hand
        milk_fresh_before = InventoryBalance.objects.get(
            product=ctx['milk'], lot__lot_number='MILK-FAR',
        ).quantity_on_hand

        result = record_expired_stock(
            product=ctx['milk'],
            warehouse=ctx['warehouse'],
            quantity=Decimal('10'),
            packaging=ctx['milk_pack'],
            reason=f'{MARKER} write-off',
        )
        milk_expired_after = InventoryBalance.objects.get(
            product=ctx['milk'], lot__lot_number='MILK-EXPIRED',
        ).quantity_on_hand
        milk_fresh_after = InventoryBalance.objects.get(
            product=ctx['milk'], lot__lot_number='MILK-FAR',
        ).quantity_on_hand

        check(
            'write-off reduces expired milk (15→5)',
            milk_expired_before == Decimal('15.000000')
            and milk_expired_after == Decimal('5.000000'),
            f'{milk_expired_before} → {milk_expired_after}',
        )
        check(
            'write-off leaves fresh milk untouched',
            milk_fresh_after == milk_fresh_before,
            f'{milk_fresh_before} → {milk_fresh_after}',
        )
        check(
            'write-off creates expired StockAdjustment',
            result['adjustment'].adjustment_type == StockAdjustment.ADJUSTMENT_TYPE_EXPIRED,
        )

        # Cannot write off fresh lot
        fresh_lot = InventoryLot.objects.get(product=ctx['milk'], lot_number='MILK-FAR')
        blocked = False
        try:
            record_expired_stock(
                product=ctx['milk'],
                warehouse=ctx['warehouse'],
                lot=fresh_lot,
                quantity=Decimal('1'),
                packaging=ctx['milk_pack'],
            )
        except ValidationError:
            blocked = True
        check('cannot write off non-expired lot', blocked)

        # ── 6. API record-expiry ────────────────────────────────────────
        with override_settings(ALLOWED_HOSTS=['*', 'testserver', 'localhost']):
            api_resp = client.post(
                '/api/stock-adjustments/record-expiry/',
                {
                    'product': ctx['milk'].id,
                    'warehouse': ctx['warehouse'].id,
                    'quantity': '5',
                    'reason': f'{MARKER} api write-off',
                },
                format='json',
            )
        check('record-expiry API 201', api_resp.status_code == 201, f'status={api_resp.status_code}')
        milk_expired_final = InventoryBalance.objects.get(
            product=ctx['milk'], lot__lot_number='MILK-EXPIRED',
        ).quantity_on_hand
        check(
            'API write-off empties remaining expired milk',
            milk_expired_final == Decimal('0.000000'),
            f'on_hand={milk_expired_final}',
        )

        self.stdout.write('')
        if fails:
            self.stdout.write(self.style.ERROR(f'{fails} check(s) failed'))
            raise CommandError(f'FEFO lot verification failed ({fails})')
        self.stdout.write(self.style.SUCCESS('All FEFO / expiry checks passed'))
        self.stdout.write(
            'UI: Stock → Expiring stock, or open biscuit/milk on Stock details to see lots.'
        )

    def _reset(self):
        products = Product.objects.filter(sku__in=[SKU_BISCUIT, SKU_MILK])
        product_ids = list(products.values_list('id', flat=True))

        # Delete by product first so protected packaging FKs are cleared even if
        # older rows were not tagged with MARKER notes.
        if product_ids:
            sale_ids = list(
                SalesItems.objects.filter(product_id__in=product_ids)
                .values_list('sales_id', flat=True)
                .distinct()
            )
            SalesItems.objects.filter(product_id__in=product_ids).delete()
            Sales.objects.filter(id__in=sale_ids).delete()
            purchase_ids = list(
                PurchaseItem.objects.filter(product_id__in=product_ids)
                .values_list('purchase_id', flat=True)
                .distinct()
            )
            PurchaseItem.objects.filter(product_id__in=product_ids).delete()
            Purchase.objects.filter(id__in=purchase_ids).delete()
            StockAdjustment.objects.filter(product_id__in=product_ids).delete()
            StockMovement.objects.filter(product_id__in=product_ids).delete()
            InventoryBalance.objects.filter(product_id__in=product_ids).delete()
            InventoryLot.objects.filter(product_id__in=product_ids).delete()
            ProductPackaging.objects.filter(product_id__in=product_ids).delete()
            ProductPrice.objects.filter(product_id__in=product_ids).delete()
            products.delete()

        SalesItems.objects.filter(sales__notes__contains=MARKER).delete()
        Sales.objects.filter(notes__contains=MARKER).delete()
        StockAdjustment.objects.filter(reason__contains=MARKER).delete()
        PurchaseItem.objects.filter(purchase__notes__contains=MARKER).delete()
        Purchase.objects.filter(notes__contains=MARKER).delete()
        Vendor.objects.filter(name__contains=MARKER).delete()
        Customer.objects.filter(name__contains=MARKER).delete()

    def _seed(self, today):
        count_cat, _ = UnitCategory.objects.get_or_create(
            code=UnitCategory.CODE_COUNT,
            defaults={'name': 'Count'},
        )
        piece, _ = UnitOfMeasure.objects.get_or_create(
            code='piece',
            defaults={
                'name': 'Piece',
                'symbol': 'pc',
                'category': count_cat,
                'is_category_reference': True,
                'ratio_to_reference': 1,
            },
        )
        warehouse, _ = Warehouse.objects.get_or_create(
            code='MAIN',
            defaults={'name': 'Main Warehouse', 'is_default': True, 'is_active': True},
        )
        if not warehouse.is_default:
            warehouse.is_default = True
            warehouse.save(update_fields=['is_default'])

        grocery, _ = ProductCategory.objects.get_or_create(name='Grocery')
        vendor, _ = Vendor.objects.get_or_create(
            name=f'{MARKER} Vendor',
            defaults={'phone': '0709999001'},
        )
        customer, _ = Customer.objects.get_or_create(
            name=f'{MARKER} Customer',
            defaults={'phone': '0709999002'},
        )

        biscuit = self._product(
            sku=SKU_BISCUIT,
            name='Maryam Biscuits (FEFO demo)',
            barcode='2990000001001',
            category=grocery,
            piece=piece,
            buy=Decimal('8'),
            sell=Decimal('12'),
        )
        milk = self._product(
            sku=SKU_MILK,
            name='Fresh Milk 1L (FEFO demo)',
            barcode='2990000001002',
            category=grocery,
            piece=piece,
            buy=Decimal('45'),
            sell=Decimal('60'),
        )
        biscuit_pack = biscuit.packagings.filter(is_base=True).first()
        milk_pack = milk.packagings.filter(is_base=True).first()

        # Biscuit: 20 expired / 30 soon (7d) / 50 far (90d)
        self._receive_lots(
            vendor=vendor,
            warehouse=warehouse,
            product=biscuit,
            packaging=biscuit_pack,
            lots=[
                ('BIS-EXPIRED', today - timedelta(days=3), 20, Decimal('8')),
                ('BIS-SOON', today + timedelta(days=7), 30, Decimal('8')),
                ('BIS-FAR', today + timedelta(days=90), 50, Decimal('8')),
            ],
        )
        # Milk: 15 expired / 25 soon (10d) / 40 far (45d)
        self._receive_lots(
            vendor=vendor,
            warehouse=warehouse,
            product=milk,
            packaging=milk_pack,
            lots=[
                ('MILK-EXPIRED', today - timedelta(days=2), 15, Decimal('45')),
                ('MILK-SOON', today + timedelta(days=10), 25, Decimal('45')),
                ('MILK-FAR', today + timedelta(days=45), 40, Decimal('45')),
            ],
        )

        return {
            'warehouse': warehouse,
            'vendor': vendor,
            'customer': customer,
            'biscuit': biscuit,
            'milk': milk,
            'biscuit_pack': biscuit_pack,
            'milk_pack': milk_pack,
        }

    def _product(self, *, sku, name, barcode, category, piece, buy, sell):
        product, _ = Product.objects.update_or_create(
            sku=sku,
            defaults={
                'name': name,
                'barcode': barcode,
                'base_uom': piece,
                'category': category,
                'track_inventory': True,
                'track_expiry': True,
                'is_active': True,
                'reorder_level': 20,
                'average_cost': buy,
            },
        )
        pack, _ = ProductPackaging.objects.update_or_create(
            product=product,
            name='Piece',
            defaults={
                'uom': piece,
                'qty_in_base': 1,
                'is_base': True,
                'for_purchase': True,
                'for_sale': True,
                'for_stock': True,
                'is_default_sale': True,
                'is_default_purchase': True,
                'barcode': barcode,
            },
        )
        ProductPrice.objects.update_or_create(
            product=product,
            packaging=pack,
            price_type=ProductPrice.PRICE_PURCHASE,
            currency=1,
            defaults={'amount': buy, 'is_active': True},
        )
        ProductPrice.objects.update_or_create(
            product=product,
            packaging=pack,
            price_type=ProductPrice.PRICE_RETAIL,
            currency=1,
            defaults={'amount': sell, 'is_active': True},
        )
        return product

    def _receive_lots(self, *, vendor, warehouse, product, packaging, lots):
        for lot_number, expiry, qty, cost in lots:
            purchase = Purchase.objects.create(
                vendor=vendor,
                warehouse=warehouse,
                currency=AFN,
                status='received',
                total_amount=Decimal(qty) * cost,
                notes=f'{MARKER} {product.sku} {lot_number}',
            )
            item = PurchaseItem.objects.create(
                purchase=purchase,
                product=product,
                packaging=packaging,
                quantity=qty,
                conversion_factor=1,
                price_per_unit=cost,
                lot_number=lot_number,
                expiry_date=expiry,
            )
            receive_purchase_item(item)
