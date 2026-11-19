from decimal import Decimal
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIRequestFactory
from api.tests import test_packing_cost_audit as fixtures
from api.models.data.products import Product
from api.models.data.raw_materials import RawMaterialStock
from api.models.data.packing import PackingRun
from api.models.data.stock import Stock
from api.services.packing import create_packing_run, delete_packing_run, update_packing_run
from api.services.material_finished_stock import add_material_stock, resolve_output_product
from api.serializers.data.stock import StockSerializer
from api.serializers.data.sales import SalesItemsSerializer
from api.views.data.stock import StockViewSet


class NamedStockProductTests(TestCase):
    setUp = fixtures.PackingCostAuditTests.setUp

    def pack(self, choices=None, components=None):
        return create_packing_run(storage_tank_id=self.tank.pk, quantity_liters=8,
            bottle_volume_liters=1, components=self.components if components is None else components,
            filled_bottle_count=8, output_products=choices or [])

    def choices(self, suffix=''):
        return [{'component_type': kind, 'product_name': f'My {kind}{suffix}'} for kind in ['bottle', 'carton', 'plastic']]

    def stock_api(self, data):
        view = type('OpenStock', (StockViewSet,), {'permission_classes': []}).as_view({'post': 'add_material'})
        return view(APIRequestFactory().post('/', data, format='json'))

    def test_each_output_uses_its_chosen_name_and_preserves_cost_and_raw_consumption(self):
        run = self.pack(self.choices())
        for output in run.outputs.select_related('stock__product'):
            self.assertEqual(output.stock.product.name, f'My {output.component_type}')
            self.assertEqual(output.stock.product.packaging_type, output.component_type)
            self.assertIsNone(output.stock.product.raw_material_id)
            data = StockSerializer(output.stock).data
            self.assertEqual(Decimal(str(data[f'{output.component_type}_amount'])), output.quantity_pieces)
        self.assertEqual(sum(o.total_cost_afn for o in run.outputs.all()), run.total_cost_afn)
        self.assertEqual(RawMaterialStock.objects.get(raw_material=self.materials['bottle']).quantity, 92)

    def test_same_raw_material_can_fill_different_named_products(self):
        first = self.pack([{'component_type': 'bottle', 'product_name': 'Retail bottle'}], [self.components[0]])
        second = self.pack([{'component_type': 'bottle', 'product_name': 'Wholesale bottle'}], [self.components[0]])
        self.assertNotEqual(first.product_id, second.product_id)
        self.assertEqual(first.finished_stock.piece_amount, 8)
        self.assertEqual(second.finished_stock.piece_amount, 8)

    def test_manual_inflow_merges_into_named_packing_product(self):
        run = self.pack(self.choices())
        old = run.finished_stock
        initial_value = Decimal(str(StockSerializer(old).data['stock_value_afn']))
        response = self.stock_api({'packaging_type': 'bottle', 'product': run.product_id,
            'quantity': 4, 'unit_cost_afn': 20})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['id'], old.pk)
        self.assertEqual(Decimal(str(response.data['on_hand_quantity'])), 12)
        self.assertAlmostEqual(Decimal(str(response.data['stock_value_afn'])), initial_value + 80, places=4)
        self.assertEqual(response.data['product_details']['name'], 'My bottle')

    def test_direct_new_name_can_later_receive_packing(self):
        response = self.stock_api({'packaging_type': 'bottle', 'product_name': 'My brand',
            'bottle_capacity_kg': 1, 'quantity': 5, 'unit_cost_afn': 10})
        self.assertEqual(response.status_code, 201, response.data)
        product_id = response.data['product']
        run = self.pack([{'component_type': 'bottle', 'product': product_id}], [self.components[0]])
        self.assertEqual(run.product_id, product_id)
        run.finished_stock.refresh_from_db()
        self.assertEqual(run.finished_stock.piece_amount, 13)

    def test_carton_and_plastic_direct_entries_use_their_own_units_and_names(self):
        for kind in ['carton', 'plastic']:
            response = self.stock_api({'packaging_type': kind, 'product_name': f'Branded {kind}',
                'quantity': '2.5', 'unit_cost_afn': 10})
            self.assertEqual(response.status_code, 201, response.data)
            self.assertEqual(Decimal(str(response.data[f'{kind}_amount'])), Decimal('2.5'))
            self.assertEqual(response.data['bottle_amount'], 0)
            self.assertEqual(response.data['product_details']['material_type'], kind)

    def test_same_name_reuses_product_case_insensitively(self):
        a = self.stock_api({'packaging_type': 'carton', 'product_name': '  My   Brand  ', 'quantity': 2})
        b = self.stock_api({'packaging_type': 'carton', 'product_name': 'my brand', 'quantity': 3})
        self.assertEqual(a.status_code, 201, a.data)
        self.assertEqual(b.status_code, 201, b.data)
        self.assertEqual(a.data['product'], b.data['product'])
        self.assertEqual(Decimal(str(b.data['on_hand_quantity'])), 5)

    def test_wrong_output_type_rolls_back_entire_packing(self):
        product = Product.objects.create(name='Carton only', packaging_type='carton', bottles_per_carton=1)
        with self.assertRaises(ValidationError):
            self.pack([{'component_type': 'bottle', 'product': product.pk}])
        self.assertEqual(PackingRun.objects.count(), 0)
        self.assertEqual(RawMaterialStock.objects.get(raw_material=self.materials['bottle']).quantity, 100)
        self.assertFalse(Stock.objects.exists())

    def test_incompatible_bottle_size_rejected_without_consuming_anything(self):
        product = Product.objects.create(name='Small bottle', packaging_type='bottle', bottles_per_carton=1,
            bottle_capacity_kg=Decimal('.5'), bottle_capacity_liters=Decimal('.5'))
        with self.assertRaises(ValidationError):
            self.pack([{'component_type': 'bottle', 'product': product.pk}])
        self.assertEqual(RawMaterialStock.objects.get(raw_material=self.materials['bottle']).quantity, 100)

    def test_custom_name_with_all_packaging_optional(self):
        run = self.pack([{'component_type': 'bottle', 'product_name': 'Filled without new packaging'}], [])
        self.assertEqual(run.product.name, 'Filled without new packaging')
        self.assertEqual(run.components.count(), 0)
        self.assertEqual(run.total_cost_afn, 24)
        self.assertEqual(run.finished_stock.piece_amount, 8)

    def test_edit_and_delete_keep_product_and_reverse_exact_balances(self):
        run = self.pack([{'component_type': 'bottle', 'product_name': 'Editable name'}], [self.components[0]])
        product_id = run.product_id
        run = update_packing_run(packing_run_id=run.pk, storage_tank_id=self.tank.pk,
            quantity_liters=4, bottle_volume_liters=1, components=[dict(self.components[0], quantity_pieces=4)],
            output_products=[{'component_type': 'bottle', 'product': product_id}])
        self.assertEqual(run.product_id, product_id)
        self.assertEqual(run.finished_stock.piece_amount, 4)
        delete_packing_run(packing_run_id=run.pk)
        self.assertEqual(Stock.objects.get(product_id=product_id).piece_amount, 0)
        self.assertEqual(RawMaterialStock.objects.get(raw_material=self.materials['bottle']).quantity, 100)

    def test_named_filled_bottles_support_returns_and_repacking(self):
        from api.services.repacking import return_to_pack, create_returned_packing_run, correct_returned_quantity
        run = self.pack([{'component_type': 'bottle', 'product_name': 'Returnable named bottle'}], [self.components[0]])
        returned = return_to_pack(stock_id=run.finished_stock_id, bottle_count=4)
        returned = correct_returned_quantity(packing_return_id=returned.pk, bottle_count=3, expected_bottle_count=4)
        repacked = create_returned_packing_run(packing_return_id=returned.pk, bottle_count=3, components=[])
        self.assertEqual(repacked.outputs.get(component_type='bottle').stock.product_id, run.product_id)
        self.assertEqual(repacked.total_cost_afn, 15)

    def test_named_stock_sale_unit_validation(self):
        for kind in ['bottle', 'carton', 'plastic']:
            response = self.stock_api({'packaging_type': kind, 'product_name': f'Sale {kind}', 'quantity': 10, 'unit_cost_afn': 2})
            stock = Stock.objects.get(pk=response.data['id'])
            serializer = SalesItemsSerializer(data={'stock': stock.pk, 'quantity': 2, 'unit': kind, 'sell_price': 3}, partial=True)
            self.assertTrue(serializer.is_valid(), serializer.errors)
            serializer = SalesItemsSerializer(data={'stock': stock.pk, 'quantity': 2, 'unit': 'plastic' if kind != 'plastic' else 'carton', 'sell_price': 3}, partial=True)
            self.assertFalse(serializer.is_valid())

    def test_product_picker_filters_by_output_kind(self):
        self.stock_api({'packaging_type': 'carton', 'product_name': 'A carton', 'quantity': 1})
        self.stock_api({'packaging_type': 'bottle', 'product_name': 'A bottle', 'quantity': 1})
        view = type('OpenStock', (StockViewSet,), {'permission_classes': []}).as_view({'get': 'output_products'})
        response = view(APIRequestFactory().get('/', {'kind': 'carton'}))
        self.assertEqual(response.status_code, 200)
        self.assertEqual([p['name'] for p in response.data['results']], ['A carton'])

    def test_packing_api_round_trip_preserves_named_output_selection(self):
        from api.views.data.packing import PackingRunViewSet
        view_cls = type('OpenPacking', (PackingRunViewSet,), {'permission_classes': []})
        payload = {'storage_tank': self.tank.pk, 'quantity_kg': 8, 'components': [self.components[0]],
            'output_products': [{'component_type': 'bottle', 'product_name': 'API brand'}]}
        response = view_cls.as_view({'post': 'create'})(APIRequestFactory().post('/', payload, format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        product_id = response.data['outputs'][0]['product']
        self.assertEqual(response.data['outputs'][0]['product_name'], 'API brand')
        payload['output_products'] = [{'component_type': 'bottle', 'product': product_id}]
        response = view_cls.as_view({'put': 'update'})(APIRequestFactory().put('/', payload, format='json'), pk=response.data['id'])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['outputs'][0]['product'], product_id)

    def test_existing_single_bottle_products_remain_selectable(self):
        legacy = Product.objects.create(name='Existing single bottle', bottles_per_carton=1,
            bottle_capacity_kg=1, bottle_capacity_liters=1)
        run = self.pack([{'component_type': 'bottle', 'product': legacy.pk}], [])
        self.assertEqual(run.product_id, legacy.pk)
        self.assertEqual(StockSerializer(run.finished_stock).data['product_details']['material_type'], 'bottle')

    def test_legacy_general_product_creation_does_not_require_packaging_type(self):
        from api.serializers.data.products import ProductSerializer
        serializer = ProductSerializer(data={'name': 'Legacy general product'})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertIsNone(serializer.save().packaging_type)

    def test_returned_packing_can_save_bottles_under_a_new_product_name(self):
        from api.services.repacking import return_to_pack, create_returned_packing_run
        run = self.pack([{'component_type': 'bottle', 'product_name': 'Original brand'}], [self.components[0]])
        returned = return_to_pack(stock_id=run.finished_stock_id, bottle_count=4)
        repacked = create_returned_packing_run(packing_return_id=returned.pk, bottle_count=4, components=[],
            output_products=[{'component_type': 'bottle', 'product_name': 'Repacked brand'}])
        self.assertEqual(repacked.product.name, 'Repacked brand')
        self.assertEqual(repacked.finished_stock.product_id, repacked.product_id)
        self.assertEqual(repacked.total_cost_afn, 20)
        self.assertEqual(repacked.finished_stock.piece_amount, 4)

    def test_typing_an_existing_material_product_name_reuses_its_stock(self):
        stock, _, _ = add_material_stock(material=self.materials['carton'], quantity=2, total_cost=10)
        response = self.stock_api({'packaging_type': 'carton', 'product_name': stock.product.name, 'quantity': 3, 'unit_cost_afn': 5})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['id'], stock.pk)
        self.assertEqual(Decimal(str(response.data['on_hand_quantity'])), 5)

    def test_new_packing_api_all_existing_and_new_name_combinations(self):
        from itertools import product as combinations
        from api.views.data.packing import PackingRunViewSet
        kinds = ['bottle', 'carton', 'plastic']
        existing = {kind: Product.objects.create(name=f'Existing {kind}', packaging_type=kind,
            bottles_per_carton=1, bottle_capacity_kg=1 if kind == 'bottle' else None,
            bottle_capacity_liters=1 if kind == 'bottle' else None) for kind in kinds}
        view = type('OpenPacking', (PackingRunViewSet,), {'permission_classes': []})
        factory = APIRequestFactory()
        for index, modes in enumerate(combinations(['existing', 'new'], repeat=3)):
            with self.subTest(modes=dict(zip(kinds, modes))):
                choices = [{'component_type': kind, **({'product': existing[kind].pk} if mode == 'existing'
                    else {'product_name': f'New {kind} case {index}'})} for kind, mode in zip(kinds, modes)]
                response = view.as_view({'post': 'create'})(factory.post('/', {
                    'storage_tank': self.tank.pk, 'quantity_kg': '8',
                    'components': self.components, 'output_products': choices,
                }, format='json'))
                self.assertEqual(response.status_code, 201, response.data)
                outputs = {row['component_type']: row for row in response.data['outputs']}
                self.assertEqual(set(outputs), set(kinds))
                self.assertEqual(sum(Decimal(row['total_cost_afn']) for row in outputs.values()), Decimal(response.data['total_cost_afn']))
                for kind, mode in zip(kinds, modes):
                    row = outputs[kind]
                    self.assertEqual(row['product_name'], f'Existing {kind}' if mode == 'existing' else f'New {kind} case {index}')
                    if mode == 'existing':
                        self.assertEqual(row['product'], existing[kind].pk)
                    saved = Stock.objects.get(pk=row['stock'])
                    self.assertEqual(saved.product.name, row['product_name'])
                    self.assertEqual(saved.piece_amount, 8 if kind == 'bottle' else 1)
                deleted = view.as_view({'delete': 'destroy'})(factory.delete('/'), pk=response.data['id'])
                self.assertEqual(deleted.status_code, 204, getattr(deleted, 'data', None))
                self.assertEqual(RawMaterialStock.objects.get(raw_material=self.materials['bottle']).quantity, 100)

    def test_packing_without_bottle_material_derives_count_from_selected_stock_product(self):
        from api.views.data.packing import PackingRunViewSet
        product = Product.objects.create(name='Automatic bottle size', packaging_type='bottle', bottles_per_carton=1,
            bottle_capacity_kg=2, bottle_capacity_liters=2)
        view = type('OpenPacking', (PackingRunViewSet,), {'permission_classes': []}).as_view({'post': 'create'})
        response = view(APIRequestFactory().post('/', {'storage_tank': self.tank.pk, 'quantity_kg': 8,
            'components': [], 'output_products': [{'component_type': 'bottle', 'product': product.pk}]}, format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['bottle_count'], 4)
        self.assertEqual(Decimal(response.data['cost_per_bottle_afn']), 6)

    def test_automatic_bottle_count_rejects_missing_size_or_fractional_bottles(self):
        for capacity in [None, Decimal('3')]:
            with self.subTest(capacity=capacity):
                product = Product.objects.create(name=f'Invalid bottle size {capacity}', packaging_type='bottle',
                    bottles_per_carton=1, bottle_capacity_kg=capacity, bottle_capacity_liters=capacity)
                with self.assertRaises(ValidationError):
                    create_packing_run(storage_tank_id=self.tank.pk, quantity_liters=8, bottle_volume_liters=0,
                        components=[], output_products=[{'component_type': 'bottle', 'product': product.pk}])
        self.assertFalse(PackingRun.objects.exists())

    def test_edit_old_manual_count_run_uses_its_original_exact_fill_size(self):
        run = create_packing_run(storage_tank_id=self.tank.pk, quantity_liters=8, bottle_volume_liters=0,
            filled_bottle_count=3, components=[])
        updated = update_packing_run(packing_run_id=run.pk, storage_tank_id=self.tank.pk,
            quantity_liters=8, quantity_kg=8, bottle_volume_liters=run.bottle_volume_liters, components=[],
            output_products=[{'component_type': 'bottle', 'product': run.product_id}])
        self.assertEqual(updated.bottle_count, 3)
        self.assertEqual(updated.finished_stock.piece_amount, 3)

    def test_category_filter_matches_named_output_material_without_cross_matching_other_outputs(self):
        from api.models.data.raw_materials import RawMaterialCategory
        bottle_category = RawMaterialCategory.objects.create(name='Bottle category filter')
        plastic_category = RawMaterialCategory.objects.create(name='Plastic category filter')
        for kind, category in [('bottle', bottle_category), ('plastic', plastic_category)]:
            self.materials[kind].category = category
            self.materials[kind].save()
        run = self.pack(self.choices())
        outputs = {row.component_type: row.stock_id for row in run.outputs.all()}
        view = type('OpenStock', (StockViewSet,), {'permission_classes': []}).as_view({'get': 'list'})
        for category, kind in [(bottle_category, 'bottle'), (plastic_category, 'plastic')]:
            with self.subTest(category=category.name):
                response = view(APIRequestFactory().get('/', {'page_size': 25, 'category': category.pk}))
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual([row['id'] for row in response.data['results']], [outputs[kind]])
                self.assertEqual(response.data['count'], 1)
        response = view(APIRequestFactory().get('/', {'page_size': 25, 'category': bottle_category.pk, 'product': run.product_id, 'search': 'My bottle'}))
        self.assertEqual(response.data['count'], 1)
        response = view(APIRequestFactory().get('/', {'page_size': 25, 'category': plastic_category.pk, 'product': run.product_id}))
        self.assertEqual(response.data['count'], 0)
        response = view(APIRequestFactory().get('/', {'page_size': 25}))
        self.assertEqual(response.data['count'], 3)

    def test_category_filter_supports_existing_material_stock_and_rejects_invalid_values(self):
        stock, _, _ = add_material_stock(material=self.materials['bottle'], quantity=2, total_cost=10)
        view = type('OpenStock', (StockViewSet,), {'permission_classes': []}).as_view({'get': 'list'})
        response = view(APIRequestFactory().get('/', {'page_size': 25, 'category': self.materials['bottle'].category_id}))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['results'][0]['id'], stock.pk)
        response = view(APIRequestFactory().get('/', {'page_size': 25, 'category': 'not-a-category'}))
        self.assertEqual(response.status_code, 400)

    def test_material_type_filter_matches_named_legacy_and_inferred_bottle_stock(self):
        named = self.pack(self.choices())
        by_kind = {row.component_type: row.stock_id for row in named.outputs.all()}
        legacy, _, _ = add_material_stock(material=self.materials['bottle'], quantity=2, total_cost=10)
        inferred_product = Product.objects.create(name='Older bottle product', bottles_per_carton=1, bottle_capacity_kg=1)
        inferred, _, _ = add_material_stock(material=None, product=inferred_product, quantity=2, total_cost=10)
        view = type('OpenStock', (StockViewSet,), {'permission_classes': []}).as_view({'get': 'list'})
        for kind in ['bottle', 'carton', 'plastic']:
            response = view(APIRequestFactory().get('/', {'page_size': 25, 'material_type': kind}))
            self.assertEqual(response.status_code, 200, response.data)
            expected = {by_kind[kind]} | ({legacy.pk, inferred.pk} if kind == 'bottle' else set())
            self.assertEqual({row['id'] for row in response.data['results']}, expected)
        response = view(APIRequestFactory().get('/', {'page_size': 25, 'material_type': 'plastic',
            'category': self.materials['plastic'].category_id, 'product': named.outputs.get(component_type='plastic').stock.product_id,
            'search': 'My plastic'}))
        self.assertEqual(response.data['count'], 1)
        response = view(APIRequestFactory().get('/', {'material_type': 'unknown'}))
        self.assertEqual(response.status_code, 400)

    def test_edit_api_can_choose_existing_products_or_new_names_for_all_outputs(self):
        from api.views.data.packing import PackingRunViewSet
        view_cls = type('OpenPacking', (PackingRunViewSet,), {'permission_classes': []})
        factory = APIRequestFactory()
        run = self.pack(self.choices())
        original = {row.component_type: row.stock.product_id for row in run.outputs.all()}
        for mode in ['existing', 'new']:
            with self.subTest(mode=mode):
                choices = [{'component_type': kind, **({'product': original[kind]} if mode == 'existing'
                    else {'product_name': f'Edited {kind}'})} for kind in ['bottle', 'carton', 'plastic']]
                payload = {'storage_tank': self.tank.pk, 'quantity_kg': 4,
                    'components': [dict(row, quantity_pieces={'bottle': 4, 'cap': 4, 'label': 8, 'carton': 1, 'plastic': 1}[row['component_type']]) for row in self.components],
                    'output_products': choices}
                response = view_cls.as_view({'put': 'update'})(factory.put('/', payload, format='json'), pk=run.pk)
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data['bottle_count'], 4)
                outputs = {row['component_type']: row for row in response.data['outputs']}
                for kind in ['bottle', 'carton', 'plastic']:
                    self.assertEqual(outputs[kind]['product_name'], f'My {kind}' if mode == 'existing' else f'Edited {kind}')
                self.assertEqual(sum(Decimal(row['total_cost_afn']) for row in outputs.values()), Decimal(response.data['total_cost_afn']))

    def test_edit_api_keeps_materials_optional_and_derives_bottle_count(self):
        from api.views.data.packing import PackingRunViewSet
        run = self.pack(self.choices())
        view = type('OpenPacking', (PackingRunViewSet,), {'permission_classes': []}).as_view({'put': 'update'})
        response = view(APIRequestFactory().put('/', {'storage_tank': self.tank.pk, 'quantity_kg': 4,
            'components': [], 'output_products': [{'component_type': 'bottle', 'product': run.product_id}]}, format='json'), pk=run.pk)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['bottle_count'], 4)
        self.assertEqual(response.data['components'], [])
        self.assertEqual(len(response.data['outputs']), 1)
        self.assertEqual(Decimal(response.data['total_cost_afn']), 12)

    def test_optional_output_api_all_blank_existing_and_new_combinations(self):
        from itertools import product as combinations
        from api.views.data.packing import PackingRunViewSet
        kinds = ['bottle', 'carton', 'plastic']
        existing = {kind: Product.objects.create(name=f'Optional existing {kind}', packaging_type=kind,
            bottles_per_carton=1, bottle_capacity_kg=1 if kind == 'bottle' else None,
            bottle_capacity_liters=1 if kind == 'bottle' else None) for kind in kinds}
        view = type('OpenPacking', (PackingRunViewSet,), {'permission_classes': []})
        factory = APIRequestFactory()
        for index, modes in enumerate(combinations(['blank', 'existing', 'new'], repeat=3)):
            with self.subTest(modes=dict(zip(kinds, modes))):
                choices = [{'component_type': kind, **({'product': existing[kind].pk} if mode == 'existing'
                    else {'product_name': f'Optional new {kind} {index}'})} for kind, mode in zip(kinds, modes) if mode != 'blank']
                previous_products = Product.objects.count()
                previous_stock = Stock.objects.count()
                response = view.as_view({'post': 'create'})(factory.post('/', {'storage_tank': self.tank.pk,
                    'quantity_kg': 8, 'components': self.components, 'output_products': choices}, format='json'))
                self.assertEqual(response.status_code, 201, response.data)
                outputs = {row['component_type']: row for row in response.data['outputs']}
                self.assertEqual(set(outputs), {kind for kind, mode in zip(kinds, modes) if mode != 'blank'})
                if choices:
                    self.assertEqual(sum(Decimal(row['total_cost_afn']) for row in outputs.values()), Decimal(response.data['total_cost_afn']))
                else:
                    self.assertIsNone(response.data['product'])
                    self.assertIsNone(response.data['finished_stock'])
                    self.assertEqual(Product.objects.count(), previous_products)
                    self.assertEqual(Stock.objects.count(), previous_stock)
                self.assertEqual(RawMaterialStock.objects.get(raw_material=self.materials['bottle']).quantity, 92)
                deleted = view.as_view({'delete': 'destroy'})(factory.delete('/'), pk=response.data['id'])
                self.assertEqual(deleted.status_code, 204, getattr(deleted, 'data', None))
                self.assertEqual(RawMaterialStock.objects.get(raw_material=self.materials['bottle']).quantity, 100)

    def test_no_materials_or_stock_output_can_save_without_bottle_count_or_size(self):
        from api.views.data.packing import PackingRunViewSet
        view = type('OpenPacking', (PackingRunViewSet,), {'permission_classes': []}).as_view({'post': 'create'})
        response = view(APIRequestFactory().post('/', {'storage_tank': self.tank.pk, 'quantity_kg': 8,
            'components': [], 'output_products': []}, format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['outputs'], [])
        self.assertEqual(response.data['bottle_count'], 0)
        self.assertEqual(Decimal(response.data['total_cost_afn']), 24)
        self.assertFalse(Stock.objects.exists())
        self.assertFalse(Product.objects.exists())
        delete_packing_run(packing_run_id=response.data['id'])

    def test_edit_clearing_stock_output_removes_old_output_and_saves_no_new_stock(self):
        from api.views.data.packing import PackingRunViewSet
        run = self.pack(self.choices())
        old_stock_ids = list(run.outputs.values_list('stock_id', flat=True))
        view = type('OpenPacking', (PackingRunViewSet,), {'permission_classes': []}).as_view({'put': 'update'})
        response = view(APIRequestFactory().put('/', {'storage_tank': self.tank.pk, 'quantity_kg': 8,
            'components': self.components, 'output_products': []}, format='json'), pk=run.pk)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['outputs'], [])
        self.assertIsNone(response.data['finished_stock'])
        self.assertEqual(sum(Stock.objects.filter(pk__in=old_stock_ids).values_list('piece_amount', flat=True)), 0)
        delete_packing_run(packing_run_id=run.pk)

    def test_returned_only_blank_outputs_do_not_recreate_bottle_or_carton_stock(self):
        from api.services.repacking import return_to_pack, create_returned_packing_run
        run = self.pack([{'component_type': 'bottle', 'product_name': 'Return optional source'}], [self.components[0]])
        from django.utils import timezone
        from datetime import timedelta
        expiry = timezone.localdate() + timedelta(days=30)
        batch = run.outputs.get(component_type='bottle').inventory_batch
        type(batch).objects.filter(pk=batch.pk).update(expire_date=expiry)
        returned = return_to_pack(stock_id=run.finished_stock_id, bottle_count=4)
        run.finished_stock.refresh_from_db()
        before = run.finished_stock.piece_amount
        repacked = create_returned_packing_run(packing_return_id=returned.pk, bottle_count=4,
            components=[{'component_type': 'carton', 'raw_material': self.materials['carton'].pk, 'quantity_pieces': 1}], output_products=[])
        self.assertFalse(repacked.outputs.exists())
        self.assertIsNone(repacked.finished_stock_id)
        run.finished_stock.refresh_from_db()
        self.assertEqual(run.finished_stock.piece_amount, before)
        delete_packing_run(packing_run_id=repacked.pk)
        returned.refresh_from_db()
        self.assertEqual(returned.remaining_bottle_count, 4)
        self.assertEqual(returned.expire_date, expiry)
