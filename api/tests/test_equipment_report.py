"""Section report for Equipment — position, acquisitions, depreciation."""
from datetime import date
from decimal import Decimal

from django.test import TestCase

from api.models.data.equipment import Equipment, EquipmentDepreciation
from api.services.equipment_report import get_equipment_report
from api.tests.accounting.helpers import TXN_WHEN, USD, create_exchange_rate


class EquipmentReportTests(TestCase):
    def setUp(self):
        self.day = TXN_WHEN.date() if hasattr(TXN_WHEN, 'date') else TXN_WHEN
        create_exchange_rate(from_currency=USD, rate=Decimal('80'), when=TXN_WHEN)

        # bulk_create skips journal signals — report only cares about stored fields.
        created = Equipment.objects.bulk_create([
            Equipment(
                name='Report Laptop',
                category='computers',
                quantity=Decimal('1'),
                unit_cost=Decimal('100.00'),
                currency=USD,
                acquired_date=self.day,
                acquisition_type=Equipment.ACQUISITION_OPENING,
                accumulated_depreciation=Decimal('20.00'),
                status=Equipment.STATUS_IN_USE,
                is_active=True,
            ),
            Equipment(
                name='Report Chair',
                category='furniture',
                quantity=Decimal('2'),
                unit_cost=Decimal('25.00'),
                currency=USD,
                acquired_date=self.day,
                acquisition_type=Equipment.ACQUISITION_OPENING,
                status=Equipment.STATUS_IN_USE,
                is_active=True,
            ),
            Equipment(
                name='Old Printer',
                category='electronics',
                quantity=Decimal('1'),
                unit_cost=Decimal('30.00'),
                currency=USD,
                acquired_date=date(2025, 1, 1),
                acquisition_type=Equipment.ACQUISITION_OPENING,
                status=Equipment.STATUS_DISPOSED,
                is_active=False,
            ),
            Equipment(
                name='Small Cable',
                category='other',
                quantity=Decimal('1'),
                unit_cost=Decimal('5.00'),
                currency=USD,
                acquired_date=self.day,
                acquisition_type=Equipment.ACQUISITION_EXPENSE,
                payment_method='cash',
                status=Equipment.STATUS_IN_USE,
                is_active=True,
            ),
        ])
        self.laptop = created[0]
        EquipmentDepreciation.objects.bulk_create([
            EquipmentDepreciation(
                equipment=self.laptop,
                year=self.day.year,
                amount=Decimal('10.00'),
                notes='Test dep',
            ),
        ])

    def test_equipment_report_keeps_native_usd(self):
        report = get_equipment_report(start_date=TXN_WHEN, end_date=TXN_WHEN)
        self.assertEqual(report['report_type'], 'equipment')
        kpis = report['kpis']

        self.assertEqual(kpis['active_count'], 2)
        self.assertEqual(kpis['disposed_count'], 1)
        self.assertEqual(kpis['period_acquisition_count'], 3)
        self.assertEqual(kpis['period_depreciation_count'], 1)

        # Active: laptop 100 + chair 50 = 150 USD → 12000 AFN at 80
        self.assertEqual(kpis['gross_cost_afn'], 12000.0)
        self.assertEqual(kpis['accumulated_depreciation_afn'], 1600.0)
        self.assertEqual(kpis['net_book_value_afn'], 10400.0)

        usd = report['by_currency']['USD']
        self.assertEqual(usd['active_count'], 2)
        self.assertEqual(usd['gross_native'], 150.0)
        self.assertEqual(usd['accum_dep_native'], 20.0)
        self.assertEqual(usd['nbv_native'], 130.0)
        self.assertEqual(usd['period_asset_native'], 150.0)
        self.assertEqual(usd['period_expense_native'], 5.0)
        self.assertEqual(usd['period_cash_out_native'], 5.0)
        self.assertEqual(usd['period_dep_native'], 10.0)

        categories = {
            (row['category'], row['currency_code']): row
            for row in report['by_category']
        }
        self.assertEqual(categories[('furniture', 'USD')]['cost_native'], 50.0)

        acq = {
            (row['acquisition_type'], row['currency_code']): row
            for row in report['by_acquisition']
        }
        self.assertEqual(acq[('opening', 'USD')]['cost_native'], 150.0)
        self.assertEqual(acq[('expense', 'USD')]['cost_native'], 5.0)

        self.assertTrue(all(row['currency_code'] == 'USD' for row in report['acquisitions']))
        self.assertEqual(report['depreciation'][0]['amount_native'], 10.0)
        self.assertEqual(report['depreciation'][0]['currency_code'], 'USD')
