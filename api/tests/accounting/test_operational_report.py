"""AFN operational business performance report."""
from decimal import Decimal

from django.test import TestCase

from api.models.data.raw_material_process import RawMaterialProcess
from api.models.data.packing import PackingRun
from api.models.data.storage_tank import StorageTank
from api.models.data.vendors import Vendor
from api.models.data.purchases import Purchase as RawMaterialPurchase
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

    def test_report_includes_income_collection_expenses_production_packing(self):
        sale = create_confirmed_sale(amount=Decimal('200.00'), currency=AFN, when=TXN_WHEN)
        create_order_payment(
            order=sale,
            amount=Decimal('120.00'),
            payment_type='sale',
            when=TXN_WHEN,
        )
        create_expense(amount=Decimal('40.00'), currency=AFN, when=TXN_WHEN)

        vendor = Vendor.objects.create(name='Ops Vendor', is_active=True)
        purchase = RawMaterialPurchase(
            vendor=vendor,
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

        RawMaterialProcess.objects.create(
            product_name='Ops Liquid',
            process_date=TXN_WHEN,
            status=RawMaterialProcess.STATUS_COMPLETED,
            output_quantity_liters=Decimal('50'),
            output_quantity_kg=Decimal('40'),
            material_cost_afn=Decimal('100'),
            extra_expense_afn=Decimal('20'),
            total_cost_afn=Decimal('120'),
        )

        tank = StorageTank.objects.create(
            name='Ops Pack Tank',
            capacity_liters=Decimal('200'),
        )
        packing = PackingRun.objects.create(
            storage_tank=tank,
            quantity_liters=Decimal('20'),
            bottle_volume_liters=Decimal('1'),
            bottle_count=20,
            liquid_cost_afn=Decimal('40'),
            packaging_cost_afn=Decimal('10'),
            total_cost_afn=Decimal('50'),
            cost_per_bottle_afn=Decimal('2.5'),
        )
        PackingRun.objects.filter(pk=packing.pk).update(created_at=TXN_WHEN)

        report = get_operational_report(start_date=TXN_WHEN, end_date=TXN_WHEN)

        self.assertEqual(report['currency'], 'AFN')
        self.assertEqual(report['income']['billed_afn'], 200.0)
        self.assertEqual(report['income']['collected_afn'], 120.0)
        self.assertEqual(report['income']['uncollected_period_afn'], 80.0)
        self.assertTrue(report['income']['sources'])

        self.assertGreaterEqual(report['expenses']['expenses_paid_afn'], 40.0)
        self.assertEqual(report['operations']['purchases_received_afn'], 90.0)
        self.assertEqual(report['operations']['production']['output_liters'], 50.0)
        self.assertEqual(report['operations']['production']['total_cost_afn'], 120.0)
        self.assertEqual(report['operations']['packing']['bottle_count'], 20)
        self.assertEqual(report['operations']['packing']['total_cost_afn'], 50.0)

        # Legacy KPI aliases remain for dashboard compatibility
        self.assertEqual(report['kpis']['cash_from_sales'], 120.0)
        self.assertEqual(report['kpis']['credit_sales'], 80.0)
