"""
Seed realistic supermarket دخل (cash drawer) demo data and print a verification report.

Usage:
  python manage.py seed_cash_register_demo
  python manage.py seed_cash_register_demo --reset
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from api.models.data.cash_register import CashSession, CashTransaction
from api.models.data.currency import BASE_CURRENCY_ID
from api.models.data.customers import Customer
from api.models.data.expenses import Expense, ExpenseCategory
from api.models.data.payment import Payment
from api.models.data.sales import Sales
from api.models.data.vendors import Vendor
from api.models.data.withdrawal import Withdrawal
from api.services.accounting.coa import ensure_accounting_ready, get_payment_asset_account
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


def _q(v):
    return Decimal(str(v)).quantize(Decimal('0.01'))


class Command(BaseCommand):
    help = 'Seed realistic cash-register (دخل) demo sessions and linked source documents'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Void/close current demo sessions and start fresh Day 1 + Day 2',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        ensure_accounting_ready(currency_id=BASE_CURRENCY_ID)
        User = get_user_model()
        user = User.objects.filter(is_superuser=True).first() or User.objects.first()
        if not user:
            self.stderr.write('No user found — create an admin first.')
            return

        if options['reset']:
            # Soft-delete prior drawer history so the next open is a true first session
            now = timezone.now()
            CashTransaction.objects.filter(deleted_at__isnull=True).update(deleted_at=now)
            CashSession.objects.filter(deleted_at__isnull=True).update(
                deleted_at=now,
                status=CashSession.STATUS_CLOSED,
                closed_at=now,
                closed_by=user,
                notes='Reset by seed_cash_register_demo',
            )
            self.stdout.write(self.style.WARNING('Reset: prior cash sessions/transactions soft-deleted.'))

        # ── Day 1 ──────────────────────────────────────────────────────
        if get_open_session():
            self.stdout.write(self.style.WARNING('Open session already exists — seeding into it.'))
            day1 = get_open_session()
        else:
            day1 = open_session(opening_balance=_q('10000'), user=user, notes='Demo Day 1 — supermarket drawer')
            self.stdout.write(self.style.SUCCESS(f'Opened Day 1: {day1.session_number} @ 10,000 AFN'))

        customer, _ = Customer.objects.get_or_create(
            name='Walk-in / Ahmad Ahmadi',
            defaults={'phone': '0700000001', 'address': 'Kabul'},
        )
        vendor, _ = Vendor.objects.get_or_create(
            name='Kabul Wholesale Supply',
            defaults={'phone': '0700000002'},
        )
        elec_cat, _ = ExpenseCategory.objects.get_or_create(name='Electricity')
        misc_cat, _ = ExpenseCategory.objects.get_or_create(name='Shop Supplies')

        # Cash sales (POS) — linked Payment → drawer
        sale_cash = Sales.objects.create(
            customer=customer,
            sale_date=timezone.now(),
            currency=BASE_CURRENCY_ID,
            status='confirmed',
            total_amount=_q('15000'),
            paid_amount=_q('15000'),
            notes='Demo cash sales Day 1',
        )
        pay_sale = Payment.objects.create(
            content_type=ContentType.objects.get_for_model(sale_cash),
            object_id=sale_cash.pk,
            amount=_q('15000'),
            payment_method='cash',
            payment_type='sale',
            currency=BASE_CURRENCY_ID,
            payment_date=timezone.now(),
            notes='POS cash collection',
        )
        sync_drawer_from_payment(pay_sale, user=user)

        # Split sale: cash 3000 + credit 2000 (only cash hits drawer)
        sale_split = Sales.objects.create(
            customer=customer,
            sale_date=timezone.now(),
            currency=BASE_CURRENCY_ID,
            status='confirmed',
            total_amount=_q('5000'),
            paid_amount=_q('3000'),
            notes='Demo split payment',
        )
        pay_split = Payment.objects.create(
            content_type=ContentType.objects.get_for_model(sale_split),
            object_id=sale_split.pk,
            amount=_q('3000'),
            payment_method='cash',
            payment_type='sale',
            currency=BASE_CURRENCY_ID,
            payment_date=timezone.now(),
            notes='Cash portion of 5,000 sale',
        )
        sync_drawer_from_payment(pay_split, user=user)

        # Customer debt collection (AR) — not a new sale; drawer in only
        record_transaction(
            session=day1,
            direction=CashTransaction.DIRECTION_IN,
            category=CashTransaction.CAT_CUSTOMER_DEBT_COLLECTION,
            amount=_q('2000'),
            description='Customer debt collection — Ahmad Ahmadi',
            user=user,
            posts_own_journal=False,
            skip_session_check=True,
        )

        # Electricity expense
        exp1 = Expense.objects.create(
            category=elec_cat,
            amount=_q('1000'),
            payment_method='cash',
            currency=BASE_CURRENCY_ID,
            expense_date=timezone.now(),
            description='Electricity bill — November',
            user=user,
        )
        sync_drawer_from_expense(exp1, user=user)

        # Shop supplies expense
        exp2 = Expense.objects.create(
            category=misc_cat,
            amount=_q('500'),
            payment_method='cash',
            currency=BASE_CURRENCY_ID,
            expense_date=timezone.now(),
            description='Cleaning supplies',
            user=user,
        )
        sync_drawer_from_expense(exp2, user=user)

        # Supplier payment (cash)
        # Use a synthetic purchase-like payment against vendor via a sale CT workaround:
        # Payment purchase type needs a purchase object — record drawer OUT directly with source expense-like
        record_transaction(
            session=day1,
            direction=CashTransaction.DIRECTION_OUT,
            category=CashTransaction.CAT_SUPPLIER_PAYMENT,
            amount=_q('3000'),
            description=f'Supplier payment — {vendor.name}',
            user=user,
            posts_own_journal=False,
            skip_session_check=True,
        )

        # Owner withdrawal
        cash_gl = get_payment_asset_account('cash', currency_id=BASE_CURRENCY_ID)
        wd = Withdrawal.objects.create(
            gl_account=cash_gl,
            amount=_q('4000'),
            payment_method='cash',
            currency=BASE_CURRENCY_ID,
            withdrawal_date=timezone.now(),
            description='Owner draw — personal',
            recorded_by=user,
        )
        sync_drawer_from_withdrawal(wd, user=user)

        # Customer refund
        record_transaction(
            session=day1,
            direction=CashTransaction.DIRECTION_OUT,
            category=CashTransaction.CAT_CUSTOMER_REFUND,
            amount=_q('200'),
            description='Cash refund — damaged item return',
            user=user,
            posts_own_journal=False,
            skip_session_check=True,
        )

        # Other receipt (manual, posts own journal)
        record_transaction(
            session=day1,
            direction=CashTransaction.DIRECTION_IN,
            category=CashTransaction.CAT_OTHER_RECEIPT,
            amount=_q('150'),
            description='Bottle deposit return from customer',
            user=user,
            posts_own_journal=True,
            skip_session_check=True,
        )

        totals1 = session_totals(day1)
        expected1 = totals1['expected_closing_balance']
        self.stdout.write('── Day 1 totals ──')
        for k in (
            'opening_balance', 'cash_sales', 'customer_debt_collections', 'other_receipts',
            'total_cash_in', 'business_expenses', 'supplier_payments', 'owner_withdrawals',
            'customer_refunds', 'total_cash_out', 'expected_closing_balance',
        ):
            self.stdout.write(f'  {k}: {totals1[k]}')

        # Physical count matches expected; owner removes 9,000 as bank deposit + leaves rest
        actual = expected1
        remove_bank = _q('5000')
        remove_owner = _q('4000')
        carry = _q(actual - remove_bank - remove_owner)
        if carry < 0:
            # Scale removals to leave 10,000 when possible
            carry = _q('10000')
            remove_owner = _q(actual - carry - remove_bank)
            if remove_owner < 0:
                remove_bank = _q(actual - carry)
                remove_owner = _q(0)

        # Build AFN denomination count that sums to actual
        remaining = int(actual)
        dens = [1000, 500, 100, 50, 20, 10, 5, 2, 1]
        count_lines = []
        for d in dens:
            qty, remaining = divmod(remaining, d)
            if qty:
                count_lines.append({'denomination': str(d), 'quantity': qty})

        removals = []
        if remove_bank > 0:
            removals.append({
                'category': CashTransaction.CAT_BANK_DEPOSIT,
                'amount': str(remove_bank),
                'description': 'Evening bank deposit',
            })
        if remove_owner > 0:
            removals.append({
                'category': CashTransaction.CAT_OWNER_WITHDRAWAL,
                'amount': str(remove_owner),
                'description': 'Owner take at close',
            })

        day1 = close_session(
            session=day1,
            actual_closing_balance=actual,
            carry_forward_amount=carry,
            count_lines=count_lines,
            removals=removals,
            user=user,
            notes='Demo Day 1 close — counted OK',
        )
        self.stdout.write(self.style.SUCCESS(
            f'Closed Day 1 — actual={actual}, carry={day1.carry_forward_amount}, '
            f'diff={day1.cash_difference}'
        ))

        # ── Day 2 ──────────────────────────────────────────────────────
        day2 = open_session(user=user, notes='Demo Day 2 — auto carry-forward')
        self.stdout.write(self.style.SUCCESS(
            f'Opened Day 2: {day2.session_number} opening={day2.opening_balance} '
            f'source={day2.opening_source}'
        ))

        sale2 = Sales.objects.create(
            customer=customer,
            sale_date=timezone.now(),
            currency=BASE_CURRENCY_ID,
            status='confirmed',
            total_amount=_q('20000'),
            paid_amount=_q('20000'),
            notes='Demo cash sales Day 2',
        )
        pay2 = Payment.objects.create(
            content_type=ContentType.objects.get_for_model(sale2),
            object_id=sale2.pk,
            amount=_q('20000'),
            payment_method='cash',
            payment_type='sale',
            currency=BASE_CURRENCY_ID,
            payment_date=timezone.now(),
            notes='Day 2 POS cash',
        )
        sync_drawer_from_payment(pay2, user=user)

        record_transaction(
            session=day2,
            direction=CashTransaction.DIRECTION_IN,
            category=CashTransaction.CAT_CUSTOMER_DEBT_COLLECTION,
            amount=_q('1000'),
            description='Debt collection Day 2',
            user=user,
            posts_own_journal=False,
            skip_session_check=True,
        )

        exp3 = Expense.objects.create(
            category=misc_cat,
            amount=_q('2000'),
            payment_method='cash',
            currency=BASE_CURRENCY_ID,
            expense_date=timezone.now(),
            description='Transport / delivery expense',
            user=user,
        )
        sync_drawer_from_expense(exp3, user=user)

        wd2 = Withdrawal.objects.create(
            gl_account=cash_gl,
            amount=_q('5000'),
            payment_method='cash',
            currency=BASE_CURRENCY_ID,
            withdrawal_date=timezone.now(),
            description='Owner draw Day 2',
            recorded_by=user,
        )
        sync_drawer_from_withdrawal(wd2, user=user)

        # Manual bank deposit mid-day
        record_transaction(
            session=day2,
            direction=CashTransaction.DIRECTION_OUT,
            category=CashTransaction.CAT_BANK_DEPOSIT,
            amount=_q('3000'),
            description='Mid-day bank run',
            user=user,
            posts_own_journal=True,
            skip_session_check=True,
        )

        totals2 = session_totals(day2)
        self.stdout.write('── Day 2 totals (session still OPEN) ──')
        for k in (
            'opening_balance', 'opening_source', 'cash_sales', 'customer_debt_collections',
            'total_cash_in', 'business_expenses', 'owner_withdrawals', 'bank_deposits',
            'total_cash_out', 'expected_closing_balance',
        ):
            self.stdout.write(f'  {k}: {totals2[k]}')

        # Sanity checks
        assert day2.opening_source == 'carry_forward', 'Day 2 must carry forward'
        assert totals2['cash_sales'] == _q('20000'), 'Day 2 sales must be 20,000 (not include opening)'
        assert totals2['opening_balance'] == day1.carry_forward_amount

        self.stdout.write(self.style.SUCCESS(
            f"OK — Day 2 cash sales={totals2['cash_sales']} "
            f"(opening {totals2['opening_balance']} excluded from sales). "
            f"Expected drawer={totals2['expected_closing_balance']}"
        ))
        self.stdout.write(
            f'Sessions: closed={CashSession.objects.filter(status="closed").count()}, '
            f'open={CashSession.objects.filter(status="open").count()}, '
            f'txns={CashTransaction.objects.count()}'
        )
