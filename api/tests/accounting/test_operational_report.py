"""AFN operational business performance report from supermarket sections."""
from decimal import Decimal

from django.test import TestCase

from api.models.data.vendors import Vendor
from api.models.data.purchases import Purchase
from api.services.currency_conversion import populate_base_amounts
from api.services.operational_report import get_operational_report
from api.tests.accounting.helpers import (
    AFN,
    TXN_WHEN,
    create_confirmed_sale,
    create_exchange_rate,
    create_expense,
    create_order_payment,
    USD,
    USD_RATE_8720,
)


class OperationalReportTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_exchange_rate(from_currency=USD, rate=USD_RATE_8720, when=TXN_WHEN)

    def test_report_includes_income_collection_expenses_purchases(self):
        sale = create_confirmed_sale(amount=Decimal('200.00'), currency=AFN, when=TXN_WHEN)
        create_order_payment(
            order=sale,
            amount=Decimal('120.00'),
            payment_type='sale',
            when=TXN_WHEN,
        )
        create_expense(amount=Decimal('40.00'), currency=AFN, when=TXN_WHEN)

        from api.models.data.warehouse import Warehouse

        warehouse = Warehouse.objects.create(
            code='OPS', name='Ops WH', is_default=True, is_active=True,
        )
        vendor = Vendor.objects.create(name='Ops Vendor', is_active=True)
        purchase = Purchase(
            vendor=vendor,
            warehouse=warehouse,
            purchase_date=TXN_WHEN,
            status='received',
            currency=AFN,
            total_amount=Decimal('90.00'),
        )
        populate_base_amounts(
            purchase,
            amount_fields=['total_amount'],
            at_datetime=TXN_WHEN,
            raise_if_missing=True,
        )
        purchase.save()

        report = get_operational_report(start_date=TXN_WHEN, end_date=TXN_WHEN)

        self.assertEqual(report['currency'], 'AFN')
        self.assertEqual(report['income']['billed_afn'], 200.0)
        self.assertEqual(report['income']['collected_afn'], 120.0)
        self.assertEqual(report['income']['uncollected_period_afn'], 80.0)
        self.assertTrue(report['income']['sources'])

        self.assertGreaterEqual(report['expenses']['expenses_paid_afn'], 40.0)
        self.assertEqual(report['operations']['purchases_received_afn'], 90.0)
        self.assertIn('stock', report['operations'])
        self.assertNotIn('production', report['operations'])
        self.assertNotIn('packing', report['operations'])

        # Legacy KPI aliases remain for dashboard compatibility
        self.assertEqual(report['kpis']['cash_from_sales'], 120.0)
        self.assertEqual(report['kpis']['credit_sales'], 80.0)
