from datetime import timedelta
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from api.models.data.customers import Customer
from api.models.data.products import Product
from api.models.data.stock import Stock
from api.models.data.sales import Sales, SalesItems
from api.models.data.salesmen import Salesman
from api.models.data.salesman_commission_payment import SalesmanCommissionPayment
from api.services.salesman_commission import salesman_commission_statement, salesman_commission_earned
from api.views.data.salesmen import SalesmanViewSet


class SalesmanStatementTests(TestCase):
    def setUp(self):
        self.salesman = Salesman.objects.create(name='Commission representative')
        self.customer = Customer.objects.create(name='Statement customer')
        self.stock = Stock.objects.create(product=Product.objects.create(name='Commission stock'), piece_amount=100, buy_price=1)
        self.when = timezone.now().replace(microsecond=0)

    def sale(self, when=None, status='draft'):
        sale = Sales.objects.create(customer=self.customer, salesman=self.salesman, currency=1,
            total_amount=500, sale_date=when or self.when, status=status)
        SalesItems.objects.create(sales=sale, stock=self.stock, unit='bottle', quantity=3, sell_price=100, commission_amount=2)
        SalesItems.objects.create(sales=sale, stock=self.stock, unit='carton', quantity=2, sell_price=100, commission_amount=5)
        return sale  # Whole-invoice commission: 6 + 10 = 16.

    def payment(self, amount=5, when=None):
        return SalesmanCommissionPayment.objects.create(salesman=self.salesman, amount=amount,
            payment_date=when or self.when + timedelta(hours=1), payment_method='cash', reference_number='PAY-REF')

    def test_invoice_lines_are_one_row_with_the_full_commission(self):
        sale = self.sale()
        self.payment()
        data = salesman_commission_statement(self.salesman)
        sales = [row for row in data['entries'] if row['entry_type'] == 'sale']
        self.assertEqual(len(sales), 1)
        self.assertEqual(sales[0]['sale_id'], sale.pk)
        self.assertEqual(sales[0]['invoice_number'], sale.invoice_number)
        self.assertEqual(sales[0]['customer_name'], self.customer.name)
        self.assertEqual(Decimal(sales[0]['commission_amount']), Decimal('16'))
        self.assertEqual(Decimal(data['commission_paid']), Decimal('5'))
        self.assertEqual(Decimal(data['commission_balance']), Decimal('11'))
        self.assertEqual(Decimal(data['commission_earned']), salesman_commission_earned(self.salesman))
        payments = [row for row in data['entries'] if row['entry_type'] == 'payment']
        self.assertEqual(len(payments), 1)
        self.assertIsNone(payments[0]['sale_id'])
        self.assertEqual(payments[0]['reference_number'], 'PAY-REF')

    def test_cancelled_deleted_sales_lines_and_payments_are_excluded(self):
        sale = self.sale()
        deleted_line = SalesItems.objects.create(sales=sale, stock=self.stock, unit='bottle', quantity=1, commission_amount=100)
        deleted_line.soft_delete()
        self.sale(status='cancelled')
        self.sale().soft_delete()
        self.payment().soft_delete()
        data = salesman_commission_statement(self.salesman)
        self.assertEqual(data['sales_count'], 1)
        self.assertEqual(len(data['entries']), 1)
        self.assertEqual(Decimal(data['commission_earned']), Decimal('16'))
        self.assertEqual(Decimal(data['commission_paid']), Decimal('0'))

    def test_filtered_statement_includes_opening_balance_and_payment_dates(self):
        self.sale(when=self.when - timedelta(days=2))
        self.payment(amount=5, when=self.when - timedelta(days=1))
        in_period = self.sale(when=self.when + timedelta(hours=1))
        self.payment(amount=7, when=self.when + timedelta(hours=2))
        self.sale(when=self.when + timedelta(days=3))
        data = salesman_commission_statement(self.salesman, date_from=self.when, date_to=self.when + timedelta(days=1))
        self.assertEqual(Decimal(data['opening_balance']), Decimal('11'))
        self.assertEqual(Decimal(data['commission_earned']), Decimal('16'))
        self.assertEqual(Decimal(data['commission_paid']), Decimal('7'))
        self.assertEqual(Decimal(data['commission_balance']), Decimal('20'))
        self.assertEqual(len(data['entries']), 2)
        self.assertEqual(data['entries'][0]['sale_id'], in_period.pk)

    def test_statement_read_creates_no_records_and_has_no_fifty_line_limit(self):
        sales = Sales.objects.bulk_create([Sales(customer=self.customer, salesman=self.salesman,
            currency=1, total_amount=1, invoice_number=f'STATEMENT-{i}', sale_date=self.when) for i in range(60)])
        SalesItems.objects.bulk_create([SalesItems(sales=sale, stock=self.stock, unit='bottle',
            quantity=1, commission_amount=2) for sale in sales])
        counts = (Sales.objects.count(), SalesItems.objects.count(), SalesmanCommissionPayment.objects.count())
        view = type('OpenSalesmanStatement', (SalesmanViewSet,), {'permission_classes': []}).as_view({'get': 'commission_statement'})
        response = view(APIRequestFactory().get('/'), pk=self.salesman.pk)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data['entries']), 60)
        self.assertEqual(Decimal(response.data['total_commission']), Decimal('120'))
        self.assertEqual(counts, (Sales.objects.count(), SalesItems.objects.count(), SalesmanCommissionPayment.objects.count()))

    def test_statement_does_not_include_another_salesmans_invoices(self):
        self.sale()
        other = Salesman.objects.create(name='Another representative')
        self.assertEqual(salesman_commission_statement(other)['entries'], [])
