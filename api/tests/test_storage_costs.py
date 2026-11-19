from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from api.models.data.currency import ExchangeRate
from api.models.data.packing import PackingRun
from api.models.data.raw_material_process import RawMaterialProcess
from api.models.data.storage_tank import StorageTank
from api.services.packing import get_available_packing_tanks
from api.services.production_storage import replace_production_storage_transfers
from api.views.data.storage_tanks import StorageTankViewSet


class StorageCostTests(TestCase):
    def setUp(self):
        self.tank = StorageTank.objects.create(name='Costed storage', capacity_liters=100)
        ExchangeRate.objects.create(from_currency=2, to_currency=1, rate=65)

    def transfer(self, liters, cost_per_liter, density='1'):
        production = RawMaterialProcess.objects.create(
            product_name='Costed liquid', status='moved_to_storage',
            output_quantity_liters=Decimal(liters),
            output_quantity_kg=Decimal(liters) * Decimal(density),
            density_kg_per_liter=Decimal(density),
            cost_per_liter_afn=Decimal(cost_per_liter),
        )
        replace_production_storage_transfers(production, [{
            'storage_tank': self.tank.pk, 'quantity_liters': liters,
        }])

    def response(self, detail=False):
        class View(StorageTankViewSet):
            permission_classes = []
        view = View.as_view({'get': 'retrieve' if detail else 'list'})
        response = view(APIRequestFactory().get('/storage-tanks/'), **({'pk': self.tank.pk} if detail else {}))
        self.assertEqual(response.status_code, 200, response.data)
        return response.data if detail else response.data[0]

    def test_list_and_detail_share_weighted_cost_per_kg_and_usd(self):
        self.transfer('10', '40', '0.8')
        self.transfer('30', '80', '1.2')
        listed, detail = self.response(), self.response(detail=True)
        self.assertEqual(Decimal(listed['current_kg']), Decimal('44'))
        self.assertEqual(Decimal(listed['liquid_cost_per_liter_afn']), Decimal('70'))
        self.assertAlmostEqual(Decimal(listed['liquid_cost_per_kg_afn']), Decimal('2800') / Decimal('44'), places=6)
        self.assertAlmostEqual(Decimal(listed['liquid_cost_per_kg_usd']), Decimal('2800') / Decimal('44') / Decimal('65'), places=6)
        self.assertEqual(listed['liquid_cost_per_kg_afn'], detail['liquid_cost_per_kg_afn'])

    def test_integer_valued_batches_keep_fractional_average_cost(self):
        self.transfer('1', '1')
        self.transfer('2', '2')
        listed = self.response()
        self.assertEqual(Decimal(listed['liquid_cost_per_liter_afn']), Decimal('1.666667'))
        self.assertEqual(Decimal(listed['liquid_cost_per_kg_afn']), Decimal('1.666667'))

    def test_packing_available_liquid_matches_tank_balance(self):
        self.transfer('10', '40', '0.8')
        self.transfer('30', '80', '1.2')
        run = PackingRun.objects.create(
            storage_tank=self.tank, quantity_liters=10, quantity_kg=11,
            bottle_volume_liters=1, bottle_count=10, liquid_cost_afn=600,
            packaging_cost_afn=10, total_cost_afn=610, cost_per_bottle_afn=61,
        )
        listed = self.response()
        packing = next(t for t in get_available_packing_tanks() if t['id'] == self.tank.pk)
        self.assertEqual(Decimal(listed['current_liters']), Decimal('30'))
        self.assertEqual(Decimal(listed['liquid_cost_per_liter_afn']), Decimal('73.333333'))
        self.assertEqual(Decimal(packing['liquid_cost_per_liter_afn']), Decimal(listed['liquid_cost_per_liter_afn']))
