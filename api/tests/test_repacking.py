from decimal import Decimal
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from api.models.data.raw_materials import RawMaterial, RawMaterialStock, RawMaterialCategory
from api.models.data.packing import PackingReturn
from api.services.material_finished_stock import add_material_stock
from api.services.repacking import return_to_pack
from api.serializers.data.stock import StockSerializer


class RepackingTests(TestCase):
    def setUp(self):
        bottle = RawMaterial.objects.create(name='Filled bottle', unit='piece', material_type='bottle',
            capacity_liters=1, category=RawMaterialCategory.objects.get(name='A'))
        self.stock, self.batch, _ = add_material_stock(material=bottle, quantity=86, total_cost=860, packing=True)
        self.carton = RawMaterial.objects.create(name='Eight-bottle carton', unit='piece', material_type='carton', bottles_per_carton=8)
        self.raw = RawMaterialStock.objects.create(raw_material=self.carton, quantity=20, last_purchase_price=2)

    def repack(self, count=6):
        return return_to_pack(stock_id=self.stock.pk, bottle_count=count)

    def test_six_leftover_bottles_repack_without_duplicate_bottles(self):
        record = self.repack()
        self.stock.refresh_from_db()
        self.raw.refresh_from_db()
        self.batch.refresh_from_db()
        self.assertEqual(self.stock.piece_amount, Decimal('80'))
        self.assertEqual(self.stock.buy_price, Decimal('10'))
        self.assertEqual(self.batch.remaining_pieces, Decimal('80'))
        self.assertEqual(self.raw.quantity, Decimal('20'))
        self.assertEqual(record.bottle_count, 6)
        self.assertEqual(record.bottle_sources[0]['inventory_batch'], self.batch.pk)
        self.assertEqual(record.bottle_sources[0]['bottle_count'], 6)
        self.assertEqual(record.remaining_bottle_count, 6)
        self.assertTrue(record.inventory_moved)
        self.assertEqual(record.packaging_cost_afn, Decimal('0'))
        self.assertEqual(record.components, [])

    def test_invalid_bottle_counts_do_not_create_returns(self):
        for count in [87, 0, -1, Decimal("1.5")]:
            with self.assertRaises(ValidationError):
                self.repack(count)
        self.raw.refresh_from_db()
        self.assertEqual(self.raw.quantity, Decimal('20'))
        self.assertFalse(PackingReturn.objects.exists())

    def test_expired_bottles_cannot_be_repacked(self):
        self.batch.expire_date = timezone.localdate() - timedelta(days=1)
        self.batch.save()
        with self.assertRaises(ValidationError):
            self.repack()

    def test_price_correction_with_stock_count_change_updates_packing_lots(self):
        serializer = StockSerializer(self.stock, data={'piece_amount': '85', 'buy_price': '12', 'currency': 1}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        stock = serializer.save()
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.unit_cost, Decimal('12'))
        self.assertEqual(Decimal(StockSerializer(stock).data['buy_price']), Decimal('12'))

    def test_price_only_correction_updates_packing_lots(self):
        serializer = StockSerializer(self.stock, data={'buy_price': '12', 'currency': 1}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        stock = serializer.save()
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.unit_cost, Decimal('12'))
        self.assertEqual(Decimal(StockSerializer(stock).data['buy_price']), Decimal('12'))

    def test_price_correction_with_increased_count_applies_to_all_remaining_lots(self):
        serializer = StockSerializer(self.stock, data={'piece_amount': '90', 'buy_price': '12', 'currency': 1}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        stock = serializer.save()
        self.assertEqual(Decimal(StockSerializer(stock).data['buy_price']), Decimal('12'))
        self.assertEqual(stock.piece_amount, Decimal('90'))

    def test_return_endpoint_accepts_only_bottle_count(self):
        from types import SimpleNamespace
        from unittest.mock import patch
        from api.views.data.stock import StockViewSet
        view = StockViewSet()
        with patch.object(view, 'get_object', return_value=self.stock):
            response = view.return_to_pack(SimpleNamespace(
                method='POST', data={'bottle_count': 6}, user=None,
            ), pk=self.stock.pk)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['bottle_count'], 6)
        self.raw.refresh_from_db()
        self.assertEqual(self.raw.quantity, Decimal('20'))


    def pack_returned(self, returned, count=4):
        from api.services.repacking import create_returned_packing_run
        return create_returned_packing_run(packing_return_id=returned.pk, bottle_count=count,
            components=[{'component_type': 'carton', 'raw_material': self.carton.pk, 'quantity_pieces': 1}])

    def test_partial_packing_consumes_returned_balance_and_preserves_value(self):
        returned = self.repack()
        run = self.pack_returned(returned)
        returned.refresh_from_db()
        self.stock.refresh_from_db()
        self.raw.refresh_from_db()
        self.assertEqual(returned.remaining_bottle_count, 2)
        self.assertEqual(self.stock.piece_amount, Decimal('84'))
        self.assertEqual(self.raw.quantity, Decimal('19'))
        self.assertIsNone(run.storage_tank_id)
        self.assertEqual(run.liquid_cost_afn, 0)
        self.assertEqual(run.returned_cost_afn, Decimal('40'))
        self.assertEqual(run.total_cost_afn, Decimal('42'))
        self.assertEqual(set(run.components.values_list('component_type', flat=True)), {'carton'})
        self.assertEqual(run.outputs.get(component_type='bottle').quantity_pieces, Decimal('4'))
        self.pack_returned(returned, count=2)
        returned.refresh_from_db()
        self.stock.refresh_from_db()
        self.assertEqual(returned.remaining_bottle_count, 0)
        self.assertEqual(self.stock.piece_amount, Decimal('86'))
        from api.services.stock_valuation import stock_valuation
        self.assertEqual(stock_valuation(self.stock)['value'], Decimal('860'))

    def test_cannot_pack_more_than_remaining_or_create_empty_bottles(self):
        from api.services.repacking import create_returned_packing_run
        returned = self.repack()
        self.pack_returned(returned)
        with self.assertRaises(ValidationError):
            self.pack_returned(returned, count=3)
        with self.assertRaises(ValidationError):
            create_returned_packing_run(packing_return_id=returned.pk, bottle_count=1,
                components=[{'component_type': 'bottle', 'raw_material': self.carton.pk, 'quantity_pieces': 1}])
        self.raw.refresh_from_db()
        self.assertEqual(self.raw.quantity, Decimal('19'))

    def test_deleting_unconsumed_packing_restores_returned_balance(self):
        from api.services.packing import delete_packing_run
        returned = self.repack()
        run = self.pack_returned(returned)
        delete_packing_run(packing_run_id=run.pk)
        returned.refresh_from_db()
        self.raw.refresh_from_db()
        self.stock.refresh_from_db()
        self.assertEqual(returned.remaining_bottle_count, 6)
        self.assertEqual(self.raw.quantity, Decimal('20'))
        self.assertEqual(self.stock.piece_amount, Decimal('80'))

    def test_return_and_pack_keep_original_expiry(self):
        self.batch.expire_date = timezone.localdate() + timedelta(days=10)
        self.batch.save()
        returned = self.repack()
        run = self.pack_returned(returned)
        self.assertEqual(run.outputs.get(component_type='bottle').inventory_batch.expire_date, self.batch.expire_date)

    def test_failed_pack_rolls_back_materials_and_balance(self):
        from api.services.repacking import create_returned_packing_run
        returned = self.repack()
        with self.assertRaises(ValidationError):
            create_returned_packing_run(packing_return_id=returned.pk, bottle_count=4,
                components=[{'component_type': 'carton', 'raw_material': self.carton.pk, 'quantity_pieces': 21}])
        self.raw.refresh_from_db()
        returned.refresh_from_db()
        self.assertEqual(self.raw.quantity, Decimal('20'))
        self.assertEqual(returned.remaining_bottle_count, 6)
        self.assertEqual(returned.packing_runs.count(), 0)

    def test_history_only_returns_are_not_available_to_pack(self):
        old = PackingReturn.objects.create(stock=self.stock, bottle_count=6, packaging_cost_afn=0)
        with self.assertRaises(ValidationError):
            self.pack_returned(old)

    def test_return_is_a_real_transfer_and_cannot_be_repeated_past_stock(self):
        returned = self.repack(86)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.piece_amount, 0)
        self.assertEqual(returned.remaining_bottle_count, 86)
        with self.assertRaises(ValidationError):
            self.repack(1)

    def test_packing_api_create_edit_and_available_source_balance(self):
        from rest_framework.test import APIRequestFactory
        from api.views.data.packing import PackingRunViewSet
        returned = self.repack()
        factory = APIRequestFactory()
        open_view = type('OpenPacking', (PackingRunViewSet,), {'permission_classes': []})
        payload = {'packing_return': returned.pk, 'bottle_count': 6, 'components': [
            {'component_type': 'carton', 'raw_material': self.carton.pk, 'quantity_pieces': 1}]}
        response = open_view.as_view({'post': 'create'})(factory.post('/', payload, format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['packing_return'], returned.pk)
        self.assertIsNone(response.data['storage_tank'])
        run_id = response.data['id']
        available = open_view.as_view({'get': 'available_returns'})(factory.get('/'))
        self.assertEqual(available.data['results'], [])
        for_edit = open_view.as_view({'get': 'available_returns'})(factory.get('/', {'exclude_run': run_id}))
        self.assertEqual(for_edit.data['results'][0]['remaining_bottle_count'], 6)
        payload['bottle_count'] = 4
        edited = open_view.as_view({'put': 'update'})(factory.put('/', payload, format='json'), pk=run_id)
        self.assertEqual(edited.status_code, 200, edited.data)
        returned.refresh_from_db()
        self.assertEqual(returned.remaining_bottle_count, 2)
        failed = {**payload, 'bottle_count': 7}
        rejected = open_view.as_view({'put': 'update'})(factory.put('/', failed, format='json'), pk=run_id)
        self.assertEqual(rejected.status_code, 400, rejected.data)
        returned.refresh_from_db()
        self.assertEqual(returned.remaining_bottle_count, 2)
        from api.models.data.packing import PackingRun
        self.assertEqual(PackingRun.objects.get(pk=run_id).bottle_count, 4)

    def test_returned_section_reuses_history_only_item_for_new_balance(self):
        from rest_framework.test import APIRequestFactory
        from api.views.data.stock import StockViewSet
        old = PackingReturn.objects.create(stock=self.stock, bottle_count=6, packaging_cost_afn=0)
        current = self.repack()
        view = type('OpenStock', (StockViewSet,), {'permission_classes': []}).as_view({'get': 'returned_for_packing'})
        response = view(APIRequestFactory().get('/'))
        self.assertEqual(response.status_code, 200)
        rows = {row['id']: row for row in response.data['results']}
        self.assertEqual(old.pk, current.pk)
        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[current.pk]['is_available'])
        self.assertEqual(rows[current.pk]['remaining_bottle_count'], 6)

    def test_used_output_cannot_restore_returned_balance(self):
        from api.services.packing import delete_packing_run
        from api.models.data.inventory_batch import InventoryBatch
        returned = self.repack()
        run = self.pack_returned(returned)
        bottle_batch = run.outputs.get(component_type='bottle').inventory_batch
        bottle_batch.remaining_pieces -= 1
        bottle_batch._skip_batch_journal = True
        bottle_batch.save()
        with self.assertRaises(ValidationError):
            delete_packing_run(packing_run_id=run.pk)
        returned.refresh_from_db()
        self.raw.refresh_from_db()
        self.assertEqual(returned.remaining_bottle_count, 2)
        self.assertEqual(self.raw.quantity, Decimal('19'))


    def test_repeated_returns_keep_one_balance_and_dated_events(self):
        from unittest.mock import patch
        first_date = timezone.now() - timedelta(days=2)
        with patch('api.services.repacking.timezone.now', return_value=first_date):
            first = self.repack(6)
        self.pack_returned(first, count=4)
        second_date = timezone.now()
        with patch('api.services.repacking.timezone.now', return_value=second_date):
            second = self.repack(3)
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(PackingReturn.objects.filter(stock=self.stock).count(), 1)
        second.refresh_from_db()
        self.assertEqual(second.bottle_count, 9)
        self.assertEqual(second.remaining_bottle_count, 5)
        self.assertEqual(second.first_returned_at, first_date)
        self.assertEqual(second.last_returned_at, second_date)
        self.assertEqual(list(second.return_events.values_list('bottle_count', flat=True)), [3, 6])

    def test_new_returns_after_exhaustion_reuse_the_same_record(self):
        first = self.repack()
        self.pack_returned(first, count=6)
        second = self.repack(2)
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(second.remaining_bottle_count, 2)
        self.assertEqual(second.bottle_count, 8)

    def mixed_packing(self, returned, returned_count=6, returned_carton_id=None, returned_carton_quantity=0):
        from api.models.data.raw_material_process import RawMaterialProcess
        from api.models.data.storage_tank import StorageTank, ProductionStorageTransfer
        from api.services.packing import create_packing_run
        tank = StorageTank.objects.create(name='Mixed source tank', capacity_liters=100)
        production = RawMaterialProcess.objects.create(product_name='Mixed liquid', status=RawMaterialProcess.STATUS_MOVED_TO_STORAGE,
            output_quantity_liters=20, cost_per_liter_afn=2)
        ProductionStorageTransfer.objects.create(production=production, storage_tank=tank, quantity_liters=20)
        bottle = self.stock.product.raw_material
        raw_bottles = RawMaterialStock.objects.create(raw_material=bottle, quantity=100, last_purchase_price=1)
        plastic = RawMaterial.objects.create(name='Mixed source plastic', material_type='plastic', unit='piece',
            category=RawMaterialCategory.objects.get(name='A'), capacity_liters=1, bottles_per_plastic=6)
        RawMaterialStock.objects.create(raw_material=plastic, quantity=100, last_purchase_price=1)
        run = create_packing_run(storage_tank_id=tank.pk, quantity_liters=4, bottle_volume_liters=1,
            packing_return_id=returned.pk, returned_bottle_count=returned_count,
            returned_carton_id=returned_carton_id, returned_carton_quantity=returned_carton_quantity,
            components=[{'component_type': 'bottle', 'raw_material': bottle.pk, 'quantity_pieces': 4},
                        {'component_type': 'plastic', 'raw_material': plastic.pk, 'quantity_pieces': 2},
                        {'component_type': 'carton', 'raw_material': self.carton.pk, 'quantity_pieces': 2}])
        return run, raw_bottles, tank

    def test_tank_and_returned_bottles_are_packed_together(self):
        from api.services.packing import _tank_liquid_totals
        returned = self.repack()
        run, raw_bottles, tank = self.mixed_packing(returned)
        returned.refresh_from_db()
        raw_bottles.refresh_from_db()
        self.stock.refresh_from_db()
        self.assertEqual(run.bottle_count, 10)
        self.assertEqual(run.returned_bottle_count, 6)
        self.assertEqual(run.quantity_liters, Decimal('4'))
        self.assertEqual(returned.remaining_bottle_count, 0)
        self.assertEqual(raw_bottles.quantity, Decimal('96'))
        self.assertEqual(self.stock.piece_amount, Decimal('90'))
        self.assertEqual(_tank_liquid_totals(tank)[0], Decimal('16'))
        self.assertEqual(run.returned_cost_afn, Decimal('60'))
        self.assertEqual(run.outputs.get(component_type='bottle').quantity_pieces, Decimal('10'))

    def test_mixed_run_delete_restores_only_the_returned_portion(self):
        from api.services.packing import delete_packing_run, _tank_liquid_totals
        returned = self.repack()
        run, raw_bottles, tank = self.mixed_packing(returned)
        delete_packing_run(packing_run_id=run.pk)
        returned.refresh_from_db()
        raw_bottles.refresh_from_db()
        self.assertEqual(returned.remaining_bottle_count, 6)
        self.assertEqual(raw_bottles.quantity, Decimal('100'))
        self.assertEqual(_tank_liquid_totals(tank)[0], Decimal('20'))

    def test_pool_average_and_reversal_preserve_carried_value_after_another_return(self):
        returned = self.repack()
        run = self.pack_returned(returned, count=4)
        self.stock.refresh_from_db()
        serializer = StockSerializer(self.stock, data={'buy_price': '12', 'currency': 1}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        updated = self.repack(3)
        self.assertEqual(updated.pk, returned.pk)
        self.assertEqual(updated.remaining_bottle_count, 5)
        self.assertEqual(updated.unit_cost_afn, Decimal('11.2'))
        from api.services.packing import delete_packing_run
        delete_packing_run(packing_run_id=run.pk)
        updated.refresh_from_db()
        self.assertEqual(updated.remaining_bottle_count, 9)
        self.assertEqual(updated.unit_cost_afn, Decimal('10.666667'))

    def test_mixed_packing_api_uses_and_edits_the_selected_returned_quantity(self):
        from rest_framework.test import APIRequestFactory
        from api.views.data.packing import PackingRunViewSet
        returned = self.repack()
        run, _, tank = self.mixed_packing(returned)
        payload = {'storage_tank': tank.pk, 'quantity_liters': '4', 'bottle_volume_liters': '1',
            'packing_return': returned.pk, 'returned_bottle_count': 3,
            'components': [{'component_type': row.component_type,
                'raw_material': row.raw_material_stock.raw_material_id,
                'quantity_pieces': int(row.quantity_pieces)} for row in run.components.all()]}
        view = type('OpenMixedPacking', (PackingRunViewSet,), {'permission_classes': []}).as_view({'put': 'update'})
        response = view(APIRequestFactory().put('/', payload, format='json'), pk=run.pk)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['returned_bottle_count'], 3)
        self.assertEqual(response.data['bottle_count'], 7)
        returned.refresh_from_db()
        self.assertEqual(returned.remaining_bottle_count, 3)
        payload['returned_bottle_count'] = 7
        rejected = view(APIRequestFactory().put('/', payload, format='json'), pk=run.pk)
        self.assertEqual(rejected.status_code, 400, rejected.data)
        returned.refresh_from_db()
        run.refresh_from_db()
        self.assertEqual(returned.remaining_bottle_count, 3)
        self.assertEqual(run.returned_bottle_count, 3)


    def test_separate_returned_carton_has_its_own_quantity_cost_and_outputs(self):
        returned = self.repack()
        run, raw_bottles, _ = self.mixed_packing(returned, returned_carton_id=self.carton.pk, returned_carton_quantity=1)
        self.raw.refresh_from_db()
        raw_bottles.refresh_from_db()
        returned.refresh_from_db()
        self.assertEqual(returned.remaining_bottle_count, 0)
        self.assertEqual(self.raw.quantity, Decimal('17'))  # 2 normal + 1 returned carton
        self.assertEqual(raw_bottles.quantity, Decimal('96'))
        self.assertEqual(run.total_cost_afn, Decimal('80'))
        self.assertEqual(run.packaging_cost_afn, Decimal('12'))
        self.assertEqual(run.components.get(component_type='returned_carton').total_cost_afn, Decimal('2'))
        outputs = {row.component_type: row for row in run.outputs.all()}
        self.assertEqual(outputs['bottle'].quantity_pieces, Decimal('4'))
        self.assertEqual(outputs['bottle'].total_cost_afn, Decimal('12'))
        self.assertEqual(outputs['returned_bottle'].quantity_pieces, Decimal('6'))
        self.assertEqual(outputs['returned_bottle'].total_cost_afn, Decimal('60'))
        self.assertEqual(outputs['carton'].quantity_pieces, Decimal('2'))
        self.assertEqual(outputs['returned_carton'].quantity_pieces, Decimal('1'))
        self.assertEqual(sum(row.total_cost_afn for row in outputs.values()), run.total_cost_afn)

    def test_reversal_restores_shared_carton_material_from_both_sections(self):
        from api.services.packing import delete_packing_run
        returned = self.repack()
        run, _, _ = self.mixed_packing(returned, returned_carton_id=self.carton.pk, returned_carton_quantity=1)
        delete_packing_run(packing_run_id=run.pk)
        returned.refresh_from_db()
        self.raw.refresh_from_db()
        self.stock.refresh_from_db()
        self.assertEqual(returned.remaining_bottle_count, 6)
        self.assertEqual(self.raw.quantity, Decimal('20'))
        self.assertEqual(self.stock.piece_amount, Decimal('80'))

    def test_separate_returned_section_can_pack_another_bottle_item(self):
        other = RawMaterial.objects.create(name='Another filled bottle', material_type='bottle', unit='piece',
            capacity_liters=Decimal('0.5'), category=RawMaterialCategory.objects.get(name='A'))
        other_stock, _, _ = add_material_stock(material=other, quantity=6, total_cost=120, packing=True)
        returned = return_to_pack(stock_id=other_stock.pk, bottle_count=6)
        run, _, _ = self.mixed_packing(returned, returned_carton_id=self.carton.pk, returned_carton_quantity=1)
        outputs = {row.component_type: row for row in run.outputs.all()}
        self.assertEqual(outputs['bottle'].stock_id, self.stock.pk)
        self.assertEqual(outputs['returned_bottle'].stock_id, other_stock.pk)
        self.assertEqual(outputs['returned_bottle'].quantity_pieces, Decimal('6'))
        self.assertEqual(outputs['returned_bottle'].total_cost_afn, Decimal('120'))
        self.assertEqual(run.total_cost_afn, Decimal('140'))
        other_stock.refresh_from_db()
        self.assertEqual(other_stock.piece_amount, Decimal('6'))

    def test_shared_carton_insufficiency_rolls_back_both_sections(self):
        returned = self.repack()
        with self.assertRaises(ValidationError):
            self.mixed_packing(returned, returned_carton_id=self.carton.pk, returned_carton_quantity=19)
        returned.refresh_from_db()
        self.raw.refresh_from_db()
        self.assertEqual(returned.remaining_bottle_count, 6)
        self.assertEqual(self.raw.quantity, Decimal('20'))
        self.assertFalse(returned.packing_runs.exists())

    def test_api_saves_and_edits_the_independent_returned_carton(self):
        from rest_framework.test import APIRequestFactory
        from api.views.data.packing import PackingRunViewSet
        returned = self.repack()
        run, _, tank = self.mixed_packing(returned, returned_carton_id=self.carton.pk, returned_carton_quantity=1)
        payload = {'storage_tank': tank.pk, 'quantity_liters': '4', 'bottle_volume_liters': '1',
            'packing_return': returned.pk, 'returned_bottle_count': 3,
            'returned_carton': self.carton.pk, 'returned_carton_quantity': 1,
            'components': [{'component_type': row.component_type,
                'raw_material': row.raw_material_stock.raw_material_id, 'quantity_pieces': int(row.quantity_pieces)}
                for row in run.components.exclude(component_type='returned_carton')]}
        view = type('OpenSeparateReturnCarton', (PackingRunViewSet,), {'permission_classes': []}).as_view({'put': 'update'})
        response = view(APIRequestFactory().put('/', payload, format='json'), pk=run.pk)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Decimal(response.data['total_cost_afn']), Decimal('50'))
        self.assertEqual(response.data['returned_bottle_count'], 3)
        self.assertEqual({row['component_type']: Decimal(row['total_cost_afn']) for row in response.data['components']}['returned_carton'], Decimal('2'))
        returned.refresh_from_db()
        self.assertEqual(returned.remaining_bottle_count, 3)
        self.raw.refresh_from_db()
        self.assertEqual(self.raw.quantity, Decimal('17'))

    def test_correcting_return_down_moves_unused_bottles_back_to_stock(self):
        from api.services.repacking import correct_returned_quantity
        returned = self.repack()
        corrected = correct_returned_quantity(packing_return_id=returned.pk, bottle_count=4, expected_bottle_count=6, notes='Counted two extra')
        self.stock.refresh_from_db()
        self.assertEqual(corrected.bottle_count, 4)
        self.assertEqual(corrected.remaining_bottle_count, 4)
        self.assertEqual(self.stock.piece_amount, Decimal('82'))
        event = corrected.return_events.first()
        self.assertEqual(event.details['quantity_change'], -2)
        self.assertEqual(event.notes, 'Counted two extra')
        from api.services.stock_valuation import stock_valuation
        self.assertEqual(stock_valuation(self.stock)['value'] + corrected.remaining_bottle_count * corrected.unit_cost_afn, Decimal('860'))

    def test_correcting_return_up_takes_only_extra_bottles_and_keeps_one_record(self):
        from api.services.repacking import correct_returned_quantity
        returned = self.repack()
        corrected = correct_returned_quantity(packing_return_id=returned.pk, bottle_count=8, expected_bottle_count=6)
        self.stock.refresh_from_db()
        self.assertEqual(corrected.pk, returned.pk)
        self.assertEqual(corrected.remaining_bottle_count, 8)
        self.assertEqual(self.stock.piece_amount, Decimal('78'))
        self.assertEqual(corrected.return_events.first().details['quantity_change'], 2)
        self.assertEqual(PackingReturn.objects.count(), 1)

    def test_return_correction_cannot_remove_bottles_already_packed(self):
        from api.services.repacking import correct_returned_quantity
        returned = self.repack()
        self.pack_returned(returned, count=4)
        with self.assertRaises(ValidationError):
            correct_returned_quantity(packing_return_id=returned.pk, bottle_count=3, expected_bottle_count=6)
        corrected = correct_returned_quantity(packing_return_id=returned.pk, bottle_count=4, expected_bottle_count=6)
        self.assertEqual(corrected.remaining_bottle_count, 0)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.piece_amount, Decimal('86'))

    def test_stale_and_insufficient_return_corrections_roll_back(self):
        from api.services.repacking import correct_returned_quantity
        returned = self.repack()
        for total, expected in [(8, 5), (100, 6)]:
            with self.assertRaises(ValidationError):
                correct_returned_quantity(packing_return_id=returned.pk, bottle_count=total, expected_bottle_count=expected)
        returned.refresh_from_db()
        self.stock.refresh_from_db()
        self.assertEqual(returned.bottle_count, 6)
        self.assertEqual(returned.remaining_bottle_count, 6)
        self.assertEqual(self.stock.piece_amount, Decimal('80'))
        self.assertEqual(returned.return_events.count(), 1)

    def test_return_correction_allows_zero_and_preserves_expiry(self):
        from api.services.repacking import correct_returned_quantity
        self.batch.expire_date = timezone.localdate() + timedelta(days=5)
        self.batch.save()
        returned = self.repack()
        corrected = correct_returned_quantity(packing_return_id=returned.pk, bottle_count=0, expected_bottle_count=6)
        self.assertEqual(corrected.remaining_bottle_count, 0)
        restored = self.stock.product.inventory_batches.filter(notes__startswith='Correction of returned bottles').get()
        self.assertEqual(restored.expire_date, self.batch.expire_date)
        self.assertEqual(restored.remaining_pieces, Decimal('6'))
        again = self.repack(2)
        self.assertEqual(again.pk, returned.pk)
        self.assertEqual(again.bottle_count, 2)

    def test_history_only_correction_does_not_move_inventory(self):
        from api.services.repacking import correct_returned_quantity
        old = PackingReturn.objects.create(stock=self.stock, bottle_count=6, packaging_cost_afn=0)
        corrected = correct_returned_quantity(packing_return_id=old.pk, bottle_count=4, expected_bottle_count=6)
        self.assertFalse(corrected.inventory_moved)
        self.assertEqual(corrected.remaining_bottle_count, 0)
        self.assertEqual(corrected.bottle_count, 4)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.piece_amount, Decimal('86'))

    def test_correct_return_api_updates_stock_and_serializes_history(self):
        from rest_framework.test import APIRequestFactory
        from api.views.data.stock import StockViewSet
        returned = self.repack()
        view = type('OpenCorrectionStock', (StockViewSet,), {'permission_classes': []}).as_view({'post': 'correct_return'})
        response = view(APIRequestFactory().post('/', {'packing_return': returned.pk, 'bottle_count': 4, 'expected_bottle_count': 6}, format='json'), pk=self.stock.pk)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['remaining_bottle_count'], 4)
        self.assertEqual(response.data['return_events'][0]['quantity_change'], -2)

    def test_returned_packing_without_any_new_packaging_preserves_carried_value(self):
        from api.services.repacking import create_returned_packing_run
        from api.services.packing import delete_packing_run
        returned = self.repack()
        run = create_returned_packing_run(packing_return_id=returned.pk, bottle_count=4, components=[])
        self.assertEqual(run.components.count(), 0)
        self.assertEqual(run.total_cost_afn, Decimal('40'))
        self.assertEqual(sum(o.total_cost_afn for o in run.outputs.all()), Decimal('40'))
        delete_packing_run(packing_run_id=run.pk)
        returned.refresh_from_db()
        self.assertEqual(returned.remaining_bottle_count, 6)

    def test_mixed_new_and_returned_without_any_packaging_keeps_separate_outputs(self):
        from api.services.packing import create_packing_run, delete_packing_run
        returned = self.repack()
        original, _, tank = self.mixed_packing(returned)
        delete_packing_run(packing_run_id=original.pk)
        run = create_packing_run(storage_tank_id=tank.pk, quantity_liters=4,
            bottle_volume_liters=0, filled_bottle_count=4, components=[],
            packing_return_id=returned.pk, returned_bottle_count=6)
        self.assertEqual(run.bottle_count, 10)
        self.assertEqual(run.components.count(), 0)
        self.assertEqual(set(run.outputs.values_list('component_type', flat=True)), {'bottle', 'returned_bottle'})
        self.assertEqual(sum(o.total_cost_afn for o in run.outputs.all()), run.total_cost_afn)
        from api.serializers.data.packing import PackingRunSerializer
        self.assertEqual(len(PackingRunSerializer(run).data['full_unit_costs']), 2)
