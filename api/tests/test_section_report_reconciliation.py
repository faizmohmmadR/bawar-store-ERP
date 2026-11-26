"""
Reconcile section reports against source documents.

Creates sales, purchases, expenses, payroll, loans, and stock movements,
then asserts each report KPI matches direct model totals.
"""
from datetime import datetime
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db.models import Sum
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from api.models.data.expenses import Expense, ExpenseCategory
from api.models.data.inventory_ledger import InventoryBalance
from api.models.data.loan import Loan, LoanPayment
from api.models.data.payment import Payment
from api.models.data.payroll import Payroll
from api.models.data.products import Product
from api.models.data.purchases import Purchase
from api.models.data.sales import Sales
from api.models.data.uom import UnitCategory, UnitOfMeasure
from api.models.data.warehouse import Warehouse
from api.services.accounting.coa import ensure_accounting_ready
from api.services.expense_report import get_expense_report
from api.services.hr_report import get_hr_report
from api.services.loan_report import get_loan_report
from api.services.purchase_report import get_purchase_report
from api.services.sales_report import get_sales_report
from api.services.stock_report import get_stock_report
from api.tests.accounting.helpers import AFN, create_staff_user


WHEN = timezone.make_aware(datetime(2026, 11, 26, 12, 0, 0))
DAY = WHEN.date()


class SectionReportReconciliationTests(APITestCase):
    def setUp(self):
        ensure_accounting_ready(currency_id=AFN)
        self.user = create_staff_user(
            username='report-recon', email='report-recon@test.local', as_admin=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

        self.count = UnitCategory.objects.create(code='count', name='Count')
        self.piece = UnitOfMeasure.objects.create(
            category=self.count, code='piece', name='Piece', symbol='pc',
            is_category_reference=True,
        )
        self.warehouse = Warehouse.objects.create(
            code='MAIN', name='Main', is_default=True, is_active=True,
        )

        vendor = self.client.post('/api/vendors/', {'name': 'Recon Vendor', 'is_active': True}, format='json')
        self.assertEqual(vendor.status_code, 201, vendor.data)
        self.vendor_id = vendor.data['id']

        customer = self.client.post(
            '/api/customers/', {'name': 'Recon Customer', 'is_active': True}, format='json',
        )
        self.assertEqual(customer.status_code, 201, customer.data)
        self.customer_id = customer.data['id']

        employee = self.client.post('/api/employees/', {
            'full_name': 'Recon Employee',
            'phone': '0700123456',
            'salary': '5000',
            'currency': AFN,
            'contract_start_date': '2026-01-01',
            'is_active': True,
        }, format='json')
        self.assertEqual(employee.status_code, 201, employee.data)
        self.employee_id = employee.data['id']

        category = self.client.post(
            '/api/expense-categories/',
            {'name': 'Recon Ops'},
            format='json',
        )
        self.assertEqual(category.status_code, 201, category.data)
        self.expense_category_id = category.data['id']

        self.client.post('/api/cash-register/open-session/', {'opening_deposit': '100000'}, format='json')

        product = self.client.post('/api/products/', {
            'name': 'Recon Rice',
            'sku': 'RECON-RICE',
            'barcode': '2900000000999',
            'base_uom': self.piece.id,
            'track_inventory': True,
            'allow_negative_stock': False,
            'is_active': True,
            'packagings_data': [
                {
                    'name': 'Piece', 'qty_in_base': '1', 'is_base': True,
                    'for_sale': True, 'for_purchase': True, 'for_stock': True,
                    'is_default_sale': True, 'barcode': '2900000000999', 'uom': self.piece.id,
                },
                {
                    'name': 'Bag', 'qty_in_base': '10', 'is_base': False,
                    'for_sale': True, 'for_purchase': True, 'for_stock': True,
                    'is_default_purchase': True, 'barcode': None, 'uom': self.piece.id,
                },
            ],
        }, format='json')
        self.assertEqual(product.status_code, 201, product.data)
        self.product = Product.objects.get(pk=product.data['id'])
        self.bag = self.product.packagings.get(name='Bag')

    def test_reports_match_section_source_documents(self):
        # ── Purchase receive + partial cash payment ─────────────────────
        purchase = self.client.post('/api/purchases/', {
            'transaction_type': 'paid',
            'vendor': self.vendor_id,
            'warehouse': self.warehouse.id,
            'purchase_date': WHEN.isoformat(),
            'currency': AFN,
            'exchange_rate': '1',
            'status': 'received',
            'items': [{
                'product': self.product.id,
                'packaging': self.bag.id,
                'quantity': '5',
                'conversion_factor': '10',
                'price_per_unit': '200',
                'profit_percent': '10',
                'sale_price': '220',
            }],
        }, format='json')
        self.assertEqual(purchase.status_code, 201, purchase.data)
        purchase_id = purchase.data['id']
        pay_purchase = self.client.post('/api/payments/', {
            'content_type': 'purchase',
            'object_id': purchase_id,
            'payment_type': 'purchase',
            'payment_method': 'cash',
            'amount': '400',
            'currency': AFN,
            'payment_date': WHEN.isoformat(),
        }, format='json')
        self.assertEqual(pay_purchase.status_code, 201, pay_purchase.data)

        # ── Walk-in cash sale ───────────────────────────────────────────
        sale = self.client.post('/api/sales/', {
            'transaction_type': 'paid',
            'customer': None,
            'warehouse': self.warehouse.id,
            'sale_date': WHEN.isoformat(),
            'currency': AFN,
            'status': 'confirmed',
            'total_amount': '440',
            'sales_items': [{
                'product': self.product.id,
                'packaging': self.bag.id,
                'quantity': '2',
                'conversion_factor': '10',
                'sell_price': '220',
            }],
        }, format='json')
        self.assertEqual(sale.status_code, 201, sale.data)

        # ── Credit customer sale + partial collection ───────────────────
        credit = self.client.post('/api/sales/', {
            'transaction_type': 'paid',
            'customer': self.customer_id,
            'warehouse': self.warehouse.id,
            'sale_date': WHEN.isoformat(),
            'currency': AFN,
            'status': 'confirmed',
            'total_amount': '220',
            'sales_items': [{
                'product': self.product.id,
                'packaging': self.bag.id,
                'quantity': '1',
                'conversion_factor': '10',
                'sell_price': '220',
            }],
        }, format='json')
        self.assertEqual(credit.status_code, 201, credit.data)
        collect = self.client.post('/api/payments/', {
            'content_type': 'sale',
            'object_id': credit.data['id'],
            'payment_type': 'sale',
            'payment_method': 'cash',
            'amount': '100',
            'currency': AFN,
            'payment_date': WHEN.isoformat(),
        }, format='json')
        self.assertEqual(collect.status_code, 201, collect.data)

        # ── Expense ─────────────────────────────────────────────────────
        expense = self.client.post('/api/expenses/', {
            'category': self.expense_category_id,
            'amount': '150',
            'currency': AFN,
            'payment_method': 'cash',
            'expense_date': WHEN.isoformat(),
            'description': 'Recon rent',
        }, format='json')
        self.assertEqual(expense.status_code, 201, expense.data)

        # ── Payroll ─────────────────────────────────────────────────────
        payroll = self.client.post('/api/payrolls/', {
            'employee': self.employee_id,
            'month': 'november',
            'year': 2026,
            'currency': AFN,
            'payment_method': 'cash',
            'manual_net': True,
            'gross_amount': '1200',
            'payment_date': WHEN.isoformat(),
        }, format='json')
        self.assertEqual(payroll.status_code, 201, payroll.data)

        # ── Loan out + collection ───────────────────────────────────────
        loan = self.client.post('/api/loans/', {
            'loaner_type': 'customer',
            'customer': self.customer_id,
            'amount': '800',
            'currency': AFN,
            'loan_type': 'loan_out',
            'payment_method': 'cash',
            'loan_date': WHEN.isoformat(),
        }, format='json')
        self.assertEqual(loan.status_code, 201, loan.data)
        loan_pay = self.client.post('/api/loan-payments/', {
            'loan': loan.data['id'],
            'amount': '250',
            'currency': AFN,
            'payment_method': 'cash',
            'payment_date': WHEN.isoformat(),
        }, format='json')
        self.assertEqual(loan_pay.status_code, 201, loan_pay.data)

        # ── Direct source totals ────────────────────────────────────────
        purchase_obj = Purchase.objects.get(pk=purchase_id)
        purchase_total = Decimal(str(purchase_obj.total_amount_base or purchase_obj.total_amount))
        purchase_paid = Payment.objects.filter(
            content_type=ContentType.objects.get_for_model(purchase_obj),
            object_id=purchase_obj.pk,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        sales_qs = Sales.objects.filter(
            sale_date__date=DAY,
        ).exclude(status__in=['draft', 'cancelled']).exclude(transaction_type='free')
        sales_billed = sum(
            (Decimal(str(s.total_amount_base or s.total_amount)) for s in sales_qs),
            Decimal('0'),
        )
        sales_paid = Decimal('0')
        for sale_row in sales_qs:
            ct = ContentType.objects.get_for_model(sale_row)
            paid = Payment.objects.filter(content_type=ct, object_id=sale_row.pk).aggregate(
                t=Sum('amount'),
            )['t'] or Decimal('0')
            sales_paid += min(paid, Decimal(str(sale_row.total_amount or 0)))

        expense_total = Expense.objects.filter(expense_date__date=DAY).aggregate(
            t=Sum('amount'),
        )['t'] or Decimal('0')
        payroll_total = Payroll.objects.filter(payment_date__date=DAY).aggregate(
            t=Sum('net_salary'),
        )['t'] or Decimal('0')
        loan_principal = Loan.objects.filter(loan_date__date=DAY, loan_type='loan_out').aggregate(
            t=Sum('amount'),
        )['t'] or Decimal('0')
        loan_collected = LoanPayment.objects.filter(payment_date__date=DAY).aggregate(
            t=Sum('amount'),
        )['t'] or Decimal('0')

        on_hand = InventoryBalance.objects.filter(
            product=self.product, warehouse=self.warehouse,
        ).aggregate(t=Sum('quantity_on_hand'))['t'] or Decimal('0')
        # purchased 50 base, sold 30 base → 20 left
        self.assertEqual(on_hand, Decimal('20'))

        # ── Report KPIs ─────────────────────────────────────────────────
        purchase_report = get_purchase_report(start_date=DAY, end_date=DAY)
        self.assertEqual(Decimal(str(purchase_report['kpis']['billed_afn'])), purchase_total)
        self.assertEqual(Decimal(str(purchase_report['kpis']['paid_afn'])), purchase_paid)
        self.assertEqual(
            Decimal(str(purchase_report['kpis']['unpaid_afn'])),
            purchase_total - purchase_paid,
        )
        self.assertEqual(purchase_report['kpis']['invoice_count'], 1)

        sales_report = get_sales_report(start_date=DAY, end_date=DAY)
        self.assertEqual(Decimal(str(sales_report['kpis']['billed_afn'])), sales_billed)
        self.assertEqual(Decimal(str(sales_report['kpis']['collected_afn'])), sales_paid)
        self.assertEqual(
            Decimal(str(sales_report['kpis']['uncollected_afn'])),
            sales_billed - sales_paid,
        )
        self.assertEqual(sales_report['kpis']['invoice_count'], sales_qs.count())

        expense_report = get_expense_report(start_date=DAY, end_date=DAY)
        self.assertEqual(Decimal(str(expense_report['kpis']['total_afn'])), expense_total)
        self.assertEqual(expense_report['kpis']['expense_count'], 1)

        hr_report = get_hr_report(start_date=DAY, end_date=DAY)
        self.assertEqual(Decimal(str(hr_report['kpis']['salary_paid_afn'])), payroll_total)
        self.assertGreaterEqual(hr_report['kpis']['active_headcount'], 1)

        loan_report = get_loan_report(start_date=DAY, end_date=DAY)
        self.assertEqual(
            Decimal(str(loan_report['kpis']['owed_to_me_total_afn'])),
            loan_principal,
        )
        self.assertEqual(
            Decimal(str(loan_report['kpis']['owed_to_me_paid_afn'])),
            loan_collected,
        )
        self.assertEqual(
            Decimal(str(loan_report['kpis']['owed_to_me_balance_afn'])),
            loan_principal - loan_collected,
        )

        stock_report = get_stock_report(start_date=DAY, end_date=DAY)
        self.assertEqual(Decimal(str(stock_report['kpis']['total_on_hand'])), on_hand)
        self.assertGreater(stock_report['kpis']['movement_count'], 0)
        self.assertGreater(stock_report['kpis']['total_value_afn'], 0)

        # ── API endpoints return the same KPIs ──────────────────────────
        for path, key, expected in (
            ('/api/purchases/report/', 'billed_afn', purchase_total),
            ('/api/sales/report/', 'billed_afn', sales_billed),
            ('/api/expenses/report/', 'total_afn', expense_total),
            ('/api/loans/report/', 'owed_to_me_total_afn', loan_principal),
            ('/api/employees/report/', 'salary_paid_afn', payroll_total),
            ('/api/stocks/report/', 'total_on_hand', on_hand),
        ):
            resp = self.client.get(path, {
                'period': 'custom',
                'start_date': DAY.isoformat(),
                'end_date': DAY.isoformat(),
            })
            self.assertEqual(resp.status_code, 200, f'{path}: {getattr(resp, "data", resp.content)}')
            kpis = resp.data.get('kpis') or {}
            self.assertEqual(
                Decimal(str(kpis[key])),
                Decimal(str(expected)),
                f'{path} {key} mismatch',
            )
