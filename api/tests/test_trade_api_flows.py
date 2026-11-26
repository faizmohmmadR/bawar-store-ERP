"""
End-to-end API flows: product → purchase → sale → payment.

Covers AFN and FX purchases, expiry/lot stock, oversell, walk-in auto-pay,
barcode conflicts, and related list endpoints.
"""
from datetime import datetime, timedelta
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db.models import Sum
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from api.models.data.currency import BASE_CURRENCY_ID
from api.models.data.inventory_ledger import InventoryBalance, StockMovement
from api.models.data.payment import Payment
from api.models.data.product_packaging import ProductPrice
from api.models.data.products import Product
from api.models.data.purchases import Purchase
from api.models.data.sales import Sales
from api.models.data.stock import Stock
from api.models.data.uom import UnitCategory, UnitOfMeasure
from api.models.data.warehouse import Warehouse
from api.services.accounting.coa import ensure_accounting_ready
from api.tests.accounting.helpers import (
    AFN,
    USD,
    USD_RATE_8720,
    create_exchange_rate,
    create_staff_user,
)


WHEN = timezone.make_aware(datetime(2026, 11, 24, 12, 0, 0))


class TradeApiFlowTests(APITestCase):
    def setUp(self):
        ensure_accounting_ready(currency_id=AFN)
        ensure_accounting_ready(currency_id=USD)
        self.user = create_staff_user(
            username='trade-api', email='trade-api@test.local', as_admin=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

        self.count = UnitCategory.objects.create(code='count', name='Count')
        self.piece = UnitOfMeasure.objects.create(
            category=self.count, code='piece', name='Piece', symbol='pc',
            is_category_reference=True,
        )
        self.warehouse = Warehouse.objects.create(
            code='MAIN', name='Main Warehouse', is_default=True, is_active=True,
        )
        create_exchange_rate(from_currency=USD, rate=USD_RATE_8720, when=WHEN)

        vendor = self.client.post('/api/vendors/', {'name': 'Vendor Trade', 'is_active': True}, format='json')
        self.assertEqual(vendor.status_code, 201, vendor.data)
        self.vendor_id = vendor.data['id']

        customer = self.client.post(
            '/api/customers/', {'name': 'Customer Trade', 'is_active': True}, format='json',
        )
        self.assertEqual(customer.status_code, 201, customer.data)
        self.customer_id = customer.data['id']

    # ── helpers ──────────────────────────────────────────────────────────

    def _create_product(self, *, name, barcode, track_expiry=False, sku=None):
        payload = {
            'name': name,
            'sku': sku or f'SKU-{barcode[-4:]}',
            'barcode': barcode,
            'base_uom': self.piece.id,
            'track_inventory': True,
            'track_expiry': track_expiry,
            'allow_negative_stock': False,
            'is_active': True,
            'packagings_data': [
                {
                    'name': 'Piece',
                    'qty_in_base': '1',
                    'is_base': True,
                    'for_sale': True,
                    'for_purchase': True,
                    'for_stock': True,
                    'is_default_sale': True,
                    'barcode': barcode,
                    'uom': self.piece.id,
                },
                {
                    'name': 'Carton',
                    'qty_in_base': '12',
                    'is_base': False,
                    'for_sale': True,
                    'for_purchase': True,
                    'for_stock': True,
                    'is_default_purchase': True,
                    'barcode': None,
                    'uom': self.piece.id,
                },
            ],
        }
        response = self.client.post('/api/products/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        product = Product.objects.get(pk=response.data['id'])
        piece = product.packagings.get(is_base=True)
        carton = product.packagings.get(name='Carton')
        return product, piece, carton

    def _purchase(
        self,
        *,
        product,
        packaging,
        quantity,
        price_per_unit,
        sale_price,
        currency=AFN,
        status='received',
        profit_percent=15,
        expiry_date=None,
        lot_number=None,
    ):
        payload = {
            'transaction_type': 'paid',
            'vendor': self.vendor_id,
            'warehouse': self.warehouse.id,
            'purchase_date': WHEN.isoformat(),
            'currency': currency,
            'status': status,
            'items': [
                {
                    'product': product.id,
                    'packaging': packaging.id,
                    'quantity': str(quantity),
                    'conversion_factor': str(packaging.qty_in_base),
                    'price_per_unit': str(price_per_unit),
                    'profit_percent': str(profit_percent),
                    'sale_price': str(sale_price),
                    'expiry_date': expiry_date,
                    'lot_number': lot_number,
                },
            ],
        }
        response = self.client.post('/api/purchases/', payload, format='json')
        return response

    def _sale(
        self,
        *,
        product,
        packaging,
        quantity,
        sell_price,
        customer=None,
        status='confirmed',
        currency=AFN,
    ):
        qty = Decimal(str(quantity))
        price = Decimal(str(sell_price))
        payload = {
            'transaction_type': 'paid',
            'customer': customer,
            'warehouse': self.warehouse.id,
            'sale_date': WHEN.isoformat(),
            'currency': currency,
            'status': status,
            'total_amount': str((qty * price).quantize(Decimal('0.0001'))),
            'sales_items': [
                {
                    'product': product.id,
                    'packaging': packaging.id,
                    'quantity': str(quantity),
                    'conversion_factor': str(packaging.qty_in_base),
                    'sell_price': str(sell_price),
                },
            ],
        }
        response = self.client.post('/api/sales/', payload, format='json')
        return response

    def _pay(self, *, order, amount, payment_type, currency=AFN, method='cash'):
        model_name = 'sales' if payment_type == 'sale' else 'purchase'
        payload = {
            'content_type': model_name,
            'object_id': order.id,
            'payment_type': payment_type,
            'payment_method': method,
            'amount': str(amount),
            'currency': currency,
            'payment_date': WHEN.isoformat(),
        }
        return self.client.post('/api/payments/', payload, format='json')

    def _on_hand(self, product_id):
        return InventoryBalance.objects.filter(
            product_id=product_id, warehouse=self.warehouse,
        ).aggregate(total=Sum('quantity_on_hand'))['total'] or Decimal('0')

    # ── cases ────────────────────────────────────────────────────────────

    def test_01_product_create_and_related_reads(self):
        product, piece, carton = self._create_product(
            name='بیسکویت مریم ۲۰۰گ', barcode='8901234567892',
        )
        detail = self.client.get(f'/api/products/{product.id}/')
        self.assertEqual(detail.status_code, 200, detail.data)
        self.assertEqual(len(detail.data.get('packagings') or []), 2)

        packs = self.client.get('/api/product-packagings/', {'product': product.id})
        self.assertEqual(packs.status_code, 200)
        results = packs.data['results'] if isinstance(packs.data, dict) else packs.data
        self.assertGreaterEqual(len(results), 2)

        resolved = self.client.get('/api/stock-movements/resolve-barcode/', {'code': '8901234567892'})
        self.assertEqual(resolved.status_code, 200, resolved.data)
        self.assertEqual(resolved.data['product']['id'], product.id)
        self.assertEqual(resolved.data['packaging']['id'], piece.id)

    def test_02_duplicate_barcode_rejected_then_reuse_after_delete(self):
        first, _, _ = self._create_product(name='Product A', barcode='1112223334445')
        conflict = self.client.post(
            '/api/products/',
            {
                'name': 'Product B',
                'barcode': '1112223334445',
                'base_uom': self.piece.id,
                'packagings_data': [
                    {
                        'name': 'Piece', 'qty_in_base': '1', 'is_base': True,
                        'barcode': '1112223334445', 'uom': self.piece.id,
                    },
                ],
            },
            format='json',
        )
        self.assertEqual(conflict.status_code, 400, conflict.data)

        delete = self.client.delete(f'/api/products/{first.id}/')
        self.assertIn(delete.status_code, (204, 200), getattr(delete, 'data', None))

        reused = self._create_product(name='Product B', barcode='1112223334445', sku='SKU-REUSE')
        self.assertIsNotNone(reused[0].id)

    def test_03_afn_purchase_sale_piece_and_carton_then_payments(self):
        product, piece, carton = self._create_product(
            name='AFN Biscuits', barcode='2000000000001',
        )

        purchase_resp = self._purchase(
            product=product,
            packaging=carton,
            quantity=10,
            price_per_unit='120',
            sale_price='138',
            currency=AFN,
        )
        self.assertEqual(purchase_resp.status_code, 201, purchase_resp.data)
        purchase = Purchase.objects.get(pk=purchase_resp.data['id'])
        self.assertEqual(purchase.exchange_rate, Decimal('1'))
        self.assertEqual(self._on_hand(product.id), Decimal('120'))

        retail = ProductPrice.objects.filter(
            product=product, packaging=carton, price_type='retail', currency=AFN, is_active=True,
        ).first()
        self.assertIsNotNone(retail)
        self.assertEqual(Decimal(retail.amount), Decimal('138.000000'))

        buy = ProductPrice.objects.filter(
            product=product, packaging=carton, price_type='purchase', currency=AFN, is_active=True,
        ).first()
        self.assertIsNotNone(buy)
        self.assertEqual(Decimal(buy.amount), Decimal('120.000000'))

        # Sell 1 carton + 5 pieces
        sale1 = self._sale(
            product=product, packaging=carton, quantity=1, sell_price='138',
            customer=self.customer_id,
        )
        self.assertEqual(sale1.status_code, 201, sale1.data)
        sale2 = self._sale(
            product=product, packaging=piece, quantity=5, sell_price='12',
            customer=self.customer_id,
        )
        self.assertEqual(sale2.status_code, 201, sale2.data)
        self.assertEqual(self._on_hand(product.id), Decimal('103'))  # 120 - 12 - 5

        sale_obj = Sales.objects.get(pk=sale1.data['id'])
        line = sale_obj.sales_items.get()
        self.assertEqual(line.unit_cost, Decimal('10.000000'))  # 120/12
        self.assertTrue(line.cost_is_known)

        # Partial then remaining customer payment
        pay1 = self._pay(order=sale_obj, amount='50', payment_type='sale')
        self.assertEqual(pay1.status_code, 201, pay1.data)
        sale_obj.refresh_from_db()
        self.assertEqual(Decimal(sale_obj.paid_amount), Decimal('50.00'))

        remaining = (
            Decimal(sale_obj.total_amount) - Decimal(sale_obj.paid_amount)
        ).quantize(Decimal('0.01'))
        pay2 = self._pay(order=sale_obj, amount=str(remaining), payment_type='sale')
        self.assertEqual(pay2.status_code, 201, pay2.data)
        sale_obj.refresh_from_db()
        self.assertEqual(
            Decimal(sale_obj.paid_amount).quantize(Decimal('0.01')),
            Decimal(sale_obj.total_amount).quantize(Decimal('0.01')),
        )

        # Vendor purchase payment
        purch_total = Decimal(purchase.total_amount).quantize(Decimal('0.01'))
        purch_pay = self._pay(order=purchase, amount=str(purch_total), payment_type='purchase')
        self.assertEqual(purch_pay.status_code, 201, purch_pay.data)
        purchase.refresh_from_db()
        self.assertEqual(
            Decimal(purchase.paid_amount).quantize(Decimal('0.01')),
            purch_total,
        )

        balances = self.client.get('/api/inventory-balances/', {'product': product.id})
        self.assertEqual(balances.status_code, 200)
        movements = self.client.get('/api/stock-movements/', {'product': product.id})
        self.assertEqual(movements.status_code, 200)
        self.assertGreaterEqual(StockMovement.objects.filter(product=product).count(), 3)

        stock = Stock.objects.get(product=product, warehouse=self.warehouse, condition='good')
        self.assertEqual(stock.piece_amount, Decimal('103.000000'))

    def test_04_usd_purchase_converts_to_afn_prices_and_cost(self):
        product, piece, carton = self._create_product(
            name='USD Biscuits', barcode='2000000000002',
        )
        # 10 USD / carton → 10 * 87.20 = 872 AFN; sale 11.5 USD → 1002.8 AFN
        resp = self._purchase(
            product=product,
            packaging=carton,
            quantity=5,
            price_per_unit='10',
            sale_price='11.5',
            currency=USD,
            profit_percent='15',
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        purchase = Purchase.objects.get(pk=resp.data['id'])
        self.assertEqual(purchase.exchange_rate, USD_RATE_8720)
        self.assertEqual(purchase.total_amount, Decimal('50.0000'))
        self.assertEqual(purchase.total_amount_base, Decimal('4360.0000'))  # 50 * 87.20

        self.assertEqual(self._on_hand(product.id), Decimal('60'))
        product.refresh_from_db()
        # unit cost AFN per piece = 4360 / 60
        self.assertEqual(product.average_cost, Decimal('72.666667'))

        retail = ProductPrice.objects.get(
            product=product, packaging=carton, price_type='retail', currency=AFN, is_active=True,
        )
        self.assertEqual(Decimal(retail.amount), Decimal('1002.800000'))  # 11.5 * 87.2

        # Buy + sale list prices are converted and stored in AFN only.
        self.assertFalse(
            ProductPrice.objects.filter(
                product=product, packaging=carton, currency=USD, is_active=True,
            ).exists()
        )
        purchase_afn = ProductPrice.objects.get(
            product=product, packaging=carton, price_type='purchase', currency=AFN, is_active=True,
        )
        self.assertEqual(Decimal(purchase_afn.amount), Decimal('872.000000'))  # 10 * 87.2

        piece_retail = ProductPrice.objects.get(
            product=product, packaging=piece, price_type='retail', currency=AFN, is_active=True,
        )
        self.assertEqual(Decimal(piece_retail.amount), Decimal('83.566667'))  # 1002.8 / 12

        product_payload = self.client.get(f'/api/products/{product.id}/')
        self.assertEqual(product_payload.status_code, 200, product_payload.data)
        carton_pack = next(
            p for p in product_payload.data['packagings'] if p['id'] == carton.id
        )
        self.assertEqual(carton_pack['retail_price']['currency'], AFN)
        self.assertEqual(Decimal(str(carton_pack['retail_price']['amount'])), Decimal('1002.800000'))
        self.assertEqual(
            [int(r['currency']) for r in carton_pack.get('retail_prices') or []],
            [AFN],
        )

        stock = Stock.objects.get(product=product, warehouse=self.warehouse, condition='good')
        self.assertEqual(stock.currency, AFN)

        sale = self._sale(
            product=product, packaging=carton, quantity=1, sell_price='1002.8',
            customer=self.customer_id,
        )
        self.assertEqual(sale.status_code, 201, sale.data)
        line = Sales.objects.get(pk=sale.data['id']).sales_items.get()
        self.assertEqual(line.unit_cost, Decimal('72.666667'))

    def test_05_usd_purchase_without_rate_fails(self):
        ExchangeRate = __import__('api.models.data.currency', fromlist=['ExchangeRate']).ExchangeRate
        ExchangeRate.objects.all().delete()
        product, _, carton = self._create_product(name='No Rate', barcode='2000000000003')
        resp = self._purchase(
            product=product, packaging=carton, quantity=1,
            price_per_unit='10', sale_price='12', currency=USD,
        )
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_06_expiry_lot_stock_sells_and_oversell_rejected(self):
        product, piece, carton = self._create_product(
            name='Expiry Biscuits', barcode='2000000000004', track_expiry=True,
        )
        resp = self._purchase(
            product=product,
            packaging=carton,
            quantity=2,
            price_per_unit='120',
            sale_price='150',
            currency=AFN,
            expiry_date='2027-06-01',
            lot_number='LOT-A1',
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        bal = InventoryBalance.objects.get(product=product, warehouse=self.warehouse)
        self.assertIsNotNone(bal.lot_id)
        self.assertEqual(bal.quantity_on_hand, Decimal('24'))

        # Sell more than on hand
        oversell = self._sale(
            product=product, packaging=carton, quantity=3, sell_price='150',
            customer=self.customer_id,
        )
        self.assertEqual(oversell.status_code, 400, oversell.data)

        ok = self._sale(
            product=product, packaging=carton, quantity=1, sell_price='150',
            customer=self.customer_id,
        )
        self.assertEqual(ok.status_code, 201, ok.data)
        bal.refresh_from_db()
        self.assertEqual(bal.quantity_on_hand, Decimal('12'))
        self.assertEqual(self._on_hand(product.id), Decimal('12'))

    def test_07_walk_in_sale_auto_cash_payment(self):
        product, _, carton = self._create_product(name='Walk-in Item', barcode='2000000000005')
        self.assertEqual(
            self._purchase(
                product=product, packaging=carton, quantity=5,
                price_per_unit='100', sale_price='120',
            ).status_code,
            201,
        )
        # No customer → walk-in auto pay
        sale = self._sale(
            product=product, packaging=carton, quantity=1, sell_price='120', customer=None,
        )
        self.assertEqual(sale.status_code, 201, sale.data)
        sale_obj = Sales.objects.get(pk=sale.data['id'])
        self.assertEqual(Decimal(sale_obj.paid_amount), Decimal(sale_obj.total_amount))
        ct = ContentType.objects.get_for_model(Sales)
        self.assertEqual(
            Payment.objects.filter(content_type=ct, object_id=sale_obj.id, payment_method='cash').count(),
            1,
        )

    def test_08_draft_purchase_does_not_receive_until_received(self):
        product, _, carton = self._create_product(name='Draft Flow', barcode='2000000000006')
        draft = self._purchase(
            product=product, packaging=carton, quantity=3,
            price_per_unit='50', sale_price='60', status='draft',
        )
        self.assertEqual(draft.status_code, 201, draft.data)
        self.assertEqual(self._on_hand(product.id), Decimal('0'))

        updated = self.client.patch(
            f'/api/purchases/{draft.data["id"]}/',
            {'status': 'received'},
            format='json',
        )
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(self._on_hand(product.id), Decimal('36'))

    def test_09_related_list_filters_after_full_cycle(self):
        product, piece, carton = self._create_product(name='List Cycle', barcode='2000000000007')
        purchase = self._purchase(
            product=product, packaging=carton, quantity=4,
            price_per_unit='80', sale_price='100',
        )
        self.assertEqual(purchase.status_code, 201, purchase.data)
        sale = self._sale(
            product=product, packaging=piece, quantity=3, sell_price='9',
            customer=self.customer_id,
        )
        self.assertEqual(sale.status_code, 201, sale.data)
        sale_obj = Sales.objects.get(pk=sale.data['id'])
        pay_amount = Decimal(sale_obj.total_amount).quantize(Decimal('0.01'))
        pay_resp = self._pay(order=sale_obj, amount=str(pay_amount), payment_type='sale')
        self.assertEqual(pay_resp.status_code, 201, pay_resp.data)

        sales_list = self.client.get('/api/sales/', {'search': 'List'})
        self.assertEqual(sales_list.status_code, 200)
        purchases_list = self.client.get('/api/purchases/', {'vendor': self.vendor_id})
        self.assertEqual(purchases_list.status_code, 200)
        payments_list = self.client.get('/api/payments/', {'payment_type': 'sale'})
        self.assertEqual(payments_list.status_code, 200)
        products_list = self.client.get('/api/products/', {'search': 'List Cycle'})
        self.assertEqual(products_list.status_code, 200)

    def test_12_stock_list_aggregates_lots_per_product(self):
        product, _, carton = self._create_product(
            name='Agg Stock', barcode='2000000000011', track_expiry=True,
        )
        for i, expiry in enumerate(('2027-01-01', '2027-06-01')):
            resp = self._purchase(
                product=product, packaging=carton, quantity=2,
                price_per_unit='100', sale_price='120',
                expiry_date=expiry, lot_number=f'LOT-{i}',
            )
            self.assertEqual(resp.status_code, 201, resp.data)

        # Raw lot balances: 2 rows
        from api.models.data.inventory_ledger import InventoryBalance
        self.assertEqual(
            InventoryBalance.objects.filter(product=product).count(),
            2,
        )

        listed = self.client.get('/api/inventory-balances/', {'aggregate': 'true'})
        self.assertEqual(listed.status_code, 200, listed.data)
        rows = listed.data['results'] if isinstance(listed.data, dict) else listed.data
        mine = [r for r in rows if r['product'] == product.id]
        self.assertEqual(len(mine), 1)
        self.assertEqual(Decimal(mine[0]['quantity_on_hand']), Decimal('48'))
        self.assertEqual(mine[0]['lot_count'], 2)

        # Purchases without lot/expiry should pool into one balance
        product2, _, carton2 = self._create_product(
            name='Pooled Stock', barcode='2000000000012', track_expiry=True,
        )
        for _ in range(3):
            resp = self._purchase(
                product=product2, packaging=carton2, quantity=1,
                price_per_unit='50', sale_price='60',
            )
            self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(
            InventoryBalance.objects.filter(product=product2).count(),
            1,
        )

    def test_10_delete_purchase_reverses_stock(self):
        product, _, carton = self._create_product(name='Delete Stock', barcode='2000000000009')
        purchase = self._purchase(
            product=product, packaging=carton, quantity=4,
            price_per_unit='80', sale_price='100',
        )
        self.assertEqual(purchase.status_code, 201, purchase.data)
        self.assertEqual(self._on_hand(product.id), Decimal('48'))

        deleted = self.client.delete(f'/api/purchases/{purchase.data["id"]}/')
        self.assertEqual(deleted.status_code, 204, getattr(deleted, 'data', None))
        self.assertEqual(self._on_hand(product.id), Decimal('0'))

        # Selling after voided purchase must fail
        sale = self._sale(
            product=product, packaging=carton, quantity=1, sell_price='100',
            customer=self.customer_id,
        )
        self.assertEqual(sale.status_code, 400, sale.data)

    def test_11_cannot_delete_purchase_after_stock_sold(self):
        product, _, carton = self._create_product(name='Sold Then Delete', barcode='2000000000010')
        purchase = self._purchase(
            product=product, packaging=carton, quantity=2,
            price_per_unit='80', sale_price='100',
        )
        self.assertEqual(purchase.status_code, 201, purchase.data)
        sale = self._sale(
            product=product, packaging=carton, quantity=1, sell_price='100',
            customer=self.customer_id,
        )
        self.assertEqual(sale.status_code, 201, sale.data)
        self.assertEqual(self._on_hand(product.id), Decimal('12'))

        deleted = self.client.delete(f'/api/purchases/{purchase.data["id"]}/')
        self.assertEqual(deleted.status_code, 400, getattr(deleted, 'data', None))
        # Stock unchanged when delete is blocked
        self.assertEqual(self._on_hand(product.id), Decimal('12'))
        self.assertTrue(Purchase.objects.filter(pk=purchase.data['id']).exists())

    def test_10_second_usd_receipt_updates_moving_average(self):
        product, _, carton = self._create_product(name='AVCO Mix', barcode='2000000000008')
        first = self._purchase(
            product=product, packaging=carton, quantity=10,
            price_per_unit='10', sale_price='12', currency=USD,
        )
        self.assertEqual(first.status_code, 201, first.data)
        # Later rate change
        create_exchange_rate(
            from_currency=USD, rate=Decimal('90.00'),
            when=WHEN + timedelta(days=1),
        )
        second = self.client.post(
            '/api/purchases/',
            {
                'transaction_type': 'paid',
                'vendor': self.vendor_id,
                'warehouse': self.warehouse.id,
                'purchase_date': (WHEN + timedelta(days=1)).isoformat(),
                'currency': USD,
                'status': 'received',
                'items': [{
                    'product': product.id,
                    'packaging': carton.id,
                    'quantity': '10',
                    'conversion_factor': '12',
                    'price_per_unit': '10',
                    'sale_price': '12',
                    'profit_percent': '20',
                }],
            },
            format='json',
        )
        self.assertEqual(second.status_code, 201, second.data)
        product.refresh_from_db()
        # First: 100 USD * 87.2 = 8720 AFN for 120 pcs → 72.666667
        # Second: 100 USD * 90 = 9000 AFN for 120 pcs
        # AVCO = (8720+9000)/(120+120) = 17720/240 = 73.833333
        self.assertAlmostEqual(float(product.average_cost), 73.833333, places=5)
        self.assertEqual(self._on_hand(product.id), Decimal('240'))
