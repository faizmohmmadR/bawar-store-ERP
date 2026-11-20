"""
End-to-end demo: seed products, purchases (several cases), sales (several cases), print stock.

  python manage.py demo_uom_flow
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from api.models.data.currency import BASE_CURRENCY_ID
from api.models.data.customers import Customer
from api.models.data.inventory_ledger import InventoryBalance
from api.models.data.product_packaging import ProductPackaging
from api.models.data.products import Product
from api.models.data.purchases import Purchase, PurchaseItem
from api.models.data.sales import Sales, SalesItems
from api.models.data.vendors import Vendor
from api.services.inventory.display import packaging_breakdown
from api.services.inventory.engine import get_default_warehouse, receive_purchase_item, deliver_sale_item
from api.services.uom.conversion import snapshot_factor


class Command(BaseCommand):
    help = 'Run purchase/sale scenarios and print stock balances'

    def handle(self, *args, **options):
        from django.core.management import call_command
        call_command('seed_uom_inventory')

        warehouse = get_default_warehouse()
        vendor, _ = Vendor.objects.get_or_create(
            name='Demo Grocery Vendor',
            defaults={'phone': '0700000001', 'is_active': True},
        )
        customer, _ = Customer.objects.get_or_create(
            name='Demo Shop Customer',
            defaults={'phone': '0700000002', 'is_active': True},
        )

        water = Product.objects.get(sku='WATER-500')
        rice = Product.objects.get(sku='RICE-G')
        oil = Product.objects.get(sku='OIL-ML')

        water_bottle = ProductPackaging.objects.get(product=water, name='Bottle')
        water_carton = ProductPackaging.objects.get(product=water, name='Carton')
        rice_kg = ProductPackaging.objects.get(product=rice, name='Kilogram')
        rice_sack = ProductPackaging.objects.get(product=rice, name='Sack 50kg')
        oil_liter = ProductPackaging.objects.get(product=oil, name='Liter')
        oil_container = ProductPackaging.objects.get(product=oil, name='Container 20L')

        self.stdout.write(self.style.MIGRATE_HEADING('\n=== PURCHASES ==='))

        # Case 1: buy water by carton
        p1 = self._purchase(
            vendor, warehouse,
            [('Water cartons', water, water_carton, Decimal('10'), Decimal('1200'))],
            label='P1 Water 10 cartons @ 1200',
        )
        self._print_balance(water, warehouse, 'after P1')

        # Case 2: buy water by bottle (loose)
        p2 = self._purchase(
            vendor, warehouse,
            [('Water bottles', water, water_bottle, Decimal('24'), Decimal('100'))],
            label='P2 Water 24 bottles @ 100',
        )
        self._print_balance(water, warehouse, 'after P2')

        # Case 3: buy rice by sack
        p3 = self._purchase(
            vendor, warehouse,
            [('Rice sacks', rice, rice_sack, Decimal('2'), Decimal('4500'))],
            label='P3 Rice 2 sacks @ 4500',
        )
        self._print_balance(rice, warehouse, 'after P3')

        # Case 4: mixed oil purchase
        p4 = self._purchase(
            vendor, warehouse,
            [
                ('Oil containers', oil, oil_container, Decimal('3'), Decimal('18000')),
                ('Oil liters', oil, oil_liter, Decimal('10'), Decimal('950')),
            ],
            label='P4 Oil 3 containers + 10 liters',
        )
        self._print_balance(oil, warehouse, 'after P4')

        self.stdout.write(self.style.MIGRATE_HEADING('\n=== SALES ==='))

        # Sale 1: water cartons + bottles
        s1 = self._sale(
            customer, warehouse,
            [
                (water, water_carton, Decimal('2'), Decimal('1350')),
                (water, water_bottle, Decimal('5'), Decimal('120')),
            ],
            label='S1 Water 2 cartons + 5 bottles',
        )
        self._print_balance(water, warehouse, 'after S1')

        # Sale 2: rice by kg
        s2 = self._sale(
            customer, warehouse,
            [(rice, rice_kg, Decimal('25'), Decimal('120'))],
            label='S2 Rice 25 kg',
        )
        self._print_balance(rice, warehouse, 'after S2')

        # Sale 3: oil by liter
        s3 = self._sale(
            customer, warehouse,
            [(oil, oil_liter, Decimal('15'), Decimal('1100'))],
            label='S3 Oil 15 liters',
        )
        self._print_balance(oil, warehouse, 'after S3')

        self.stdout.write(self.style.MIGRATE_HEADING('\n=== FINAL STOCK ==='))
        for product in (water, rice, oil):
            self._print_balance(product, warehouse, 'FINAL')

        self.stdout.write(self.style.SUCCESS(
            f'\nDone. Purchases={[p1.invoice_number, p2.invoice_number, p3.invoice_number, p4.invoice_number]} '
            f'Sales={[s1.invoice_number, s2.invoice_number, s3.invoice_number]}'
        ))

    def _purchase(self, vendor, warehouse, lines, label):
        with transaction.atomic():
            purchase = Purchase.objects.create(
                vendor=vendor,
                warehouse=warehouse,
                purchase_date=timezone.now(),
                status='received',
                currency=BASE_CURRENCY_ID,
                transaction_type='paid',
                notes=label,
            )
            for _name, product, packaging, qty, price in lines:
                item = PurchaseItem.objects.create(
                    purchase=purchase,
                    product=product,
                    packaging=packaging,
                    quantity=qty,
                    conversion_factor=snapshot_factor(packaging),
                    price_per_unit=price,
                )
                receive_purchase_item(item)
            self.stdout.write(f'  ✓ {label} → {purchase.invoice_number}')
            return purchase

    def _sale(self, customer, warehouse, lines, label):
        with transaction.atomic():
            total = sum((qty * price for _, _, qty, price in lines), Decimal('0'))
            sale = Sales.objects.create(
                customer=customer,
                warehouse=warehouse,
                sale_date=timezone.now(),
                status='confirmed',
                currency=BASE_CURRENCY_ID,
                transaction_type='paid',
                total_amount=total,
                notes=label,
            )
            for product, packaging, qty, price in lines:
                item = SalesItems.objects.create(
                    sales=sale,
                    product=product,
                    packaging=packaging,
                    quantity=qty,
                    conversion_factor=snapshot_factor(packaging),
                    sell_price=price,
                )
                deliver_sale_item(item, warehouse=warehouse)
            self.stdout.write(f'  ✓ {label} → {sale.invoice_number}')
            return sale

    def _print_balance(self, product, warehouse, stage):
        bal = InventoryBalance.objects.filter(product=product, warehouse=warehouse).first()
        if not bal:
            self.stdout.write(f'    [{stage}] {product.name}: NO BALANCE')
            return
        packs = list(product.packagings.filter(is_active=True, deleted_at__isnull=True))
        breakdown = packaging_breakdown(bal.quantity_on_hand, packs)
        parts = ', '.join(f'{r["count"]} {r["name"]}' for r in breakdown) or '0'
        uom = getattr(product.base_uom, 'symbol', '') or ''
        self.stdout.write(
            f'    [{stage}] {product.name}: '
            f'on_hand={bal.quantity_on_hand} {uom} | '
            f'avg_cost={bal.average_cost} | '
            f'as [{parts}]'
        )
