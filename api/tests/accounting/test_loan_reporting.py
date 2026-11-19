from datetime import timedelta
from decimal import Decimal

from django.test import TestCase

from api.models.data.loan import Loan, LoanPayment
from api.services.financial_reports import get_base_currency_report, get_by_currency_report
from api.services.loan_reporting import get_loan_summary
from api.services.operational_report import get_operational_report
from api.services.report_history import build_report_history, resolve_report_sections
from api.tests.accounting.helpers import create_loan, create_loan_payment, create_exchange_rate, TXN_WHEN


class LoanReportingTests(TestCase):
    def history(self, metric, start, end, **kwargs):
        sections, error = resolve_report_sections(metric=metric)
        self.assertIsNone(error)
        return build_report_history(sections=sections, start_date=start, end_date=end, **kwargs)

    def test_prior_loan_and_future_repayments_use_report_cutoff(self):
        loan = create_loan(amount=Decimal('100'), when=TXN_WHEN - timedelta(days=5))
        create_loan_payment(loan=loan, amount=Decimal('20'), when=TXN_WHEN)
        create_loan_payment(loan=loan, amount=Decimal('80'), when=TXN_WHEN + timedelta(days=5))
        end = TXN_WHEN + timedelta(days=1)
        summary = get_loan_summary(TXN_WHEN, end)
        self.assertEqual(summary['loans_receivable'], 80)
        self.assertEqual(summary['loan_collections'], 20)
        self.assertEqual(summary['principal_given'], 0)
        rows, totals = self.history('loans_receivable', TXN_WHEN, end)
        self.assertEqual(totals['amount_base'], 80)
        self.assertEqual(rows[0]['paid_amount'], 20)
        self.assertEqual(rows[0]['remaining_amount'], 80)
        self.assertEqual(rows[0]['status'], 'open')
        self.assertEqual(get_loan_summary()['loans_receivable'], 0)

    def test_fx_repayments_reduce_native_principal_at_booked_rate(self):
        create_exchange_rate(from_currency=2, rate=Decimal('80'), when=TXN_WHEN)
        paid_when = TXN_WHEN + timedelta(days=1)
        create_exchange_rate(from_currency=2, rate=Decimal('90'), when=paid_when)
        loan = create_loan(amount=Decimal('100'), currency=2)
        create_loan_payment(loan=loan, amount=Decimal('50'), when=paid_when)
        summary = get_loan_summary(TXN_WHEN, paid_when)
        self.assertEqual(summary['loan_collections'], 4500)
        self.assertEqual(summary['loans_receivable'], 4000)
        native = get_loan_summary(TXN_WHEN, paid_when, currency=2)
        self.assertEqual(native['loans_receivable'], 50)
        rows, totals = self.history('loans_receivable', TXN_WHEN, paid_when, currency='USD')
        self.assertEqual(totals['amount_base'], 4000)
        create_loan_payment(loan=loan, amount=Decimal('50'), when=paid_when)
        self.assertEqual(get_loan_summary()['loans_receivable'], 0)

    def test_opening_and_intermediary_principal_do_not_inflate_cash(self):
        ordinary = create_loan(amount=Decimal('100'))
        opening = create_loan(amount=Decimal('40'))
        Loan.objects.filter(pk=opening.pk).update(is_opening_balance=True)
        # A linked intermediary loan creates debt without disbursing cash.
        from api.tests.accounting.helpers import create_confirmed_sale, create_order_payment
        sale = create_confirmed_sale(amount=Decimal('20'))
        source = create_order_payment(order=sale, amount=Decimal('10'), payment_type='sale')
        intermediary = create_loan(amount=Decimal('30'), loan_type='loan_in')
        Loan.objects.filter(pk=intermediary.pk).update(source_payment=source)
        summary = get_loan_summary()
        self.assertEqual(summary['principal_given'], 140)
        self.assertEqual(summary['noncash_given'], 40)
        self.assertEqual(summary['loans_given'], 100)
        self.assertEqual(summary['principal_received'], 30)
        self.assertEqual(summary['loans_received'], 0)
        rows, totals = self.history('loans_given', None, None)
        self.assertEqual(totals['amount_base'], 100)
        self.assertEqual(len(rows), 1)
        rows, totals = self.history('principal_given', None, None)
        self.assertEqual(totals['amount_base'], 140)
        self.assertEqual(len(rows), 2)
        self.assertEqual(totals['cash_out'], 0)

    def test_payment_bill_and_account_available_in_history(self):
        loan = create_loan(amount=Decimal('5'), loan_type='loan_in')
        payment = LoanPayment.objects.create(loan=loan, amount=Decimal('0.25'), payment_date=TXN_WHEN, bill_number='B-125', reference_number='BANK-125', payment_method='bank', bill_file='loan_payment_bills/receipt.pdf')
        rows, totals = self.history('loan_repayments', TXN_WHEN, TXN_WHEN, search='B-125')
        self.assertEqual(totals['amount_base'], 0.25)
        self.assertEqual(rows[0]['bill_number'], 'B-125')
        self.assertEqual(rows[0]['payment_method'], 'bank')
        self.assertEqual(rows[0]['reference_number'], 'BANK-125')
        self.assertTrue(rows[0]['bill_file'].endswith('receipt.pdf'))
        self.assertEqual(rows[0]['source_path'], f'/loan-payments/{payment.pk}/edit')

    def test_soft_deleted_payments_and_loans_are_excluded(self):
        loan = create_loan(amount=Decimal('100'))
        payment = create_loan_payment(loan=loan, amount=Decimal('20'))
        payment.soft_delete()
        self.assertEqual(get_loan_summary()['loans_receivable'], 100)
        self.assertEqual(get_loan_summary()['loan_collections'], 0)
        payment.restore()
        loan.soft_delete()
        self.assertEqual(get_loan_summary()['loan_collections'], 0)
        self.assertEqual(get_loan_summary()['loans_receivable'], 0)

    def test_operational_and_native_reports_include_matching_loan_section(self):
        create_loan(amount=Decimal('25'), when=TXN_WHEN - timedelta(days=3))
        loan = create_loan(amount=Decimal('100'), loan_type='loan_in')
        create_loan_payment(loan=loan, amount=Decimal('10'))
        summary = get_loan_summary(TXN_WHEN, TXN_WHEN)
        operational = get_operational_report(start_date=TXN_WHEN, end_date=TXN_WHEN)
        self.assertEqual(operational['financing']['loans_receivable'], 25)
        self.assertEqual(operational['financing']['loans_payable'], 90)
        # Principal activity is period-dated; the 25 loan is prior so only balances.
        self.assertEqual(operational['financing']['principal_given'], 0)
        self.assertEqual(operational['financing']['principal_received'], 100)
        self.assertEqual(operational['financing']['loans_given'], 0)
        self.assertEqual(operational['financing']['loans_received'], 100)
        self.assertEqual(operational['profit']['net_profit_afn'], 0)
        base = get_base_currency_report(start_date=TXN_WHEN, end_date=TXN_WHEN)
        native = get_by_currency_report(start_date=TXN_WHEN, end_date=TXN_WHEN)['by_currency']['AFN']
        self.assertEqual(base['summary']['loan_summary'], summary)
        self.assertEqual(native['loan_summary'], summary)
        self.assertEqual(native['loans_receivable'], 25)

    def test_date_only_end_includes_payments_through_business_day(self):
        from api.utils.date_filters import normalize_date_to
        day = TXN_WHEN.date().isoformat()
        cutoff = normalize_date_to(day)
        loan = create_loan(amount=Decimal('20'), when=TXN_WHEN - timedelta(days=2))
        create_loan_payment(loan=loan, amount=Decimal('0.25'), when=cutoff)
        create_loan_payment(loan=loan, amount=Decimal('0.50'), when=cutoff + timedelta(microseconds=1))
        summary = get_loan_summary(None, day)
        self.assertEqual(summary['loans_receivable'], 19.75)
        self.assertEqual(summary['loan_collections'], 0.25)
        rows, totals = self.history('loans_receivable', None, day)
        self.assertEqual(totals['amount_base'], 19.75)

