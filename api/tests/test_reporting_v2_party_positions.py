from datetime import timedelta
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.journal import JournalEntry, JournalLine, GLAccount
from api.models.data.loan import Loan, LoanPayment
from api.models.data.payment import Payment
from api.models.data.purchases import Purchase as RawMaterialPurchase
from api.models.data.vendors import Vendor
from api.services.reporting.contracts import ReportScope
from api.services.reporting.party_positions import party_loan_balances, party_position_overview
from api.tests.accounting.helpers import TXN_WHEN, create_loan, create_loan_payment, create_confirmed_sale, create_staff_user


class PartyLoanPositionsTests(TestCase):
    def report(self, **params):
        return party_loan_balances(ReportScope.from_params(params))

    def overview(self, **params):
        return party_position_overview(ReportScope.from_params(params))

    def test_partial_repayment_preserves_native_principal(self):
        loan = create_loan(amount=Decimal('100'))
        create_loan_payment(loan=loan, amount=Decimal('30'))
        row = self.report()['rows'][0]
        self.assertEqual((row['principal'], row['repaid'], row['closing_balance']), ('100.0000', '30.0000', '70.0000'))

    def test_future_repayment_cannot_settle_past_principal(self):
        loan = create_loan(amount=Decimal('100'))
        create_loan_payment(loan=loan, amount=Decimal('30'), when=TXN_WHEN + timedelta(days=3))
        self.assertEqual(self.report(end_date=TXN_WHEN.date().isoformat())['rows'][0]['closing_balance'], '100.0000')

    def test_old_loan_opening_and_new_repayment(self):
        loan = create_loan(amount=Decimal('100'), when=TXN_WHEN - timedelta(days=10))
        create_loan_payment(loan=loan, amount=Decimal('30'))
        row = self.report(start_date=TXN_WHEN.date().isoformat())['rows'][0]
        self.assertEqual((row['opening_balance'], row['period_change'], row['closing_balance']), ('100.0000', '-30.0000', '70.0000'))

    def test_loan_in_has_payable_sign(self):
        create_loan(amount=Decimal('100'), loan_type='loan_in', payment_method='bank')
        party = self.report()['parties'][0]
        self.assertEqual((party['loan_in_remaining'], party['closing_balance']), ('100.0000', '-100.0000'))
        self.assertEqual(self.report()['rows'][0]['funding_method'], 'bank')

    def test_opening_loan_is_not_cash_origin(self):
        loan = create_loan(amount=Decimal('100'))
        Loan.objects.filter(pk=loan.pk).update(is_opening_balance=True)
        self.assertEqual(self.report()['rows'][0]['origin'], 'opening')

    def test_overpayment_is_visible_instead_of_clamped(self):
        loan = create_loan(amount=Decimal('100'))
        create_loan_payment(loan=loan, amount=Decimal('110'))
        row = self.report()['rows'][0]
        self.assertEqual(row['closing_balance'], '-10.0000')
        self.assertIn('principal_overpaid', row['issues'])

    def test_deleted_repayment_does_not_settle_loan(self):
        loan = create_loan(amount=Decimal('100'))
        payment = create_loan_payment(loan=loan, amount=Decimal('30'))
        LoanPayment.objects.filter(pk=payment.pk).update(deleted_at=TXN_WHEN)
        self.assertEqual(self.report()['rows'][0]['closing_balance'], '100.0000')

    def test_deleted_loan_is_excluded(self):
        loan = create_loan(amount=Decimal('100'))
        Loan.objects.filter(pk=loan.pk).update(deleted_at=TXN_WHEN)
        self.assertEqual(self.report()['rows'], [])

    def test_paid_cache_is_not_used(self):
        loan = create_loan(amount=Decimal('100'))
        Loan.objects.filter(pk=loan.pk).update(amount_paid=100, is_paid=True)
        self.assertEqual(self.report()['rows'][0]['closing_balance'], '100.0000')

    def test_foreign_currency_amount_is_not_afn_equivalent(self):
        vendor = Vendor.objects.create(name='USD Lender')
        Loan.objects.bulk_create([Loan(vendor=vendor, loaner_type='vendor', loan_type='loan_in', currency=2,
            amount=10, amount_base=800, exchange_rate=80, loan_date=TXN_WHEN)])
        row = self.report(currency=2)['rows'][0]
        self.assertEqual(row['closing_balance'], '10.0000')

    def test_invalid_party_is_flagged_without_assigning_a_name(self):
        Loan.objects.bulk_create([Loan(loaner_type='vendor', loan_type='loan_in', currency=1,
            amount=100, amount_base=100, loan_date=TXN_WHEN)])
        report = self.report()
        self.assertIn('invalid_loan_party', report['rows'][0]['issues'])
        self.assertEqual(report['parties'], [])
        self.assertEqual(self.overview()['unattributed_loan_count'], 1)

    def test_repayment_before_loan_is_reviewed(self):
        loan = create_loan(amount=Decimal('100'))
        create_loan_payment(loan=loan, amount=Decimal('30'), when=TXN_WHEN - timedelta(days=1))
        self.assertIn('repayment_before_loan', self.report()['rows'][0]['issues'])

    def test_intermediary_origin_remains_distinct_and_requires_review(self):
        loan = create_loan(amount=Decimal('100'))
        payment = Payment.objects.bulk_create([Payment(content_type=ContentType.objects.get_for_model(loan),
            object_id=loan.pk, payment_type='purchase', currency=1, amount=100, payment_date=TXN_WHEN)])[0]
        Loan.objects.filter(pk=loan.pk).update(source_payment=payment)
        row = self.report()['rows'][0]
        self.assertEqual(row['origin'], 'intermediary')
        self.assertIn('intermediary_principal_requires_reconciliation', row['issues'])

    def test_customer_invoice_and_loan_are_separate_components(self):
        sale = create_confirmed_sale(amount=Decimal('100'))
        loan = create_loan(amount=Decimal('40'))
        Loan.objects.filter(pk=loan.pk).update(customer=sale.customer)
        rows = self.overview()['rows']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['closing_balance'], '140.0000')
        self.assertEqual({c['kind'] for c in rows[0]['components']}, {'customer_invoices', 'loan_principal'})

    def test_supplier_invoice_and_loan_in_have_same_payable_sign(self):
        vendor = Vendor.objects.create(name='Supplier lender')
        RawMaterialPurchase.objects.create(vendor=vendor, currency=1, total_amount=100, total_amount_base=100,
            status='received', purchase_date=TXN_WHEN)
        Loan.objects.create(vendor=vendor, loaner_type='vendor', loan_type='loan_in', currency=1,
            amount=40, amount_base=40, loan_date=TXN_WHEN)
        self.assertEqual(self.overview()['rows'][0]['closing_balance'], '-140.0000')

    def test_customer_and_vendor_matching_ids_are_not_merged(self):
        sale = create_confirmed_sale(amount=Decimal('100'))
        vendor = Vendor.objects.create(name='Same name')
        Loan.objects.create(vendor=vendor, loaner_type='vendor', loan_type='loan_in', currency=1,
            amount=40, amount_base=40, loan_date=TXN_WHEN)
        self.assertEqual(len(self.overview()['rows']), 2)

    def test_manual_journal_is_counted_not_guessed_from_description(self):
        sale = create_confirmed_sale(amount=Decimal('100'))
        entry = JournalEntry.objects.create(entry_date=TXN_WHEN, is_auto=False, description=sale.customer.name)
        JournalLine.objects.create(journal_entry=entry, gl_account=GLAccount.objects.get(code='1200', currency=1),
            currency=1, debit=99, credit=0, base_debit=99, base_credit=0, exchange_rate=1)
        report = self.overview()
        self.assertEqual(report['rows'][0]['closing_balance'], '100.0000')
        self.assertEqual(report['manual_party_account_journals_not_reconciled'], 1)

    def test_manual_currency_filter_uses_same_party_account_line(self):
        entry = JournalEntry.objects.create(entry_date=TXN_WHEN, is_auto=False)
        for code, currency in [('1200', 1), ('5000', 2)]:
            JournalLine.objects.create(journal_entry=entry, gl_account=GLAccount.objects.get(code=code, currency=1),
                currency=currency, debit=1, credit=0, base_debit=1, base_credit=0, exchange_rate=1)
        self.assertEqual(self.overview(currency=2)['manual_party_account_journals_not_reconciled'], 0)

    def test_read_only_permission_and_pagination(self):
        create_loan(amount=Decimal('100'))
        before = (JournalEntry.objects.count(), JournalLine.objects.count(), ContentType.objects.count())
        self.overview()
        self.assertEqual(before, (JournalEntry.objects.count(), JournalLine.objects.count(), ContentType.objects.count()))
        client = APIClient()
        self.assertIn(client.get('/api/reports/v2/party-loan-balances/').status_code, (401, 403))
        client.force_authenticate(create_staff_user(username='party-positions', email='party-positions@example.com', as_admin=True))
        response = client.get('/api/reports/v2/party-loan-balances/', {'page_size': 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(client.get('/api/reports/v2/party-position-overview/').status_code, 200)
        self.assertEqual(client.get('/api/reports/v2/party-position-overview/', {'account_id': 1}).status_code, 400)
