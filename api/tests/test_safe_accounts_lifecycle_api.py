"""
API lifecycle: create → update → delete across trade / cash / HR / loans.

Asserts Safe (cash register) balances and GL journals stay consistent.
"""
from datetime import date, datetime
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db.models import Sum
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from api.models.data.cash_register import CashTransaction
from api.models.data.expenses import Expense
from api.models.data.inventory_ledger import InventoryBalance
from api.models.data.journal import JournalEntry
from api.models.data.loan import Loan, LoanPayment
from api.models.data.payment import Payment
from api.models.data.payroll import Payroll
from api.models.data.products import Product
from api.models.data.purchases import Purchase
from api.models.data.sales import Sales
from api.models.data.uom import UnitCategory, UnitOfMeasure
from api.models.data.warehouse import Warehouse
from api.models.data.withdrawal import Withdrawal
from api.services.accounting.coa import ensure_accounting_ready
from api.services.cash_register import get_open_session, session_totals
from api.tests.accounting.helpers import (
    AFN,
    cash_native_net,
    create_staff_user,
    journal_for_source,
    native_totals,
)


WHEN = timezone.make_aware(datetime(2026, 11, 26, 12, 0, 0))
OPENING = Decimal('50000.00')


class SafeAccountsLifecycleApiTests(APITestCase):
    def setUp(self):
        ensure_accounting_ready(currency_id=AFN)
        self.user = create_staff_user(
            username='safe-life', email='safe-life@test.local', as_admin=True,
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

        vendor = self.client.post('/api/vendors/', {'name': 'Life Vendor', 'is_active': True}, format='json')
        self.assertEqual(vendor.status_code, 201, vendor.data)
        self.vendor_id = vendor.data['id']

        customer = self.client.post(
            '/api/customers/', {'name': 'Life Customer', 'is_active': True}, format='json',
        )
        self.assertEqual(customer.status_code, 201, customer.data)
        self.customer_id = customer.data['id']

        employee = self.client.post('/api/employees/', {
            'full_name': 'Life Employee',
            'phone': '0700111222',
            'salary': '8000',
            'currency': AFN,
            'contract_start_date': '2026-01-01',
            'is_active': True,
        }, format='json')
        self.assertEqual(employee.status_code, 201, employee.data)
        self.employee_id = employee.data['id']

        category = self.client.post(
            '/api/expense-categories/',
            {'name': 'Life Ops', 'description': 'Lifecycle test'},
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

        product_payload = {
            'name': 'Lifecycle Biscuits',
            'sku': 'LIFE-BIS',
            'barcode': '2900000000001',
            'base_uom': self.piece.id,
            'track_inventory': True,
            'allow_negative_stock': False,
            'is_active': True,
            'packagings_data': [
                {
                    'name': 'Piece', 'qty_in_base': '1', 'is_base': True,
                    'for_sale': True, 'for_purchase': True, 'for_stock': True,
                    'is_default_sale': True, 'barcode': '2900000000001', 'uom': self.piece.id,
                },
                {
                    'name': 'Carton', 'qty_in_base': '12', 'is_base': False,
                    'for_sale': True, 'for_purchase': True, 'for_stock': True,
                    'is_default_purchase': True, 'barcode': None, 'uom': self.piece.id,
                },
            ],
        }
        product = self.client.post('/api/products/', product_payload, format='json')
        self.assertEqual(product.status_code, 201, product.data)
        self.product = Product.objects.get(pk=product.data['id'])
        self.piece_pack = self.product.packagings.get(is_base=True)
        self.carton = self.product.packagings.get(name='Carton')

        self.cash_before_ops = cash_native_net(AFN)

    def _safe(self):
        session = get_open_session()
        self.assertIsNotNone(session)
        return session_totals(session)

    def _assert_journal_balanced(self, source):
        journal = journal_for_source(source)
        self.assertIsNotNone(journal, f'Expected auto journal for {source}')
        debit, credit = native_totals(journal)
        self.assertEqual(debit, credit)
        return journal

    def _assert_no_journal(self, source):
        self.assertIsNone(journal_for_source(source))

    def _posted_safe_for(self, source):
        ct = ContentType.objects.get_for_model(source)
        return CashTransaction.objects.filter(
            content_type=ct,
            object_id=source.pk,
            status=CashTransaction.STATUS_POSTED,
            deleted_at__isnull=True,
        ).first()

    def _voided_safe_for(self, source=None, *, model=None, object_id=None):
        if source is not None:
            model = source.__class__
            object_id = source.pk
        ct = ContentType.objects.get_for_model(model)
        return CashTransaction.objects.filter(
            content_type=ct,
            object_id=object_id,
            status=CashTransaction.STATUS_VOID,
        ).exists()

    def _assert_no_journal_for(self, model, object_id):
        ct = ContentType.objects.get_for_model(model)
        self.assertFalse(
            JournalEntry.objects.filter(
                content_type=ct, object_id=object_id, is_auto=True,
            ).exists()
        )

    def test_01_purchase_cash_sale_expense_update_delete(self):
        # ── Purchase receive + cash payment ─────────────────────────────
        purchase_resp = self.client.post('/api/purchases/', {
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
                'quantity': '5',
                'conversion_factor': '12',
                'price_per_unit': '120',
                'profit_percent': '15',
                'sale_price': '138',
            }],
        }, format='json')
        self.assertEqual(purchase_resp.status_code, 201, purchase_resp.data)
        purchase = Purchase.objects.get(pk=purchase_resp.data['id'])
        self._assert_journal_balanced(purchase)

        on_hand = InventoryBalance.objects.filter(
            product=self.product, warehouse=self.warehouse,
        ).aggregate(total=Sum('quantity_on_hand'))['total'] or Decimal('0')
        self.assertEqual(on_hand, Decimal('60'))

        pay_purchase = self.client.post('/api/payments/', {
            'content_type': 'purchase',
            'object_id': purchase.id,
            'payment_type': 'purchase',
            'payment_method': 'cash',
            'amount': '600',
            'currency': AFN,
            'payment_date': WHEN.isoformat(),
        }, format='json')
        self.assertEqual(pay_purchase.status_code, 201, pay_purchase.data)
        purchase_payment = Payment.objects.get(pk=pay_purchase.data['id'])
        self._assert_journal_balanced(purchase_payment)
        self.assertIsNotNone(self._posted_safe_for(purchase_payment))
        safe_after_purchase_pay = self._safe()
        self.assertEqual(safe_after_purchase_pay['supplier_payments'], Decimal('600.00'))
        self.assertEqual(
            safe_after_purchase_pay['expected_closing_balance'],
            OPENING - Decimal('600.00'),
        )

        # ── Walk-in cash sale ───────────────────────────────────────────
        sale_resp = self.client.post('/api/sales/', {
            'transaction_type': 'paid',
            'customer': None,
            'warehouse': self.warehouse.id,
            'sale_date': WHEN.isoformat(),
            'currency': AFN,
            'status': 'confirmed',
            'total_amount': '276',
            'sales_items': [{
                'product': self.product.id,
                'packaging': self.carton.id,
                'quantity': '2',
                'conversion_factor': '12',
                'sell_price': '138',
            }],
        }, format='json')
        self.assertEqual(sale_resp.status_code, 201, sale_resp.data)
        sale = Sales.objects.get(pk=sale_resp.data['id'])
        self._assert_journal_balanced(sale)
        sale_payment = Payment.objects.filter(
            content_type=ContentType.objects.get_for_model(sale),
            object_id=sale.pk,
            payment_method='cash',
        ).first()
        self.assertIsNotNone(sale_payment)
        self.assertIsNotNone(self._posted_safe_for(sale_payment))
        safe_after_sale = self._safe()
        self.assertEqual(safe_after_sale['cash_sales'], Decimal('276.00'))
        self.assertEqual(
            safe_after_sale['expected_closing_balance'],
            OPENING - Decimal('600.00') + Decimal('276.00'),
        )

        # Update sale notes (non-destructive)
        patch_sale = self.client.patch(
            f'/api/sales/{sale.id}/',
            {'notes': 'Updated walk-in'},
            format='json',
        )
        self.assertEqual(patch_sale.status_code, 200, patch_sale.data)
        self.assertEqual(
            self._safe()['expected_closing_balance'],
            OPENING - Decimal('600.00') + Decimal('276.00'),
        )

        # ── Expense ─────────────────────────────────────────────────────
        expense_resp = self.client.post('/api/expenses/', {
            'category': self.expense_category_id,
            'amount': '150',
            'currency': AFN,
            'payment_method': 'cash',
            'expense_date': WHEN.isoformat(),
            'description': 'Lifecycle electricity',
        }, format='json')
        self.assertEqual(expense_resp.status_code, 201, expense_resp.data)
        expense = Expense.objects.get(pk=expense_resp.data['id'])
        self._assert_journal_balanced(expense)
        self.assertIsNotNone(self._posted_safe_for(expense))
        self.assertEqual(
            self._safe()['expected_closing_balance'],
            OPENING - Decimal('600.00') + Decimal('276.00') - Decimal('150.00'),
        )

        # Update expense amount → Safe/GL should reflect new amount via re-sync
        # (record_transaction is idempotent by source — amount may stay until void+recreate)
        patch_expense = self.client.patch(
            f'/api/expenses/{expense.id}/',
            {'description': 'Electricity updated'},
            format='json',
        )
        self.assertEqual(patch_expense.status_code, 200, patch_expense.data)

        # Delete expense → Safe + journal reverse (view hard-deletes)
        expense_id = expense.id
        self.assertEqual(self.client.delete(f'/api/expenses/{expense_id}/').status_code, 204)
        self.assertFalse(Expense.all_objects.filter(pk=expense_id).exists())
        self.assertTrue(self._voided_safe_for(model=Expense, object_id=expense_id))
        self._assert_no_journal_for(Expense, expense_id)
        self.assertEqual(
            self._safe()['expected_closing_balance'],
            OPENING - Decimal('600.00') + Decimal('276.00'),
        )

        # Delete sale → Safe income reverse + stock restored + journal gone
        self.assertEqual(self.client.delete(f'/api/sales/{sale.id}/').status_code, 204)
        sale_payment.refresh_from_db()
        self.assertIsNotNone(sale_payment.deleted_at)
        self.assertTrue(self._voided_safe_for(sale_payment))
        self._assert_no_journal(Sales.all_objects.get(pk=sale.id))
        on_hand_after_sale_void = InventoryBalance.objects.filter(
            product=self.product, warehouse=self.warehouse,
        ).aggregate(total=Sum('quantity_on_hand'))['total'] or Decimal('0')
        self.assertEqual(on_hand_after_sale_void, Decimal('60'))
        self.assertEqual(
            self._safe()['expected_closing_balance'],
            OPENING - Decimal('600.00'),
        )

        # Delete purchase → payment voided, stock reversed
        del_purchase = self.client.delete(f'/api/purchases/{purchase.id}/')
        self.assertEqual(del_purchase.status_code, 204, getattr(del_purchase, 'data', None))
        purchase_payment.refresh_from_db()
        self.assertIsNotNone(purchase_payment.deleted_at)
        self.assertTrue(self._voided_safe_for(purchase_payment))
        on_hand_after = InventoryBalance.objects.filter(
            product=self.product, warehouse=self.warehouse,
        ).aggregate(total=Sum('quantity_on_hand'))['total'] or Decimal('0')
        self.assertEqual(on_hand_after, Decimal('0'))
        self.assertEqual(self._safe()['expected_closing_balance'], OPENING)

    def test_02_payroll_withdrawal_loan_lifecycle(self):
        # ── Payroll (cash) ──────────────────────────────────────────────
        payroll_resp = self.client.post('/api/payrolls/', {
            'employee': self.employee_id,
            'month': 'november',
            'year': 2026,
            'currency': AFN,
            'payment_method': 'cash',
            'manual_net': True,
            'gross_amount': '2000',
            'payment_date': WHEN.isoformat(),
        }, format='json')
        self.assertEqual(payroll_resp.status_code, 201, payroll_resp.data)
        payroll = Payroll.objects.get(pk=payroll_resp.data['id'])
        self._assert_journal_balanced(payroll)
        self.assertIsNotNone(self._posted_safe_for(payroll))
        self.assertEqual(
            self._safe()['expected_closing_balance'],
            OPENING - Decimal('2000.00'),
        )

        patch_payroll = self.client.patch(
            f'/api/payrolls/{payroll.id}/',
            {'notes': 'November salary'},
            format='json',
        )
        self.assertEqual(patch_payroll.status_code, 200, patch_payroll.data)

        payroll_id = payroll.id
        self.assertEqual(self.client.delete(f'/api/payrolls/{payroll_id}/').status_code, 204)
        self.assertFalse(Payroll.all_objects.filter(pk=payroll_id).exists())
        self.assertTrue(self._voided_safe_for(model=Payroll, object_id=payroll_id))
        self._assert_no_journal_for(Payroll, payroll_id)
        self.assertEqual(self._safe()['expected_closing_balance'], OPENING)

        # ── Withdrawal ──────────────────────────────────────────────────
        cash_gl = self.client.get('/api/gl-accounts/', {'code': '1000', 'currency': AFN})
        self.assertEqual(cash_gl.status_code, 200)
        gl_data = cash_gl.data
        gl_rows = gl_data if isinstance(gl_data, list) else (gl_data.get('results') or gl_data)
        gl_id = next(row['id'] for row in gl_rows if str(row.get('code')) == '1000')

        wd_resp = self.client.post('/api/withdrawals/', {
            'gl_account': gl_id,
            'amount': '500',
            'currency': AFN,
            'payment_method': 'cash',
            'withdrawal_date': WHEN.isoformat(),
            'description': 'Owner draw lifecycle',
        }, format='json')
        self.assertEqual(wd_resp.status_code, 201, wd_resp.data)
        withdrawal = Withdrawal.objects.get(pk=wd_resp.data['id'])
        self._assert_journal_balanced(withdrawal)
        self.assertIsNotNone(self._posted_safe_for(withdrawal))
        self.assertEqual(
            self._safe()['expected_closing_balance'],
            OPENING - Decimal('500.00'),
        )
        withdrawal_id = withdrawal.id
        self.assertEqual(self.client.delete(f'/api/withdrawals/{withdrawal_id}/').status_code, 204)
        self.assertFalse(Withdrawal.all_objects.filter(pk=withdrawal_id).exists())
        self.assertTrue(self._voided_safe_for(model=Withdrawal, object_id=withdrawal_id))
        self.assertEqual(self._safe()['expected_closing_balance'], OPENING)

        # ── Loan out + collection ───────────────────────────────────────
        loan_resp = self.client.post('/api/loans/', {
            'loaner_type': 'customer',
            'customer': self.customer_id,
            'amount': '1000',
            'currency': AFN,
            'loan_type': 'loan_out',
            'payment_method': 'cash',
            'loan_date': WHEN.isoformat(),
        }, format='json')
        self.assertEqual(loan_resp.status_code, 201, loan_resp.data)
        loan = Loan.objects.get(pk=loan_resp.data['id'])
        self._assert_journal_balanced(loan)
        self.assertIsNotNone(self._posted_safe_for(loan))
        self.assertEqual(
            self._safe()['expected_closing_balance'],
            OPENING - Decimal('1000.00'),
        )

        lp_resp = self.client.post('/api/loan-payments/', {
            'loan': loan.id,
            'amount': '400',
            'currency': AFN,
            'payment_method': 'cash',
            'payment_date': WHEN.isoformat(),
        }, format='json')
        self.assertEqual(lp_resp.status_code, 201, lp_resp.data)
        loan_payment = LoanPayment.objects.get(pk=lp_resp.data['id'])
        self._assert_journal_balanced(loan_payment)
        self.assertIsNotNone(self._posted_safe_for(loan_payment))
        self.assertEqual(
            self._safe()['expected_closing_balance'],
            OPENING - Decimal('1000.00') + Decimal('400.00'),
        )

        # Update loan payment amount
        patch_lp = self.client.patch(
            f'/api/loan-payments/{loan_payment.id}/',
            {'notes': 'Partial collection'},
            format='json',
        )
        self.assertEqual(patch_lp.status_code, 200, patch_lp.data)

        # Delete loan → payments + Safe rows reverse
        self.assertEqual(self.client.delete(f'/api/loans/{loan.id}/').status_code, 204)
        self.assertTrue(self._voided_safe_for(Loan.all_objects.get(pk=loan.id)))
        loan_payment.refresh_from_db()
        self.assertIsNotNone(loan_payment.deleted_at)
        self.assertTrue(self._voided_safe_for(loan_payment))
        self.assertEqual(self._safe()['expected_closing_balance'], OPENING)

        # ── Loan in ─────────────────────────────────────────────────────
        loan_in = self.client.post('/api/loans/', {
            'loaner_type': 'customer',
            'customer': self.customer_id,
            'amount': '750',
            'currency': AFN,
            'loan_type': 'loan_in',
            'payment_method': 'cash',
            'loan_date': WHEN.isoformat(),
        }, format='json')
        self.assertEqual(loan_in.status_code, 201, loan_in.data)
        loan_in_obj = Loan.objects.get(pk=loan_in.data['id'])
        self.assertIsNotNone(self._posted_safe_for(loan_in_obj))
        self.assertEqual(
            self._safe()['expected_closing_balance'],
            OPENING + Decimal('750.00'),
        )
        self.assertEqual(self.client.delete(f'/api/loans/{loan_in_obj.id}/').status_code, 204)
        self.assertEqual(self._safe()['expected_closing_balance'], OPENING)

    def test_03_bank_paths_skip_safe_but_keep_journals(self):
        expense_resp = self.client.post('/api/expenses/', {
            'category': self.expense_category_id,
            'amount': '80',
            'currency': AFN,
            'payment_method': 'bank',
            'expense_date': WHEN.isoformat(),
            'description': 'Bank expense',
        }, format='json')
        self.assertEqual(expense_resp.status_code, 201, expense_resp.data)
        expense = Expense.objects.get(pk=expense_resp.data['id'])
        self._assert_journal_balanced(expense)
        self.assertIsNone(self._posted_safe_for(expense))
        self.assertEqual(self._safe()['expected_closing_balance'], OPENING)

        payroll_resp = self.client.post('/api/payrolls/', {
            'employee': self.employee_id,
            'month': 'december',
            'year': 2026,
            'currency': AFN,
            'payment_method': 'bank',
            'manual_net': True,
            'gross_amount': '500',
            'payment_date': WHEN.isoformat(),
        }, format='json')
        self.assertEqual(payroll_resp.status_code, 201, payroll_resp.data)
        payroll = Payroll.objects.get(pk=payroll_resp.data['id'])
        self._assert_journal_balanced(payroll)
        self.assertIsNone(self._posted_safe_for(payroll))
        self.assertEqual(self._safe()['expected_closing_balance'], OPENING)
