"""Raw material sales: stock deduction, dedicated endpoint, journals."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.customers import Customer
from api.models.data.currency import BASE_CURRENCY_ID
from api.models.data.raw_materials import RawMaterial, RawMaterialStock
from api.models.data.sales import Sales, SalesItems
from api.services.accounting.coa import ensure_accounting_ready
from api.tests.accounting.helpers import journal_for_source, native_totals


User = get_user_model()


class RawMaterialSalesTests(TestCase):
    def setUp(self):
        ensure_accounting_ready(currency_id=BASE_CURRENCY_ID)
        self.user = User.objects.create_user(
            username='rm-sales-admin',
            email='rm-sales@example.com',
            password='pass-123',
        )
        self.user.is_admin = True
        self.user.is_superuser = True
        self.user.is_staff = True
        self.user.role = 'admin'
        self.user.save()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.customer = Customer.objects.create(name='RM Buyer', is_active=True)
        self.material = RawMaterial.objects.create(
            name='Chemistry A',
            material_type=RawMaterial.TYPE_CHEMISTRY,
            unit=RawMaterial.UNIT_KG,
        )
        self.stock = RawMaterialStock.objects.create(
            raw_material=self.material,
            quantity=Decimal('100.0000'),
            piece_count=10,
            last_purchase_price=Decimal('50.00'),
        )

    def test_create_raw_material_sale_deducts_stock_and_posts_journal(self):
        payload = {
            'customer': self.customer.id,
            'sale_date': '2026-08-01T12:00:00Z',
            'status': 'confirmed',
            'currency': BASE_CURRENCY_ID,
            'total_amount': '2000',
            'discount': '0',
            'sales_items': [
                {
                    'sale_source': 'raw_material',
                    'raw_material_stock': self.stock.id,
                    'unit': 'kg',
                    'quantity': '25',
                    'piece_count': 2,
                    'sell_price': '80',
                    'liter_amount': '0',
                }
            ],
        }
        response = self.client.post('/api/raw-material-sales/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)

        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, Decimal('75.0000'))
        self.assertEqual(self.stock.piece_count, 8)

        sale = Sales.objects.get(pk=response.data['id'])
        item = sale.sales_items.get()
        self.assertEqual(item.sale_source, SalesItems.SOURCE_RAW_MATERIAL)
        self.assertEqual(Decimal(str(item.unit_cost)), Decimal('50.00'))

        journal = journal_for_source(sale)
        self.assertIsNotNone(journal)
        debit, credit = native_totals(journal)
        self.assertEqual(debit, credit)
        self.assertGreater(debit, 0)

    def test_usd_sale_keeps_line_prices_native_and_stores_afn_reporting_total(self):
        from django.utils import timezone
        from api.tests.accounting.helpers import create_exchange_rate

        create_exchange_rate(
            from_currency=2,
            rate=Decimal('100'),
            when=timezone.now(),
        )
        response = self.client.post(
            '/api/raw-material-sales/',
            {
                'customer': self.customer.pk,
                'currency': 2,
                'sales_items': [
                    {
                        'sale_source': 'raw_material',
                        'raw_material_stock': self.stock.pk,
                        'unit': 'kg',
                        'quantity': '2',
                        'sell_price': '2.50',
                    },
                ],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)

        sale = Sales.objects.get(pk=response.data['id'])
        item = sale.sales_items.get()
        self.assertEqual(item.sell_price, Decimal('2.5000'))
        self.assertEqual(sale.total_amount, Decimal('5.0000'))
        self.assertEqual(sale.exchange_rate, Decimal('100.000000'))
        self.assertEqual(sale.total_amount_base, Decimal('500.00'))

    def test_rejects_non_raw_material_lines(self):
        payload = {
            'customer': self.customer.id,
            'sale_date': '2026-08-01T12:00:00Z',
            'status': 'confirmed',
            'currency': BASE_CURRENCY_ID,
            'sales_items': [
                {
                    'sale_source': 'stock',
                    'quantity': '1',
                    'sell_price': '10',
                    'unit': 'dana',
                    'liter_amount': '0',
                }
            ],
        }
        response = self.client.post('/api/raw-material-sales/', payload, format='json')
        self.assertEqual(response.status_code, 400)

    def test_list_only_raw_material_sales(self):
        # Create via dedicated endpoint
        created = self.client.post(
            '/api/raw-material-sales/',
            {
                'customer': self.customer.id,
                'sale_date': '2026-08-01T12:00:00Z',
                'status': 'confirmed',
                'currency': BASE_CURRENCY_ID,
                'total_amount': '50',
                'discount': '0',
                'sales_items': [
                    {
                        'sale_source': 'raw_material',
                        'raw_material_stock': self.stock.id,
                        'unit': 'kg',
                        'quantity': '5',
                        'sell_price': '10',
                        'liter_amount': '0',
                    }
                ],
            },
            format='json',
        )
        self.assertEqual(created.status_code, 201, created.data)
        response = self.client.get('/api/raw-material-sales/')
        self.assertEqual(response.status_code, 200)
        results = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertEqual(len(results), 1)
