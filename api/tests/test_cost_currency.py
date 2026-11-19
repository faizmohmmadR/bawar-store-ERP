from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from api.models.data.currency import ExchangeRate
from api.models.data.raw_material_process import RawMaterialProcess
from api.serializers.data.raw_material_process import RawMaterialProcessSerializer
from api.services.cost_currency import usd_amount, usd_cost_rate


class CostCurrencyTests(TestCase):
    def setUp(self):
        ExchangeRate.objects.all().delete()
        self.date = timezone.now() - timedelta(days=10)

    def rate(self, value, date=None):
        return ExchangeRate.objects.create(
            from_currency=2, to_currency=1, rate=Decimal(value),
            date=date or self.date,
        )

    def production(self):
        return RawMaterialProcess.objects.create(
            product_name='Cost test', process_date=self.date,
            output_quantity_liters=10, output_quantity_kg=10,
            total_cost_afn=700, cost_per_kg_afn=70,
        )

    def test_reporting_divides_afn_and_preserves_six_places(self):
        self.assertEqual(usd_amount('70', '70'), '1.000000')
        self.assertEqual(usd_amount('1', '70'), '0.014286')
        self.assertIsNone(usd_amount('1', None))
        self.assertIsNone(usd_amount('1', '0'))

    def test_no_future_or_missing_rate_fallback(self):
        self.rate('80', timezone.now())
        self.assertIsNone(usd_cost_rate(self.date))
        process = self.production()
        self.assertIsNone(process.usd_to_afn_rate)
        self.assertIsNone(RawMaterialProcessSerializer(process).data['cost_per_kg_usd'])

    def test_saved_rate_and_usd_cost_survive_rate_edits(self):
        rate = self.rate('70')
        process = self.production()
        self.assertEqual(process.usd_to_afn_rate, Decimal('70'))
        rate.rate = Decimal('100')
        rate.save()
        process.notes = 'Edited after exchange rate change'
        process.save()
        process.refresh_from_db()
        data = RawMaterialProcessSerializer(process).data
        self.assertEqual(data['cost_per_kg_usd'], '1.000000')
        self.assertEqual(data['total_cost_usd'], '10.000000')
        self.assertEqual(process.cost_per_kg_afn, Decimal('70'))

    def test_usd_rate_cannot_be_overridden_by_api_input(self):
        self.rate('70')
        process = self.production()
        serializer = RawMaterialProcessSerializer(
            process, data={'usd_to_afn_rate': '1'}, partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertNotIn('usd_to_afn_rate', serializer.validated_data)

    def test_packing_components_share_run_rate_and_full_carton_cost(self):
        from api.models.data.packing import PackingRun, PackingRunComponent
        from api.models.data.storage_tank import StorageTank
        from api.serializers.data.packing import PackingRunSerializer

        self.rate('70')
        tank = StorageTank.objects.create(name='USD cost tank', capacity_liters=100)
        run = PackingRun.objects.create(
            storage_tank=tank, quantity_liters=10, quantity_kg=10,
            bottle_volume_liters=1, bottle_count=10,
            liquid_cost_afn=560, packaging_cost_afn=140,
            total_cost_afn=700, cost_per_bottle_afn=70,
        )
        PackingRunComponent.objects.create(
            packing_run=run, component_type='carton', quantity_pieces=2,
            unit_cost_afn=35, total_cost_afn=70,
        )
        self.rate('100', timezone.now())
        run.refresh_from_db()
        data = PackingRunSerializer(run).data
        self.assertEqual(data['cost_per_bottle_usd'], '1.000000')
        self.assertEqual(data['cost_per_carton_usd'], '5.000000')
        self.assertEqual(data['components'][0]['unit_cost_usd'], '0.500000')
        self.assertEqual(data['components'][0]['total_cost_usd'], '1.000000')
