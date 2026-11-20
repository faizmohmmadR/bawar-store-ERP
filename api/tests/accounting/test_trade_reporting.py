from datetime import timedelta
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from api.models.data.purchases import Purchase as RawMaterialPurchase
from api.models.data.vendors import Vendor
from api.models.data.payment import Payment
from api.services.currency_conversion import populate_base_amounts
from api.services.trade_reporting import get_trade_report
from api.services.operational_report import get_operational_report
from api.services.financial_reports import get_by_currency_report
from api.services.report_history import build_report_history
from api.tests.accounting.helpers import (
    TXN_WHEN, create_confirmed_sale, create_order_payment,
    create_exchange_rate, create_expense, create_withdrawal, create_loan,
)


class TradeReportTests(TestCase):
    def purchase(self, amount, when=TXN_WHEN, currency=1, status='received'):
        row = RawMaterialPurchase(vendor=Vendor.objects.create(name='Supplier'), total_amount=Decimal(amount), purchase_date=when, currency=currency, status=status)
        populate_base_amounts(row, amount_fields=['total_amount'], at_datetime=when)
        row.save()
        return row

    def test_purchase_paid_and_unpaid_belong_to_the_same_invoices(self):
        old = self.purchase('100', when=TXN_WHEN-timedelta(days=5))
        current = self.purchase('60')
        create_order_payment(order=old, amount=Decimal('80'), payment_type='purchase')
        create_order_payment(order=current, amount=Decimal('10'), payment_type='purchase')
        create_order_payment(order=current, amount=Decimal('50'), payment_type='purchase', when=TXN_WHEN+timedelta(days=2))
        row = get_trade_report(TXN_WHEN, TXN_WHEN)['purchases']
        self.assertEqual((row['total'], row['paid'], row['unpaid']), (60, 10, 50))
        self.assertEqual(row['payments_in_period'], 90)
        self.assertEqual(row['payments_for_other_invoices'], 80)
        self.assertEqual(row['partial_count'], 1)
        report = get_operational_report(start_date=TXN_WHEN, end_date=TXN_WHEN)
        self.assertEqual(report['operations']['purchases_unpaid_afn'], 50)

    def test_sales_paid_and_cash_collections_have_different_time_bases(self):
        old = create_confirmed_sale(amount=Decimal('300'), when=TXN_WHEN-timedelta(days=5))
        current = create_confirmed_sale(amount=Decimal('100'))
        create_order_payment(order=old, amount=Decimal('250'), payment_type='sale')
        create_order_payment(order=current, amount=Decimal('20'), payment_type='sale', when=TXN_WHEN-timedelta(days=1))
        create_order_payment(order=current, amount=Decimal('30'), payment_type='sale')
        report = get_operational_report(start_date=TXN_WHEN, end_date=TXN_WHEN)
        row = report['trade']['sales']
        self.assertEqual((row['total'], row['paid'], row['unpaid']), (100, 50, 50))
        self.assertEqual(row['payments_in_period'], 280)
        # Income KPIs use invoice settlement (as-of end), not payment-date cash.
        self.assertEqual(report['income']['collected_afn'], 50)
        self.assertEqual(report['income']['collection_rate_pct'], 50)
        self.assertEqual(report['income']['uncollected_period_afn'], 50)
        self.assertEqual(
            report['income']['collected_afn'] + report['income']['uncollected_period_afn'],
            report['income']['net_billed_afn'],
        )
        # Cash received in the period still includes payments on older invoices.
        self.assertEqual(report['income']['customer_cash_received_afn'], 280)
        self.assertEqual(report['kpis']['cash_from_sales'], 280)

    def test_generic_ids_and_soft_deleted_payments_do_not_mix(self):
        sale = create_confirmed_sale(amount=Decimal('100'))
        purchase = self.purchase('100')
        # Deliberately reuse the same numeric object id with a different content type.
        create_order_payment(order=purchase, amount=Decimal('60'), payment_type='purchase')
        payment = create_order_payment(order=sale, amount=Decimal('25'), payment_type='sale')
        Payment.objects.filter(pk=payment.pk).update(deleted_at=TXN_WHEN)
        row = get_trade_report()['sales']
        self.assertEqual(row['paid'], 0)
        self.assertEqual(row['unpaid'], 100)
        purchase.soft_delete()
        self.assertEqual(get_trade_report()['purchases']['payments_in_period'], 0)

    def test_fx_booked_settlement_reconciles_while_cash_uses_payment_rate(self):
        create_exchange_rate(from_currency=2, rate=Decimal('80'), when=TXN_WHEN)
        when = TXN_WHEN+timedelta(days=1)
        create_exchange_rate(from_currency=2, rate=Decimal('90'), when=when)
        purchase = self.purchase('100', currency=2)
        create_order_payment(order=purchase, amount=Decimal('50'), payment_type='purchase', when=when)
        row = get_trade_report(TXN_WHEN, when)['purchases']
        self.assertEqual((row['total'], row['paid'], row['unpaid']), (8000, 4000, 4000))
        self.assertEqual(row['payments_in_period'], 4500)
        native = get_by_currency_report(start_date=TXN_WHEN, end_date=when)['by_currency']['USD']['trade']['purchases']
        self.assertEqual((native['total'], native['paid'], native['unpaid']), (100, 50, 50))

    def test_paid_and_unpaid_drilldowns_match_summary(self):
        purchase = self.purchase('75.25')
        create_order_payment(order=purchase, amount=Decimal('20.25'), payment_type='purchase')
        row = get_trade_report()['purchases']
        for metric in ('total', 'paid', 'unpaid'):
            rows, totals = build_report_history(start_date=None, end_date=None, sections=[f'purchases_invoice_{metric}'])
            self.assertEqual(totals['amount_base'], row[metric])
            self.assertEqual(rows[0]['paid_amount'], 20.25)
            self.assertEqual(rows[0]['remaining_amount'], 55)

    def test_intermediary_settlement_is_paid_but_not_a_cash_outflow(self):
        purchase = self.purchase('100')
        # Legacy credit payment: supplier is settled and a separate loan exists.
        Payment.objects.create(content_type=ContentType.objects.get_for_model(purchase), object_id=purchase.pk, payment_type='purchase', payment_method='intermediary_credit', amount=Decimal('40'), amount_base=Decimal('40'), currency=1, payment_date=TXN_WHEN)
        row = get_trade_report()['purchases']
        self.assertEqual((row['paid'], row['unpaid']), (40, 60))
        self.assertEqual(row['payments_in_period'], 0)
        self.assertEqual(row['credit_settlements_in_period'], 40)

    def test_expenses_commissions_equipment_and_loans_have_distinct_totals(self):
        from api.models.data.salesmen import Salesman
        from api.models.data.salesman_commission_payment import SalesmanCommissionPayment
        from api.models.data.equipment import Equipment
        create_expense(amount=Decimal('30'))
        create_withdrawal(amount=Decimal('15'))
        SalesmanCommissionPayment.objects.create(salesman=Salesman.objects.create(name='Rep'), amount=Decimal('10'), payment_date=TXN_WHEN)
        Equipment.objects.create(name='Machine', quantity=1, unit_cost=Decimal('100'), currency=1, acquired_date=TXN_WHEN.date())
        create_loan(amount=Decimal('500'))
        report = get_operational_report(start_date=None, end_date=None)
        self.assertEqual(report['expenses']['expenses_paid_afn'], 30)
        self.assertEqual(report['expenses']['commission_paid_afn'], 10)
        self.assertEqual(report['expenses']['total_cash_out_operating_afn'], 40)
        other = {row['type']: row['amount'] for row in report['expenses']['other_cash_breakdown']}
        self.assertEqual(other['Withdrawals'], 15)
        self.assertEqual(other['Equipment'], 100)
        self.assertEqual(report['cash']['cash_out_afn'], 655)
        self.assertEqual(report['trade']['purchases']['total'], 0)

    def test_received_inventory_purchase_is_not_an_immediate_profit_expense(self):
        self.purchase('100')
        create_expense(amount=Decimal('12'))
        report = get_by_currency_report(start_date=TXN_WHEN, end_date=TXN_WHEN)
        row = report['by_currency']['AFN']
        self.assertEqual(row['trade']['purchases']['total'], 100)
        self.assertEqual(row['total_expenses'], 12)
        self.assertEqual(row['net_profit'], -12)

    def test_payment_on_pending_purchase_is_cash_but_not_received_inventory(self):
        purchase = self.purchase('100', status='pending')
        create_order_payment(order=purchase, amount=Decimal('20'), payment_type='purchase')
        report = get_trade_report(TXN_WHEN, TXN_WHEN)['purchases']
        self.assertEqual(report['total'], 0)
        self.assertEqual(report['payments_in_period'], 20)
        self.assertEqual(report['payments_for_other_invoices'], 20)
