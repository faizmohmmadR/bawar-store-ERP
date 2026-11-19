"""Section reports for sales and loans."""
from decimal import Decimal

from django.test import TestCase

from api.models.data.sales import Sales, SalesItems
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
        self.assertIn('AFN', report['by_currency'])
        self.assertEqual(report['by_currency']['AFN']['net_billed_native'], 100.0)

    def test_sales_report_free_section_separate_from_paid(self):
        paid = create_confirmed_sale(amount=Decimal('100'), when=TXN_WHEN)
        create_order_payment(order=paid, amount=Decimal('100'), payment_type='sale', when=TXN_WHEN)
        free = create_confirmed_sale(amount=Decimal('0'), when=TXN_WHEN)
        Sales.objects.filter(pk=free.pk).update(transaction_type='free', total_amount=0, total_amount_base=0)
        # Helper line is 1 dana/piece @ unit_cost 15 → 1 bottle, 0 cartons (bpc default 8)
        SalesItems.objects.filter(sales=free).update(
            sell_price=0,
            unit_cost=Decimal('15'),
            unit=SalesItems.UNIT_BOTTLE,
            quantity=Decimal('10'),
            liter_amount=Decimal('10'),
        )
        free.refresh_from_db()

        report = get_sales_report(start_date=TXN_WHEN, end_date=TXN_WHEN)
        self.assertEqual(report['kpis']['billed_afn'], 100.0)
        self.assertEqual(report['kpis']['invoice_count'], 1)
        self.assertEqual(report['kpis']['free_invoice_count'], 1)
        self.assertEqual(report['kpis']['free_cost_afn'], 150.0)
        self.assertEqual(report['kpis']['free_carton_amount'], 1.0)
        self.assertEqual(report['kpis']['free_bottle_amount'], 2.0)
        self.assertEqual(report['free']['invoice_count'], 1)
        self.assertEqual(report['free']['cost_afn'], 150.0)
        self.assertEqual(len(report['free']['items']), 1)
        item = report['free']['items'][0]
        self.assertEqual(item['carton_amount'], 1.0)
        self.assertEqual(item['bottle_amount'], 2.0)
        self.assertEqual(item['plastic_amount'], 0.0)
        self.assertIn('AFN', report['free']['by_currency'])

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
