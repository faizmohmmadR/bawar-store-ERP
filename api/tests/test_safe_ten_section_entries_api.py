"""
Ten different API data-entry cases across sections.

Each step asserts Safe expected_closing_balance moves (or stays put for bank).
Also covers amount edit so Safe does not stick to the first/preview value.
"""
from datetime import datetime
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from api.models.data.expenses import Expense
from api.models.data.products import Product
from api.models.data.uom import UnitCategory, UnitOfMeasure
from api.models.data.warehouse import Warehouse
from api.services.accounting.coa import ensure_accounting_ready
from api.services.cash_register import get_open_session, session_totals
from api.tests.accounting.helpers import AFN, create_staff_user


WHEN = timezone.make_aware(datetime(2026, 11, 26, 12, 0, 0))
OPENING = Decimal('100000.00')


class SafeTenSectionEntriesApiTests(APITestCase):
    def setUp(self):
        ensure_accounting_ready(currency_id=AFN)
        self.user = create_staff_user(
            username='safe-ten', email='safe-ten@test.local', as_admin=True,
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

        vendor = self.client.post('/api/vendors/', {'name': 'Ten Vendor', 'is_active': True}, format='json')
        self.assertEqual(vendor.status_code, 201, vendor.data)
        self.vendor_id = vendor.data['id']

        customer = self.client.post(
            '/api/customers/', {'name': 'Ten Customer', 'is_active': True}, format='json',
        )
        self.assertEqual(customer.status_code, 201, customer.data)
        self.customer_id = customer.data['id']

        employee = self.client.post('/api/employees/', {
            'full_name': 'Ten Employee',
            'phone': '0700999888',
            'salary': '9000',
            'currency': AFN,
            'contract_start_date': '2026-01-01',
            'is_active': True,
        }, format='json')
        self.assertEqual(employee.status_code, 201, employee.data)
        self.employee_id = employee.data['id']

        category = self.client.post(
            '/api/expense-categories/',
            {'name': 'Ten Ops', 'description': 'Ten cases'},
            format='json',
        )
        self.assertEqual(category.status_code, 201, category.data)
        self.expense_category_id = category.data['id']

        open_resp = self.client.post(
            '/api/cash-register/open-session/',
            {'opening_deposit': str(OPENING)},
            format='json',
        )
        self.assertEqual(open_resp.status_code, 201, open_resp.data)

        product = self.client.post('/api/products/', {
            'name': 'Ten Biscuits',
            'sku': 'TEN-BIS',
            'barcode': '2900000000010',
            'base_uom': self.piece.id,
            'track_inventory': True,
            'allow_negative_stock': False,
            'is_active': True,
            'packagings_data': [
                {
                    'name': 'Piece', 'qty_in_base': '1', 'is_base': True,
                    'for_sale': True, 'for_purchase': True, 'for_stock': True,
                    'is_default_sale': True, 'barcode': '2900000000010', 'uom': self.piece.id,
                },
                {
                    'name': 'Carton', 'qty_in_base': '12', 'is_base': False,
                    'for_sale': True, 'for_purchase': True, 'for_stock': True,
                    'is_default_purchase': True, 'barcode': None, 'uom': self.piece.id,
                },
            ],
        }, format='json')
        self.assertEqual(product.status_code, 201, product.data)
        self.product = Product.objects.get(pk=product.data['id'])
        self.carton = self.product.packagings.get(name='Carton')

        self.expected = OPENING
        self.steps = []

    def _safe_balance(self):
        session = get_open_session()
        self.assertIsNotNone(session, 'Safe must stay open')
        return session_totals(session)['expected_closing_balance']

    def _assert_safe(self, delta, label):
        self.expected = self.expected + Decimal(str(delta))
        actual = self._safe_balance()
        self.assertEqual(
            actual, self.expected,
            f'{label}: Safe={actual} expected={self.expected} (delta {delta})',
        )
        self.steps.append((label, str(delta), str(actual)))

    def test_ten_different_section_entries_update_safe(self):
        # 1) Purchase receive + cash supplier payment
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
                'packaging': self.carton.id,
                'quantity': '10',
                'conversion_factor': '12',
                'price_per_unit': '100',
                'profit_percent': '20',
                'sale_price': '120',
            }],
        }, format='json')
        self.assertEqual(purchase.status_code, 201, purchase.data)
        purchase_id = purchase.data['id']
        self.assertEqual(self._safe_balance(), self.expected)  # receive alone: no Safe move

        pay_purchase = self.client.post('/api/payments/', {
            'content_type': 'purchase',
            'object_id': purchase_id,
            'payment_type': 'purchase',
            'payment_method': 'cash',
            'amount': '1000',
            'currency': AFN,
            'payment_date': WHEN.isoformat(),
        }, format='json')
        self.assertEqual(pay_purchase.status_code, 201, pay_purchase.data)
        self._assert_safe('-1000', '1 purchase cash payment')

        # 2) Walk-in cash sale
        sale = self.client.post('/api/sales/', {
            'transaction_type': 'paid',
            'customer': None,
            'warehouse': self.warehouse.id,
            'sale_date': WHEN.isoformat(),
            'currency': AFN,
            'status': 'confirmed',
            'total_amount': '360',
            'sales_items': [{
                'product': self.product.id,
                'packaging': self.carton.id,
                'quantity': '3',
                'conversion_factor': '12',
                'sell_price': '120',
            }],
        }, format='json')
        self.assertEqual(sale.status_code, 201, sale.data)
        self._assert_safe('360', '2 walk-in cash sale')

        # 3) Credit customer sale (no Safe) + cash collection
        credit_sale = self.client.post('/api/sales/', {
            'transaction_type': 'paid',
            'customer': self.customer_id,
            'warehouse': self.warehouse.id,
            'sale_date': WHEN.isoformat(),
            'currency': AFN,
            'status': 'confirmed',
            'total_amount': '240',
            'sales_items': [{
                'product': self.product.id,
                'packaging': self.carton.id,
                'quantity': '2',
                'conversion_factor': '12',
                'sell_price': '120',
            }],
        }, format='json')
        self.assertEqual(credit_sale.status_code, 201, credit_sale.data)
        self.assertEqual(self._safe_balance(), self.expected)  # credit: Safe unchanged
        collect = self.client.post('/api/payments/', {
            'content_type': 'sale',
            'object_id': credit_sale.data['id'],
            'payment_type': 'sale',
            'payment_method': 'cash',
            'amount': '240',
            'currency': AFN,
            'payment_date': WHEN.isoformat(),
        }, format='json')
        self.assertEqual(collect.status_code, 201, collect.data)
        self._assert_safe('240', '3 customer cash collection')

        # 4) Cash expense create
        expense = self.client.post('/api/expenses/', {
            'category': self.expense_category_id,
            'amount': '150',
            'currency': AFN,
            'payment_method': 'cash',
            'expense_date': WHEN.isoformat(),
            'description': 'Ten electricity',
        }, format='json')
        self.assertEqual(expense.status_code, 201, expense.data)
        expense_id = expense.data['id']
        self._assert_safe('-150', '4 cash expense create')

        # 5) Edit expense amount — Safe must leave the old/preview amount
        patch_expense = self.client.patch(
            f'/api/expenses/{expense_id}/',
            {'amount': '200'},
            format='json',
        )
        self.assertEqual(patch_expense.status_code, 200, patch_expense.data)
        self._assert_safe('-50', '5 expense amount edit 150→200')
        expense_obj = Expense.objects.get(pk=expense_id)
        self.assertEqual(expense_obj.amount, Decimal('200.00'))

        # 6) Bank expense — Safe unchanged
        bank_expense = self.client.post('/api/expenses/', {
            'category': self.expense_category_id,
            'amount': '80',
            'currency': AFN,
            'payment_method': 'bank',
            'expense_date': WHEN.isoformat(),
            'description': 'Ten bank fee',
        }, format='json')
        self.assertEqual(bank_expense.status_code, 201, bank_expense.data)
        self._assert_safe('0', '6 bank expense skips Safe')

        # 7) Cash payroll
        payroll = self.client.post('/api/payrolls/', {
            'employee': self.employee_id,
            'month': 'november',
            'year': 2026,
            'currency': AFN,
            'payment_method': 'cash',
            'manual_net': True,
            'gross_amount': '2500',
            'payment_date': WHEN.isoformat(),
        }, format='json')
        self.assertEqual(payroll.status_code, 201, payroll.data)
        self._assert_safe('-2500', '7 cash payroll')

        # 8) Owner withdrawal
        cash_gl = self.client.get('/api/gl-accounts/', {'code': '1000', 'currency': AFN})
        self.assertEqual(cash_gl.status_code, 200)
        gl_data = cash_gl.data
        gl_rows = gl_data if isinstance(gl_data, list) else (gl_data.get('results') or gl_data)
        gl_id = next(row['id'] for row in gl_rows if str(row.get('code')) == '1000')
        withdrawal = self.client.post('/api/withdrawals/', {
            'gl_account': gl_id,
            'amount': '400',
            'currency': AFN,
            'payment_method': 'cash',
            'withdrawal_date': WHEN.isoformat(),
            'description': 'Ten owner draw',
        }, format='json')
        self.assertEqual(withdrawal.status_code, 201, withdrawal.data)
        self._assert_safe('-400', '8 cash withdrawal')

        # 9) Loan out (cash leaves Safe)
        loan_out = self.client.post('/api/loans/', {
            'loaner_type': 'customer',
            'customer': self.customer_id,
            'amount': '700',
            'currency': AFN,
            'loan_type': 'loan_out',
            'payment_method': 'cash',
            'loan_date': WHEN.isoformat(),
        }, format='json')
        self.assertEqual(loan_out.status_code, 201, loan_out.data)
        self._assert_safe('-700', '9 cash loan out')

        # 10) Loan collection (cash back into Safe)
        loan_pay = self.client.post('/api/loan-payments/', {
            'loan': loan_out.data['id'],
            'amount': '300',
            'currency': AFN,
            'payment_method': 'cash',
            'payment_date': WHEN.isoformat(),
        }, format='json')
        self.assertEqual(loan_pay.status_code, 201, loan_pay.data)
        self._assert_safe('300', '10 loan collection')

        # Final formula check
        self.assertEqual(
            self._safe_balance(),
            OPENING
            - Decimal('1000')   # purchase
            + Decimal('360')    # walk-in sale
            + Decimal('240')    # customer collection
            - Decimal('200')    # expense after edit
            - Decimal('2500')   # payroll
            - Decimal('400')    # withdrawal
            - Decimal('700')    # loan out
            + Decimal('300'),   # loan collection
        )
        self.assertEqual(len(self.steps), 10)
        self.assertEqual(
            [label for label, _, _ in self.steps],
            [
                '1 purchase cash payment',
                '2 walk-in cash sale',
                '3 customer cash collection',
                '4 cash expense create',
                '5 expense amount edit 150→200',
                '6 bank expense skips Safe',
                '7 cash payroll',
                '8 cash withdrawal',
                '9 cash loan out',
                '10 loan collection',
            ],
        )
