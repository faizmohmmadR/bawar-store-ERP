"""Section reports for sales and loans."""
from decimal import Decimal

from django.test import TestCase

from api.services.loan_report import get_loan_report
from api.services.sales_report import get_sales_report
from api.tests.accounting.helpers import TXN_WHEN, create_confirmed_sale, create_loan, create_order_payment


class SalesLoanReportTests(TestCase):
    def test_sales_report_totals_and_currency_bucket(self):
        sale = create_confirmed_sale(amount=Decimal('100'), when=TXN_WHEN)
        create_order_payment(order=sale, amount=Decimal('40'), payment_type='sale', when=TXN_WHEN)
        report = get_sales_report(start_date=TXN_WHEN, end_date=TXN_WHEN)
        self.assertEqual(report['kpis']['billed_afn'], 100.0)
        self.assertEqual(report['kpis']['collected_afn'], 40.0)
        self.assertEqual(report['kpis']['uncollected_afn'], 60.0)
        self.assertNotIn('free', report)
        self.assertNotIn('free_invoice_count', report['kpis'])
        self.assertIn('AFN', report['by_currency'])
        self.assertEqual(report['by_currency']['AFN']['net_billed_native'], 100.0)

    def test_loan_report_sides_total_paid_balance(self):
        create_loan(amount=Decimal('50'), when=TXN_WHEN)
        create_loan(amount=Decimal('20'), loan_type='loan_in', when=TXN_WHEN)
        report = get_loan_report(start_date=TXN_WHEN, end_date=TXN_WHEN)
        kpis = report['kpis']
        self.assertEqual(kpis['owed_to_me_total_afn'], 50.0)
        self.assertEqual(kpis['owed_to_me_paid_afn'], 0.0)
        self.assertEqual(kpis['owed_to_me_balance_afn'], 50.0)
        self.assertEqual(kpis['i_owe_total_afn'], 20.0)
        self.assertEqual(kpis['i_owe_paid_afn'], 0.0)
        self.assertEqual(kpis['i_owe_balance_afn'], 20.0)
        self.assertIn('AFN', report['by_currency'])
        afn = report['by_currency']['AFN']
        self.assertEqual(afn['owed_to_me']['total_native'], 50.0)
        self.assertEqual(afn['i_owe']['total_native'], 20.0)
