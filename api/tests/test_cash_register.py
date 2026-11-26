"""Cash drawer (دخل) session, carry-forward, and module sync tests."""
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from django.utils import timezone

from api.models.data.cash_register import CashSession, CashTransaction
from api.models.data.currency import BASE_CURRENCY_ID
from api.models.data.expenses import Expense, ExpenseCategory
from api.models.data.payment import Payment
from api.models.data.withdrawal import Withdrawal
from api.services.accounting.coa import ensure_accounting_ready
from api.services.cash_register import (
    close_session,
    get_open_session,
    open_session,
    record_transaction,
    session_totals,
    sync_drawer_from_expense,
    sync_drawer_from_payment,
    sync_drawer_from_withdrawal,
)
from api.tests.accounting.helpers import create_staff_user


class CashRegisterSessionTests(TestCase):
    def setUp(self):
        ensure_accounting_ready(currency_id=BASE_CURRENCY_ID)
        self.user = create_staff_user(username='cashier1', email='c1@test.local', as_admin=True)

    def test_open_first_session_requires_opening_balance(self):
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            open_session(user=self.user)

    def test_daily_opening_deposit_on_top_of_carry(self):
        s1 = open_session(opening_deposit=Decimal('10000'), user=self.user)
        close_session(
            session=s1,
            actual_closing_balance=Decimal('10000'),
            carry_forward_amount=Decimal('10000'),
            user=self.user,
        )
        s2 = open_session(opening_deposit=Decimal('2000'), user=self.user)
        self.assertEqual(s2.opening_balance, Decimal('12000.00'))
        self.assertEqual(s2.opening_source, 'carry_forward_plus_deposit')
        # Deposit is opening cash, not counted as day's sales income
        totals = session_totals(s2)
        self.assertEqual(totals['opening_balance'], Decimal('12000.00'))
        self.assertEqual(totals['cash_sales'], Decimal('0.00'))
        self.assertEqual(totals['total_cash_in'], Decimal('0.00'))

    def test_open_first_session_and_reject_second(self):
        from rest_framework.exceptions import ValidationError
        s1 = open_session(opening_balance=Decimal('10000'), user=self.user)
        self.assertEqual(s1.opening_balance, Decimal('10000.00'))
        self.assertEqual(s1.opening_source, 'manual')
        self.assertEqual(s1.status, CashSession.STATUS_OPEN)
        with self.assertRaises(ValidationError):
            open_session(opening_balance=Decimal('1'), user=self.user)

    def test_carry_forward_to_next_session(self):
        s1 = open_session(opening_balance=Decimal('10000'), user=self.user)
        record_transaction(
            session=s1, direction='in', category=CashTransaction.CAT_CASH_SALE,
            amount=Decimal('9000'), user=self.user, skip_session_check=True,
        )
        close_session(
            session=s1,
            actual_closing_balance=Decimal('19000'),
            carry_forward_amount=Decimal('10000'),
            removals=[{
                'category': CashTransaction.CAT_OWNER_WITHDRAWAL,
                'amount': '9000',
                'description': 'Owner take at close',
            }],
            user=self.user,
        )
        s1.refresh_from_db()
        self.assertEqual(s1.status, CashSession.STATUS_CLOSED)
        self.assertEqual(s1.carry_forward_amount, Decimal('10000.00'))

        s2 = open_session(user=self.user)
        self.assertEqual(s2.opening_balance, Decimal('10000.00'))
        self.assertEqual(s2.opening_source, 'carry_forward')

    def test_day1_scenario_totals(self):
        session = open_session(opening_balance=Decimal('10000'), user=self.user)
        record_transaction(
            session=session, direction='in', category=CashTransaction.CAT_CASH_SALE,
            amount=Decimal('15000'), user=self.user, skip_session_check=True,
        )
        record_transaction(
            session=session, direction='in', category=CashTransaction.CAT_CUSTOMER_DEBT_COLLECTION,
            amount=Decimal('2000'), user=self.user, skip_session_check=True,
        )
        record_transaction(
            session=session, direction='out', category=CashTransaction.CAT_BUSINESS_EXPENSE,
            amount=Decimal('1000'), user=self.user, skip_session_check=True,
        )
        record_transaction(
            session=session, direction='out', category=CashTransaction.CAT_SUPPLIER_PAYMENT,
            amount=Decimal('3000'), user=self.user, skip_session_check=True,
        )
        record_transaction(
            session=session, direction='out', category=CashTransaction.CAT_OWNER_WITHDRAWAL,
            amount=Decimal('4000'), user=self.user, skip_session_check=True,
        )
        totals = session_totals(session)
        self.assertEqual(totals['cash_sales'], Decimal('15000.00'))
        self.assertEqual(totals['expected_closing_balance'], Decimal('19000.00'))
        # Opening must not inflate today's sales
        self.assertEqual(totals['opening_balance'], Decimal('10000.00'))
        self.assertNotEqual(totals['cash_sales'], totals['opening_balance'] + totals['cash_sales'])

    def test_day2_sales_not_including_opening(self):
        s1 = open_session(opening_balance=Decimal('10000'), user=self.user)
        record_transaction(
            session=s1, direction='in', category=CashTransaction.CAT_CASH_SALE,
            amount=Decimal('9000'), user=self.user, skip_session_check=True,
        )
        close_session(
            session=s1,
            actual_closing_balance=Decimal('19000'),
            carry_forward_amount=Decimal('10000'),
            removals=[{
                'category': CashTransaction.CAT_OWNER_WITHDRAWAL,
                'amount': '9000',
            }],
            user=self.user,
        )
        s2 = open_session(user=self.user)
        record_transaction(
            session=s2, direction='in', category=CashTransaction.CAT_CASH_SALE,
            amount=Decimal('20000'), user=self.user, skip_session_check=True,
        )
        record_transaction(
            session=s2, direction='in', category=CashTransaction.CAT_CUSTOMER_DEBT_COLLECTION,
            amount=Decimal('1000'), user=self.user, skip_session_check=True,
        )
        record_transaction(
            session=s2, direction='out', category=CashTransaction.CAT_BUSINESS_EXPENSE,
            amount=Decimal('2000'), user=self.user, skip_session_check=True,
        )
        record_transaction(
            session=s2, direction='out', category=CashTransaction.CAT_OWNER_WITHDRAWAL,
            amount=Decimal('5000'), user=self.user, skip_session_check=True,
        )
        totals = session_totals(s2)
        self.assertEqual(totals['cash_sales'], Decimal('20000.00'))
        self.assertEqual(totals['expected_closing_balance'], Decimal('24000.00'))

    def test_closed_session_rejects_transactions(self):
        from rest_framework.exceptions import ValidationError
        s1 = open_session(opening_balance=Decimal('1000'), user=self.user)
        close_session(
            session=s1,
            actual_closing_balance=Decimal('1000'),
            carry_forward_amount=Decimal('1000'),
            user=self.user,
        )
        s1.refresh_from_db()
        with self.assertRaises(ValidationError):
            record_transaction(
                session=s1, direction='in', category=CashTransaction.CAT_CASH_SALE,
                amount=Decimal('100'), user=self.user,
            )

    def test_shortage_and_overage_require_reason(self):
        from rest_framework.exceptions import ValidationError
        s1 = open_session(opening_balance=Decimal('1000'), user=self.user)
        with self.assertRaises(ValidationError):
            close_session(
                session=s1,
                actual_closing_balance=Decimal('900'),
                carry_forward_amount=Decimal('900'),
                user=self.user,
            )
        s1 = get_open_session()
        closed = close_session(
            session=s1,
            actual_closing_balance=Decimal('1100'),
            carry_forward_amount=Decimal('1100'),
            difference_reason='Found extra note',
            user=self.user,
        )
        self.assertEqual(closed.cash_difference, Decimal('100.00'))

    def test_denomination_count(self):
        s1 = open_session(opening_balance=Decimal('0'), user=self.user)
        closed = close_session(
            session=s1,
            actual_closing_balance=Decimal('0'),  # will be replaced by count
            carry_forward_amount=Decimal('0'),
            count_lines=[
                {'denomination': '1000', 'quantity': 10},
                {'denomination': '500', 'quantity': 2},
            ],
            difference_reason='count align',
            user=self.user,
        )
        # 1000*10 + 500*2 = 11000
        self.assertEqual(closed.actual_closing_balance, Decimal('11000.00'))
        self.assertEqual(closed.count_lines.count(), 2)

    def test_duplicate_source_prevention(self):
        session = open_session(opening_balance=Decimal('5000'), user=self.user)
        cat = ExpenseCategory.objects.create(name='Electricity')
        expense = Expense.objects.create(
            category=cat,
            amount=Decimal('1000'),
            payment_method='cash',
            currency=BASE_CURRENCY_ID,
            expense_date=timezone.now(),
            description='Power',
            user=self.user,
        )
        t1 = sync_drawer_from_expense(expense, user=self.user)
        t2 = sync_drawer_from_expense(expense, user=self.user)
        self.assertIsNotNone(t1)
        self.assertEqual(t1.pk, t2.pk)
        self.assertEqual(
            CashTransaction.objects.filter(
                content_type=ContentType.objects.get_for_model(expense),
                object_id=expense.pk,
            ).count(),
            1,
        )


class CashRegisterModuleSyncTests(TestCase):
    def setUp(self):
        ensure_accounting_ready(currency_id=BASE_CURRENCY_ID)
        self.user = create_staff_user(username='cashier2', email='c2@test.local', as_admin=True)
        open_session(opening_balance=Decimal('10000'), user=self.user)

    def test_cash_sale_payment_increases_drawer(self):
        from api.models.data.customers import Customer
        from api.models.data.sales import Sales

        customer = Customer.objects.create(name='Walk-in Test')
        sale = Sales.objects.create(
            customer=customer,
            sale_date=timezone.now(),
            currency=BASE_CURRENCY_ID,
            status='confirmed',
            total_amount=Decimal('5000'),
        )
        payment = Payment.objects.create(
            content_type=ContentType.objects.get_for_model(sale),
            object_id=sale.pk,
            amount=Decimal('3000'),
            payment_method='cash',
            payment_type='sale',
            currency=BASE_CURRENCY_ID,
            payment_date=timezone.now(),
            exchange_rate=Decimal('1'),
        )
        txn = sync_drawer_from_payment(payment, user=self.user)
        self.assertIsNotNone(txn)
        self.assertEqual(txn.amount, Decimal('3000.00'))
        self.assertEqual(txn.category, CashTransaction.CAT_CASH_SALE)
        self.assertEqual(txn.direction, CashTransaction.DIRECTION_IN)

    def test_deleting_cash_sale_reverses_safe_income(self):
        """Cash that entered the Safe from a sale must leave again when the sale is deleted."""
        from api.models.data.customers import Customer
        from api.models.data.sales import Sales
        from api.services.cash_register import void_drawer_for_source

        # setUp already opened Safe with 10,000 AFN.
        customer = Customer.objects.create(name='Delete Sale Cust')
        sale = Sales.objects.create(
            customer=customer,
            sale_date=timezone.now(),
            currency=BASE_CURRENCY_ID,
            status='confirmed',
            total_amount=Decimal('2500'),
            total_amount_base=Decimal('2500'),
        )
        payment = Payment.objects.create(
            content_type=ContentType.objects.get_for_model(sale),
            object_id=sale.pk,
            amount=Decimal('2500'),
            payment_method='cash',
            payment_type='sale',
            currency=BASE_CURRENCY_ID,
            payment_date=timezone.now(),
            exchange_rate=Decimal('1'),
        )
        txn = sync_drawer_from_payment(payment, user=self.user)
        self.assertIsNotNone(txn)

        before = session_totals(get_open_session())
        self.assertEqual(before['cash_sales'], Decimal('2500.00'))
        self.assertEqual(before['expected_closing_balance'], Decimal('12500.00'))

        sale.soft_delete(user=self.user)
        payment.refresh_from_db()
        self.assertIsNotNone(payment.deleted_at)

        txn.refresh_from_db()
        self.assertEqual(txn.status, CashTransaction.STATUS_VOID)

        after = session_totals(get_open_session())
        self.assertEqual(after['cash_sales'], Decimal('0.00'))
        self.assertEqual(after['expected_closing_balance'], Decimal('10000.00'))
        # Idempotent
        self.assertEqual(void_drawer_for_source(payment), 0)

    def test_bank_payment_ignored(self):
        from api.models.data.customers import Customer
        from api.models.data.sales import Sales

        customer = Customer.objects.create(name='Bank Pay Cust')
        sale = Sales.objects.create(
            customer=customer,
            sale_date=timezone.now(),
            currency=BASE_CURRENCY_ID,
            status='confirmed',
            total_amount=Decimal('3000'),
        )
        payment = Payment.objects.create(
            content_type=ContentType.objects.get_for_model(sale),
            object_id=sale.pk,
            amount=Decimal('3000'),
            payment_method='bank',
            payment_type='sale',
            currency=BASE_CURRENCY_ID,
            payment_date=timezone.now(),
            exchange_rate=Decimal('1'),
        )
        self.assertIsNone(sync_drawer_from_payment(payment, user=self.user))

    def test_expense_decreases_cash(self):
        cat = ExpenseCategory.objects.create(name='Utilities')
        expense = Expense.objects.create(
            category=cat,
            amount=Decimal('1000'),
            payment_method='cash',
            currency=BASE_CURRENCY_ID,
            expense_date=timezone.now(),
            description='Electricity',
            user=self.user,
        )
        txn = sync_drawer_from_expense(expense, user=self.user)
        self.assertEqual(txn.category, CashTransaction.CAT_BUSINESS_EXPENSE)
        self.assertEqual(txn.direction, CashTransaction.DIRECTION_OUT)
        totals = session_totals(get_open_session())
        self.assertEqual(totals['business_expenses'], Decimal('1000.00'))

    def test_owner_withdrawal_not_expense(self):
        from api.services.accounting.coa import get_payment_asset_account

        cash_gl = get_payment_asset_account('cash', currency_id=BASE_CURRENCY_ID)
        wd = Withdrawal.objects.create(
            gl_account=cash_gl,
            amount=Decimal('4000'),
            payment_method='cash',
            currency=BASE_CURRENCY_ID,
            withdrawal_date=timezone.now(),
            description='Owner draw',
            recorded_by=self.user,
        )
        txn = sync_drawer_from_withdrawal(wd, user=self.user)
        self.assertEqual(txn.category, CashTransaction.CAT_OWNER_WITHDRAWAL)
        totals = session_totals(get_open_session())
        self.assertEqual(totals['owner_withdrawals'], Decimal('4000.00'))
        self.assertEqual(totals['business_expenses'], Decimal('0.00'))

    def test_deleting_cash_purchase_reverses_safe_outcome(self):
        """Cash paid to a supplier must return to the Safe when that purchase is deleted."""
        from api.models.data.purchases import Purchase
        from api.models.data.vendors import Vendor
        from api.models.data.warehouse import Warehouse

        vendor = Vendor.objects.create(name='Safe Purchase Vendor')
        warehouse = Warehouse.objects.create(name='Safe WH', code='SAFE-WH')
        purchase = Purchase.objects.create(
            vendor=vendor,
            warehouse=warehouse,
            purchase_date=timezone.now(),
            currency=BASE_CURRENCY_ID,
            status='received',
            total_amount=Decimal('1800'),
            total_amount_base=Decimal('1800'),
        )
        payment = Payment.objects.create(
            content_type=ContentType.objects.get_for_model(purchase),
            object_id=purchase.pk,
            amount=Decimal('1800'),
            payment_method='cash',
            payment_type='purchase',
            currency=BASE_CURRENCY_ID,
            payment_date=timezone.now(),
            exchange_rate=Decimal('1'),
        )
        txn = sync_drawer_from_payment(payment, user=self.user)
        self.assertIsNotNone(txn)
        self.assertEqual(txn.direction, CashTransaction.DIRECTION_OUT)

        before = session_totals(get_open_session())
        self.assertEqual(before['supplier_payments'], Decimal('1800.00'))
        self.assertEqual(before['expected_closing_balance'], Decimal('8200.00'))

        purchase.soft_delete(user=self.user)
        payment.refresh_from_db()
        self.assertIsNotNone(payment.deleted_at)
        txn.refresh_from_db()
        self.assertEqual(txn.status, CashTransaction.STATUS_VOID)

        after = session_totals(get_open_session())
        self.assertEqual(after['supplier_payments'], Decimal('0.00'))
        self.assertEqual(after['expected_closing_balance'], Decimal('10000.00'))

    def test_deleting_expense_reverses_safe_outcome(self):
        cat = ExpenseCategory.objects.create(name='Rent')
        expense = Expense.objects.create(
            category=cat,
            amount=Decimal('500'),
            payment_method='cash',
            currency=BASE_CURRENCY_ID,
            expense_date=timezone.now(),
            description='Shop rent',
            user=self.user,
        )
        txn = sync_drawer_from_expense(expense, user=self.user)
        self.assertEqual(session_totals(get_open_session())['expected_closing_balance'], Decimal('9500.00'))

        expense.soft_delete(user=self.user)
        txn.refresh_from_db()
        self.assertEqual(txn.status, CashTransaction.STATUS_VOID)
        self.assertEqual(session_totals(get_open_session())['expected_closing_balance'], Decimal('10000.00'))

    def test_deleting_withdrawal_reverses_safe_outcome(self):
        from api.services.accounting.coa import get_payment_asset_account

        cash_gl = get_payment_asset_account('cash', currency_id=BASE_CURRENCY_ID)
        wd = Withdrawal.objects.create(
            gl_account=cash_gl,
            amount=Decimal('700'),
            payment_method='cash',
            currency=BASE_CURRENCY_ID,
            withdrawal_date=timezone.now(),
            description='Owner take',
            recorded_by=self.user,
        )
        txn = sync_drawer_from_withdrawal(wd, user=self.user)
        self.assertEqual(session_totals(get_open_session())['expected_closing_balance'], Decimal('9300.00'))

        wd.soft_delete(user=self.user)
        txn.refresh_from_db()
        self.assertEqual(txn.status, CashTransaction.STATUS_VOID)
        self.assertEqual(session_totals(get_open_session())['expected_closing_balance'], Decimal('10000.00'))
