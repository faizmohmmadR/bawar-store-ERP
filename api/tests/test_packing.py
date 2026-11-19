from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from api.models.data.packing import PackingRun
from api.models.data.inventory_batch import InventoryBatch
from api.models.data.products import Product
from api.models.data.raw_material_process import RawMaterialProcess
from api.models.data.raw_materials import (
    RawMaterial,
    RawMaterialCategory,
    RawMaterialPurchase,
    RawMaterialPurchaseItem,
    RawMaterialStock,
)
from api.models.data.stock import Stock
from api.models.data.storage_tank import ProductionStorageTransfer, StorageTank
from api.models.data.vendors import Vendor
from api.serializers.data.packing import PackingComponentInputSerializer
from api.serializers.data.stock import StockSerializer
from api.services.packing import (
    _bottle_capacity_liters,
    get_available_packing_components,
    get_available_packing_tanks,
)
from api.utils.packaging import expected_packing_component_quantities
from api.views.data.packing import PackingRunViewSet


class PackingRunApiTests(TestCase):
    def test_kg_bottle_capacity_is_converted_using_tank_density(self):
        bottle = RawMaterial(
            material_type=RawMaterial.TYPE_BOTTLE,
            category=RawMaterialCategory.objects.get(name='A'),
            capacity_kg=Decimal('0.5000'),
        )

        self.assertEqual(
            _bottle_capacity_liters(bottle, density=Decimal('0.800000')),
            Decimal('0.6250'),
        )

    def setUp(self):
        self.tank = StorageTank.objects.create(
            name='Packing Tank',
            capacity_liters=Decimal('40'),
        )
        production = RawMaterialProcess.objects.create(
            product_name='Stored liquid',
            status=RawMaterialProcess.STATUS_MOVED_TO_STORAGE,
            output_quantity_liters=Decimal('20'),
            cost_per_liter_afn=Decimal('2'),
        )
        ProductionStorageTransfer.objects.create(
            production=production,
            storage_tank=self.tank,
            quantity_liters=Decimal('20'),
        )
        vendor = Vendor.objects.create(name='Packaging Supplier')
        purchase = RawMaterialPurchase.objects.create(
            vendor=vendor,
            currency=1,
            exchange_rate=Decimal('1'),
            status='received',
        )
        self.components = []
        self.initial_material_balances = {}
        categories = {
            'bottle': RawMaterial.TYPE_BOTTLE,
            'cap': RawMaterial.TYPE_CAP,
            'label': RawMaterial.TYPE_LABEL,
            'plastic': RawMaterial.TYPE_PLASTIC,
            'carton': RawMaterial.TYPE_CARTON,
        }
        for component_type in ('bottle', 'cap', 'label', 'plastic', 'carton'):
            material = RawMaterial.objects.create(
                name=f'{component_type.title()} material',
                material_type=categories[component_type],
                category=RawMaterialCategory.objects.get(name='A') if component_type in ('bottle', 'plastic') else None,
                unit=(RawMaterial.UNIT_KG if component_type ==
                      'cap' else RawMaterial.UNIT_PIECE),
                capacity_liters={
                    'bottle': Decimal('1'),
                    'plastic': Decimal('1'),
                    'carton': Decimal('1'),
                }.get(component_type),
                bottles_per_carton=8 if component_type == 'carton' else None,
                bottles_per_plastic=1 if component_type == 'plastic' else None,
            )
            RawMaterialStock.objects.create(
                raw_material=material,
                quantity=Decimal('150' if component_type ==
                                 'bottle' else '100'),
                piece_count=100 if material.unit == RawMaterial.UNIT_KG else 0,
            )
            self.initial_material_balances[material.id] = Decimal(
                '150' if component_type == 'bottle' else '100',
            )
            purchase_item = RawMaterialPurchaseItem.objects.create(
                purchase=purchase,
                raw_material=material,
                quantity=Decimal('100'),
                piece_count=100 if material.unit == RawMaterial.UNIT_KG else 0,
                price_per_unit=Decimal('1'),
                total_price=Decimal('100'),
                price_per_unit_base=Decimal('1'),
                total_price_base=Decimal('100'),
            )
            if component_type == 'bottle':
                second_purchase = RawMaterialPurchase.objects.create(
                    vendor=vendor,
                    currency=1,
                    exchange_rate=Decimal('1'),
                    status='received',
                )
                purchase_item = RawMaterialPurchaseItem.objects.create(
                    purchase=second_purchase,
                    raw_material=material,
                    quantity=Decimal('50'),
                    piece_count=0,
                    price_per_unit=Decimal('2'),
                    total_price=Decimal('100'),
                    price_per_unit_base=Decimal('2'),
                    total_price_base=Decimal('100'),
                )
            self.components.append({
                'component_type': component_type,
                'raw_material': material.id,
                'purchase_item': purchase_item.id,
                # Bottle-based for 8 L @ 1 L bottle / matching plastic / 8 bottles per carton.
                # Backend recalculates these; values here are for request payloads.
                'quantity_pieces': {
                    'bottle': 8,
                    'cap': 8,
                    'label': 8,
                    'plastic': 8,
                    'carton': 1,
                }[component_type],
            })

    def test_kg_only_packing_preserves_mass_on_create_edit_and_delete(self):
        production = RawMaterialProcess.objects.get(product_name='Stored liquid')
        production.output_quantity_kg = Decimal('40')
        production.density_kg_per_liter = Decimal('2')
        production.save()
        self.tank.production_transfers.update(quantity_kg=Decimal('40'))
        for material in RawMaterial.objects.filter(material_type__in=['bottle', 'plastic', 'carton']):
            material.capacity_liters = None
            material.capacity_kg = Decimal('2')
            material.save()

        class OpenPacking(PackingRunViewSet):
            permission_classes = []

        payload = {'storage_tank': self.tank.pk, 'quantity_kg': '16', 'components': self.components}
        factory = APIRequestFactory()
        response = OpenPacking.as_view({'post': 'create'})(factory.post('/packing-runs/', payload, format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data['quantity_kg']), Decimal('16'))
        self.assertEqual(response.data['bottle_count'], 8)
        from api.services.tank_inventory import get_tank_mass_quantity
        self.assertEqual(get_tank_mass_quantity(self.tank), Decimal('24'))
        options = get_available_packing_tanks()
        self.assertEqual(Decimal(options[0]['available_kg']), Decimal('24'))

        run_id = response.data['id']
        payload['quantity_kg'] = '32'
        updated = OpenPacking.as_view({'put': 'update'})(factory.put(f'/packing-runs/{run_id}/', payload, format='json'), pk=run_id)
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(Decimal(updated.data['quantity_kg']), Decimal('32'))
        self.assertEqual(updated.data['bottle_count'], 16)
        self.assertEqual(get_tank_mass_quantity(self.tank), Decimal('8'))
        deleted = OpenPacking.as_view({'delete': 'destroy'})(factory.delete(f'/packing-runs/{run_id}/'), pk=run_id)
        self.assertEqual(deleted.status_code, 204, deleted.data)
        self.assertEqual(get_tank_mass_quantity(self.tank), Decimal('40'))

    def test_packaging_component_accepts_matching_material_purchase(self):
        bottle_selection = self.components[0]
        serializer = PackingComponentInputSerializer(data={
            'component_type': 'bottle',
            'raw_material': bottle_selection['raw_material'],
            'purchase_item': bottle_selection['purchase_item'],
            'quantity_pieces': 3,
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_packaging_component_rejects_wrong_material_category(self):
        cap_selection = self.components[1]
        serializer = PackingComponentInputSerializer(data={
            'component_type': 'bottle',
            'raw_material': cap_selection['raw_material'],
            'purchase_item': cap_selection['purchase_item'],
            'quantity_pieces': 3,
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn('raw_material', serializer.errors)

    def test_expected_plastic_quantity_uses_bottles_per_package(self):
        quantities = expected_packing_component_quantities(
            quantity_liters=Decimal('10'),
            bottle_capacity_liters=Decimal('1'),
            plastic_capacity_liters=Decimal('1'),
            carton_bottle_capacity_liters=Decimal('1'),
            bottles_per_plastic_count=3,
            bottles_per_carton_count=4,
        )

        self.assertEqual(quantities['plastic'], Decimal('4'))
        self.assertEqual(quantities['carton'], Decimal('3'))

    def test_expected_packaging_accepts_different_capacities(self):
        for capacities in [
            {'bottle_capacity_liters': Decimal('1'), 'plastic_capacity_liters': Decimal('0.75'), 'carton_bottle_capacity_liters': Decimal('0.5')},
            {'bottle_capacity_kg': Decimal('1'), 'quantity_kg': Decimal('8'), 'plastic_capacity_kg': Decimal('0.75'), 'carton_capacity_kg': Decimal('0.5')},
        ]:
            quantities = expected_packing_component_quantities(
                quantity_liters=Decimal('8'), bottles_per_plastic_count=2,
                bottles_per_carton_count=8, **capacities,
            )
            self.assertEqual(quantities['bottle'], Decimal('8'))
            self.assertEqual(quantities['plastic'], Decimal('4'))
            self.assertEqual(quantities['carton'], Decimal('1'))

    def test_create_packing_accepts_plastic_for_another_bottle_size(self):
        class UnrestrictedPackingRunViewSet(PackingRunViewSet):
            permission_classes = []
            authentication_classes = []

        plastic = RawMaterial.objects.get(pk=self.components[3]['raw_material'])
        plastic.capacity_liters = Decimal('0.750')
        plastic.save(update_fields=['capacity_liters', 'updated_at'])
        carton = RawMaterial.objects.get(pk=self.components[4]['raw_material'])
        carton.capacity_liters = None
        carton.capacity_kg = Decimal('2')
        carton.save(update_fields=['capacity_liters', 'capacity_kg', 'updated_at'])
        create_run = UnrestrictedPackingRunViewSet.as_view({'post': 'create'})
        response = create_run(
            APIRequestFactory().post(
                '/packing-runs/',
                {
                    'storage_tank': self.tank.id,
                    'quantity_liters': '8',
                    'bottle_volume_liters': '1',
                    'components': self.components,
                },
                format='json',
            ),
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['bottle_count'], 8)

    def test_packing_without_plastic_creates_and_reverses(self):
        class OpenPacking(PackingRunViewSet):
            permission_classes = []
            authentication_classes = []

        components = [dict(item) for item in self.components if item['component_type'] != 'plastic']
        for item in components:
            item.pop('purchase_item', None)
        factory = APIRequestFactory()
        response = OpenPacking.as_view({'post': 'create'})(factory.post(
            '/packing-runs/', {'storage_tank': self.tank.pk, 'quantity_liters': '8',
                              'components': components}, format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        run = PackingRun.objects.get(pk=response.data['id'])
        self.assertFalse(run.components.filter(component_type='plastic').exists())
        self.assertTrue(run.components.filter(component_type='label').exists())
        response = OpenPacking.as_view({'delete': 'destroy'})(factory.delete('/packing-runs/'), pk=run.pk)
        self.assertEqual(response.status_code, 204, response.data)

    def test_kg_plastic_consumes_and_costs_by_pieces(self):
        from api.services.packing import _consume_raw_material_component
        from api.serializers.data.raw_materials import RawMaterialSerializer, RawMaterialPurchaseItemSerializer
        serializer = RawMaterialSerializer(data={
            'name': 'Kg plastic without bottle sizing', 'material_type': 'plastic',
            'category': RawMaterialCategory.objects.get(name='A').pk,
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        material = serializer.save()
        self.assertEqual(material.unit, 'kg')
        stock = RawMaterialStock.objects.create(raw_material=material, quantity=10,
                                               piece_count=200, last_purchase_price=100)
        option = next(row for row in get_available_packing_components() if row['raw_material'] == material.pk)
        self.assertEqual(Decimal(option['available_quantity']), 200)
        self.assertEqual(Decimal(option['unit_cost_afn']), 5)
        unit_cost, total, allocations = _consume_raw_material_component(stock, Decimal('20'), None)
        self.assertEqual(unit_cost, 5)
        self.assertEqual(total, 100)
        stock.refresh_from_db()
        self.assertEqual(stock.quantity, 9)
        self.assertEqual(stock.piece_count, 180)
        purchase_item = RawMaterialPurchaseItem.objects.first()
        purchase = RawMaterialPurchaseItemSerializer(data={
            'purchase': purchase_item.purchase_id, 'raw_material': material.pk,
            'quantity': '10', 'price_per_unit': '100',
        })
        self.assertTrue(purchase.is_valid(), purchase.errors)
        self.assertEqual(purchase.save().piece_count, 0)

    def test_packing_allows_optional_label_to_be_omitted(self):
        class UnrestrictedPackingRunViewSet(PackingRunViewSet):
            permission_classes = []
            authentication_classes = []

        components_without_label = [
            item for item in self.components if item['component_type'] != 'label'
        ]
        create_run = UnrestrictedPackingRunViewSet.as_view({'post': 'create'})
        response = create_run(
            APIRequestFactory().post(
                '/packing-runs/',
                {
                    'storage_tank': self.tank.id,
                    'quantity_liters': '8',
                    'bottle_volume_liters': '1',
                    'components': components_without_label,
                },
                format='json',
            ),
        )

        self.assertEqual(response.status_code, 201, response.data)
        run = PackingRun.objects.get(pk=response.data['id'])
        self.assertFalse(run.components.filter(component_type='label').exists())

    def test_packing_accepts_double_label_material(self):
        class UnrestrictedPackingRunViewSet(PackingRunViewSet):
            permission_classes = []
            authentication_classes = []

        label = RawMaterial.objects.get(pk=self.components[2]['raw_material'])
        label.material_type = RawMaterial.TYPE_LABEL_DOUBLE
        label.save(update_fields=['material_type', 'updated_at'])
        create_run = UnrestrictedPackingRunViewSet.as_view({'post': 'create'})
        response = create_run(
            APIRequestFactory().post(
                '/packing-runs/',
                {
                    'storage_tank': self.tank.id,
                    'quantity_liters': '8',
                    'bottle_volume_liters': '1',
                    'components': self.components,
                },
                format='json',
            ),
        )

        self.assertEqual(response.status_code, 201, response.data)
        run = PackingRun.objects.get(pk=response.data['id'])
        label_row = run.components.get(component_type='label')
        self.assertEqual(label_row.raw_material_stock.raw_material.material_type, 'label_double')

    def test_packing_accepts_cap_label_component(self):
        class UnrestrictedPackingRunViewSet(PackingRunViewSet):
            permission_classes = []
            authentication_classes = []

        cap = RawMaterial.objects.get(pk=self.components[1]['raw_material'])
        cap.material_type = RawMaterial.TYPE_CAP_LABEL
        cap.name = 'Cap label material'
        cap.save(update_fields=['material_type', 'name', 'updated_at'])
        components = [
            dict(item, component_type='cap_label') if item['component_type'] == 'cap' else item
            for item in self.components
        ]
        create_run = UnrestrictedPackingRunViewSet.as_view({'post': 'create'})
        response = create_run(
            APIRequestFactory().post(
                '/packing-runs/',
                {
                    'storage_tank': self.tank.id,
                    'quantity_liters': '8',
                    'bottle_volume_liters': '1',
                    'components': components,
                },
                format='json',
            ),
        )

        self.assertEqual(response.status_code, 201, response.data)
        run = PackingRun.objects.get(pk=response.data['id'])
        cap_label_row = run.components.get(component_type='cap_label')
        self.assertEqual(cap_label_row.raw_material_stock.raw_material.material_type, 'cap_label')
        self.assertFalse(run.components.filter(component_type='cap').exists())

    def test_bottle_with_cap_is_packed_without_separate_cap(self):
        class UnrestrictedPackingRunViewSet(PackingRunViewSet):
            permission_classes = []
            authentication_classes = []

        bottle = RawMaterial.objects.get(pk=self.components[0]['raw_material'])
        bottle.material_type = RawMaterial.TYPE_BOTTLE_WITH_CAP
        bottle.save(update_fields=['material_type', 'updated_at'])
        components_without_cap = [
            item for item in self.components if item['component_type'] != 'cap'
        ]
        create_run = UnrestrictedPackingRunViewSet.as_view({'post': 'create'})
        response = create_run(
            APIRequestFactory().post(
                '/packing-runs/',
                {
                    'storage_tank': self.tank.id,
                    'quantity_liters': '8',
                    'bottle_volume_liters': '1',
                    'components': components_without_cap,
                },
                format='json',
            ),
        )

        self.assertEqual(response.status_code, 201, response.data)
        run = PackingRun.objects.get(pk=response.data['id'])
        self.assertFalse(run.components.filter(component_type='cap').exists())

    def test_bottle_with_cap_rejects_a_separate_cap(self):
        class UnrestrictedPackingRunViewSet(PackingRunViewSet):
            permission_classes = []
            authentication_classes = []

        bottle = RawMaterial.objects.get(pk=self.components[0]['raw_material'])
        bottle.material_type = RawMaterial.TYPE_BOTTLE_WITH_CAP
        bottle.save(update_fields=['material_type', 'updated_at'])
        create_run = UnrestrictedPackingRunViewSet.as_view({'post': 'create'})
        response = create_run(
            APIRequestFactory().post(
                '/packing-runs/',
                {
                    'storage_tank': self.tank.id,
                    'quantity_liters': '8',
                    'bottle_volume_liters': '1',
                    'components': self.components,
                },
                format='json',
            ),
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('includes one', str(response.data).lower())

    def test_available_components_include_kg_stock_package_counts(self):
        materials = get_available_packing_components()

        self.assertEqual(len(materials), 5)
        kg_material = next(
            material for material in materials
            if material['raw_material_name'] == 'Cap material'
        )
        self.assertEqual(kg_material['available_quantity'], '100.0000')
        self.assertEqual(kg_material['unit'], 'piece')

        bottle = next(
            material for material in materials if material['material_type'] == 'bottle')
        # 100 pieces at 1 AFN plus 50 at 2 AFN: 200 / 150.
        self.assertEqual(bottle['unit_cost_afn'], '1.333333')
        self.assertEqual(bottle['purchase_lots'], [])

    def test_create_packing_uses_material_volume_to_calculate_packaging_quantity(self):
        class UnrestrictedPackingRunViewSet(PackingRunViewSet):
            permission_classes = []
            authentication_classes = []

        vendor = Vendor.objects.create(name='Volume Vendor')
        purchase = RawMaterialPurchase.objects.create(
            vendor=vendor,
            currency=1,
            exchange_rate=Decimal('1'),
            status='received',
        )

        bottle_material = RawMaterial.objects.create(
            name='Bottle volume material',
            material_type=RawMaterial.TYPE_BOTTLE,
            category=RawMaterialCategory.objects.get(name='A'),
            unit=RawMaterial.UNIT_PIECE,
            capacity_liters=Decimal('0.750'),
        )
        label_material = RawMaterial.objects.create(
            name='Label volume material',
            material_type=RawMaterial.TYPE_LABEL,
            unit=RawMaterial.UNIT_PIECE,
            capacity_liters=Decimal('1'),
        )
        plastic_material = RawMaterial.objects.create(
            name='Plastic volume material',
            material_type=RawMaterial.TYPE_PLASTIC,
            category=RawMaterialCategory.objects.get(name='A'),
            unit=RawMaterial.UNIT_PIECE,
            capacity_liters=Decimal('0.750'),
            bottles_per_plastic=1,
        )
        carton_material = RawMaterial.objects.create(
            name='Carton volume material',
            material_type=RawMaterial.TYPE_CARTON,
            unit=RawMaterial.UNIT_PIECE,
            capacity_liters=Decimal('0.750'),
            bottles_per_carton=8,
        )
        for material in (bottle_material, label_material, plastic_material, carton_material):
            RawMaterialStock.objects.create(
                raw_material=material,
                quantity=Decimal('200'),
            )
            RawMaterialPurchaseItem.objects.create(
                purchase=purchase,
                raw_material=material,
                quantity=Decimal('200'),
                price_per_unit=Decimal('1'),
                total_price=Decimal('200'),
                price_per_unit_base=Decimal('1'),
                total_price_base=Decimal('200'),
            )

        components = [
            {
                'component_type': 'bottle',
                'raw_material': bottle_material.id,
                'purchase_item': RawMaterialPurchaseItem.objects.filter(raw_material=bottle_material).latest('id').id,
                'quantity_pieces': 20,
            },
            {
                'component_type': 'label',
                'raw_material': label_material.id,
                'purchase_item': RawMaterialPurchaseItem.objects.filter(raw_material=label_material).latest('id').id,
                'quantity_pieces': 20,
            },
            {
                'component_type': 'plastic',
                'raw_material': plastic_material.id,
                'purchase_item': RawMaterialPurchaseItem.objects.filter(raw_material=plastic_material).latest('id').id,
                'quantity_pieces': 20,
            },
            {
                'component_type': 'carton',
                'raw_material': carton_material.id,
                'purchase_item': RawMaterialPurchaseItem.objects.filter(raw_material=carton_material).latest('id').id,
                'quantity_pieces': 3,
            },
        ]

        create_run = UnrestrictedPackingRunViewSet.as_view({'post': 'create'})
        response = create_run(
            APIRequestFactory().post(
                '/packing-runs/',
                {
                    'storage_tank': self.tank.id,
                    'quantity_liters': '15',
                    'bottle_volume_liters': '0.750',
                    'components': components,
                },
                format='json',
            ),
        )

        self.assertEqual(response.status_code, 201, response.data)
        run = PackingRun.objects.get(pk=response.data['id'])
        self.assertEqual(run.bottle_count, 20)
        self.assertEqual(run.product.bottle_capacity_liters, Decimal('0.7500'))
        self.assertIsNone(run.product.carton_capacity_liters)
        self.assertEqual(run.product.bottles_per_carton, 1)
        self.assertEqual(run.components.get(
            component_type='bottle').quantity_pieces, Decimal('20'))
        self.assertEqual(run.components.get(
            component_type='plastic').quantity_pieces, Decimal('20'))
        self.assertEqual(run.components.get(
            component_type='carton').quantity_pieces, Decimal('3'))
        self.assertEqual(run.finished_stock.piece_amount, Decimal('20'))
        stock_data = StockSerializer(run.finished_stock).data
        self.assertEqual(stock_data['carton_amount'], 0)
        self.assertEqual(stock_data['loose_pieces'], 0)
        batch = InventoryBatch.objects.get(
            product=run.product,
            notes__contains=run.packing_number,
        )
        self.assertEqual(batch.pieces_received, Decimal('20'))
        self.assertEqual(batch.cartons_received, Decimal('20'))

    def test_create_packing_consumes_raw_material_stock_at_moving_average(self):
        class UnrestrictedPackingRunViewSet(PackingRunViewSet):
            permission_classes = []
            authentication_classes = []

        create_run = UnrestrictedPackingRunViewSet.as_view({'post': 'create'})
        response = create_run(
            APIRequestFactory().post(
                '/packing-runs/',
                {
                    'storage_tank': self.tank.id,
                    'quantity_liters': '8',
                    'bottle_volume_liters': '1',
                    'components': self.components,
                },
                format='json',
            ),
        )

        self.assertEqual(response.status_code, 201, response.data)
        run = PackingRun.objects.get(pk=response.data['id'])
        self.assertEqual(run.product.name, 'Bottle material')
        self.assertEqual(run.product.raw_material_id, self.components[0]['raw_material'])
        self.assertEqual(run.finished_stock.product_id, run.product_id)
        self.assertEqual(
            Stock.objects.get(pk=run.finished_stock_id).piece_amount,
            Decimal('8'),
        )
        self.assertEqual(run.bottle_count, 8)
        self.assertEqual(run.components.count(), 5)
        expected_by_type = {
            'bottle': Decimal('8'),
            'cap': Decimal('8'),
            'label': Decimal('8'),
            'plastic': Decimal('8'),
            'carton': Decimal('1'),
        }
        for component in run.components.select_related('raw_material_stock__raw_material'):
            expected = expected_by_type[component.component_type]
            self.assertEqual(component.quantity_pieces, expected)
            raw_stock = component.raw_material_stock
            if raw_stock.raw_material.unit == RawMaterial.UNIT_KG:
                self.assertEqual(raw_stock.piece_count, 100 - int(expected))
                self.assertEqual(raw_stock.quantity, Decimal('100') - expected)
            else:
                self.assertEqual(
                    raw_stock.quantity,
                    self.initial_material_balances[raw_stock.raw_material_id] - expected,
                )
            if component.component_type == 'bottle':
                self.assertEqual(component.unit_cost_afn, Decimal('1.333333'))
                self.assertEqual(
                    component.inventory_allocations[0]['purchase_item'],
                    RawMaterialPurchaseItem.objects.filter(raw_material_id=self.components[0]['raw_material']).order_by('purchase__purchase_date', 'id').first().pk,
                )
            self.assertEqual(
                Decimal(component.inventory_allocations[0]['quantity']),
                expected,
            )
            self.assertEqual(
                component.inventory_allocations[0]['piece_count'],
                int(expected) if raw_stock.raw_material.unit == RawMaterial.UNIT_KG else 0,
            )
        self.assertEqual(
            Decimal(get_available_packing_tanks()[0]['available_liters']),
            Decimal('12'),
        )

    def test_create_packing_uses_client_component_quantities(self):
        class UnrestrictedPackingRunViewSet(PackingRunViewSet):
            permission_classes = []
            authentication_classes = []

        # Client can use extra packaging pieces (e.g. waste); finished bottles still follow liquid math.
        custom_components = [
            {
                **item,
                'quantity_pieces': {
                    'bottle': 10,
                    'cap': 10,
                    'label': 10,
                    'plastic': 10,
                    'carton': 2,
                }[item['component_type']],
            }
            for item in self.components
        ]
        create_run = UnrestrictedPackingRunViewSet.as_view({'post': 'create'})
        response = create_run(
            APIRequestFactory().post(
                '/packing-runs/',
                {
                    'storage_tank': self.tank.id,
                    'quantity_liters': '8',
                    'bottle_volume_liters': '1',
                    'components': custom_components,
                },
                format='json',
            ),
        )

        self.assertEqual(response.status_code, 201, response.data)
        run = PackingRun.objects.get(pk=response.data['id'])
        self.assertEqual(run.bottle_count, 8)
        expected_by_type = {
            'bottle': Decimal('10'),
            'cap': Decimal('10'),
            'label': Decimal('10'),
            'plastic': Decimal('10'),
            'carton': Decimal('2'),
        }
        for component in run.components.all():
            self.assertEqual(
                component.quantity_pieces,
                expected_by_type[component.component_type],
            )
        self.assertEqual(
            Stock.objects.get(pk=run.finished_stock_id).piece_amount,
            Decimal('8'),
        )

    def test_create_packing_allows_cap_to_be_omitted(self):
        class UnrestrictedPackingRunViewSet(PackingRunViewSet):
            permission_classes = []
            authentication_classes = []

        cap_stock = RawMaterialStock.objects.get(
            raw_material_id=self.components[1]['raw_material'],
        )
        components_without_cap = [
            item for item in self.components if item['component_type'] != 'cap'
        ]
        create_run = UnrestrictedPackingRunViewSet.as_view({'post': 'create'})
        response = create_run(
            APIRequestFactory().post(
                '/packing-runs/',
                {
                    'storage_tank': self.tank.id,
                    'quantity_liters': '8',
                    'bottle_volume_liters': '1',
                    'components': components_without_cap,
                },
                format='json',
            ),
        )

        self.assertEqual(response.status_code, 201, response.data)
        run = PackingRun.objects.get(pk=response.data['id'])
        self.assertEqual(run.components.count(), 4)
        self.assertFalse(run.components.filter(component_type='cap').exists())
        cap_stock.refresh_from_db()
        self.assertEqual(cap_stock.piece_count, 100)

    def test_update_replaces_tank_and_component_stock_deductions(self):
        class UnrestrictedPackingRunViewSet(PackingRunViewSet):
            permission_classes = []
            authentication_classes = []

        create_run = UnrestrictedPackingRunViewSet.as_view({'post': 'create'})
        create_response = create_run(
            APIRequestFactory().post(
                '/packing-runs/',
                {
                    'storage_tank': self.tank.id,
                    'quantity_liters': '8',
                    'bottle_volume_liters': '1',
                    'components': self.components,
                },
                format='json',
            ),
        )
        self.assertEqual(create_response.status_code,
                         201, create_response.data)
        run_id = create_response.data['id']

        # Client may send adjusted used quantities for 6 L; backend must keep them.
        revised_components = [
            {
                **item,
                'quantity_pieces': {
                    'bottle': 7,
                    'label': 7,
                    'plastic': 7,
                    'carton': 2,
                }[item['component_type']],
            }
            for item in self.components
            if item['component_type'] != 'cap'
        ]
        update_run = UnrestrictedPackingRunViewSet.as_view({'put': 'update'})
        update_response = update_run(
            APIRequestFactory().put(
                f'/packing-runs/{run_id}/',
                {
                    'storage_tank': self.tank.id,
                    'quantity_liters': '6',
                    'bottle_volume_liters': '1',
                    'components': revised_components,
                    'notes': 'Adjusted usage',
                },
                format='json',
            ),
            pk=run_id,
        )

        self.assertEqual(update_response.status_code,
                         200, update_response.data)
        self.assertEqual(PackingRun.objects.count(), 1)
        run = PackingRun.objects.get(pk=run_id)
        self.assertEqual(run.quantity_liters, Decimal('6.0000'))
        self.assertEqual(run.bottle_count, 6)
        self.assertEqual(run.notes, 'Adjusted usage')
        self.assertEqual(run.components.count(), 4)
        self.assertEqual(
            Stock.objects.get(pk=run.finished_stock_id).piece_amount,
            Decimal('6.0000'),
        )
        self.assertEqual(
            Decimal(get_available_packing_tanks()[0]['available_liters']),
            Decimal('14'),
        )
        self.assertEqual(
            InventoryBatch.objects.filter(
                notes__endswith=run.packing_number).count(),
            3,
        )
        self.assertEqual(
            InventoryBatch.objects.get(
                product=run.product, notes__endswith=run.packing_number).remaining_pieces,
            Decimal('6'),
        )
        expected_by_type = {
            'bottle': Decimal('7'),
            'label': Decimal('7'),
            'plastic': Decimal('7'),
            'carton': Decimal('2'),
        }
        for component in run.components.select_related('raw_material_stock__raw_material'):
            expected = expected_by_type[component.component_type]
            self.assertEqual(component.quantity_pieces, expected)
            stock = component.raw_material_stock
            initial = self.initial_material_balances[stock.raw_material_id]
            if stock.raw_material.unit == RawMaterial.UNIT_KG:
                self.assertEqual(stock.piece_count, int(initial - expected))
            else:
                self.assertEqual(stock.quantity, initial - expected)
        cap_stock = RawMaterialStock.objects.get(
            raw_material_id=self.components[1]['raw_material'],
        )
        self.assertEqual(cap_stock.piece_count, 100)

    def test_update_rejected_if_finished_batch_was_consumed(self):
        class UnrestrictedPackingRunViewSet(PackingRunViewSet):
            permission_classes = []
            authentication_classes = []

        create_run = UnrestrictedPackingRunViewSet.as_view({'post': 'create'})
        create_response = create_run(
            APIRequestFactory().post(
                '/packing-runs/',
                {
                    'storage_tank': self.tank.id,
                    'quantity_liters': '8',
                    'bottle_volume_liters': '1',
                    'components': self.components,
                },
                format='json',
            ),
        )
        run_id = create_response.data['id']
        bottle_material_id = self.components[0]['raw_material']
        bottle_stock_before_update = RawMaterialStock.objects.get(
            raw_material_id=bottle_material_id,
        ).quantity
        output_batch = InventoryBatch.objects.get(
            product_id=create_response.data['product'], notes__endswith=create_response.data['packing_number'],
        )
        output_batch.remaining_pieces -= Decimal('1')
        output_batch.save(update_fields=['remaining_pieces', 'updated_at'])

        update_run = UnrestrictedPackingRunViewSet.as_view({'put': 'update'})
        response = update_run(
            APIRequestFactory().put(
                f'/packing-runs/{run_id}/',
                {
                    'storage_tank': self.tank.id,
                    'quantity_liters': '6',
                    'bottle_volume_liters': '1',
                    'components': self.components,
                },
                format='json',
            ),
            pk=run_id,
        )

        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(
            PackingRun.objects.get(pk=run_id).quantity_liters,
            Decimal('8.0000'),
        )
        self.assertEqual(
            RawMaterialStock.objects.get(
                raw_material_id=bottle_material_id).quantity,
            bottle_stock_before_update,
        )
        self.assertEqual(
            Decimal(get_available_packing_tanks()[0]['available_liters']),
            Decimal('12'),
        )

    def make_output_run(self, liters='8'):
        from api.services.packing import create_packing_run
        return create_packing_run(storage_tank_id=self.tank.pk, quantity_liters=liters, bottle_volume_liters='1', components=self.components)

    def test_separate_outputs_use_exact_materials_and_preserve_total_cost(self):
        run = self.make_output_run()
        outputs = list(run.outputs.select_related('stock__product'))
        self.assertEqual(len(outputs), 3)
        self.assertEqual(sum(output.total_cost_afn for output in outputs), run.total_cost_afn)
        for output in outputs:
            source = next(row for row in self.components if row['component_type'] == output.component_type)
            self.assertEqual(output.stock.product.raw_material_id, source['raw_material'])
            self.assertEqual(output.quantity_pieces, Decimal(source['quantity_pieces']))
            self.assertEqual(output.stock.piece_amount, output.quantity_pieces)
            self.assertEqual(output.inventory_batch.remaining_pieces, output.quantity_pieces)
            data = StockSerializer(output.stock).data
            self.assertEqual(Decimal(str(data['piece_amount'])), output.quantity_pieces)
            for key in ('bottle', 'carton', 'plastic'):
                expected = float(output.quantity_pieces) if key == output.component_type else 0
                self.assertEqual(data[f'{key}_amount'], expected)

    def test_repeated_packing_increases_same_three_material_rows(self):
        first = self.make_output_run()
        stock_ids = set(first.outputs.values_list('stock_id', flat=True))
        second = self.make_output_run()
        self.assertEqual(set(second.outputs.values_list('stock_id', flat=True)), stock_ids)
        self.assertEqual(Product.objects.filter(raw_material__isnull=False).count(), 3)
        for output in second.outputs.select_related('stock'):
            self.assertEqual(output.stock.piece_amount, output.quantity_pieces * 2)

    def test_same_sized_material_with_different_identity_gets_separate_stock(self):
        first = self.make_output_run()
        old = RawMaterial.objects.get(pk=self.components[0]['raw_material'])
        new = RawMaterial.objects.create(name='Different named bottle', material_type=old.material_type, unit='piece', category=old.category, capacity_liters=old.capacity_liters)
        line = RawMaterialPurchaseItem.objects.get(pk=self.components[0]['purchase_item'])
        new_line = RawMaterialPurchaseItem.objects.create(purchase=line.purchase, raw_material=new, quantity=50, price_per_unit=2)
        RawMaterialStock.objects.create(raw_material=new, quantity=50, last_purchase_price=2)
        self.components[0] = {**self.components[0], 'raw_material': new.pk, 'purchase_item': new_line.pk}
        second = self.make_output_run()
        self.assertNotEqual(first.finished_stock_id, second.finished_stock_id)
        self.assertEqual(Product.objects.filter(raw_material__isnull=False).count(), 4)

    def test_manual_material_inflow_reuses_packing_stock_and_preserves_raw_stock(self):
        from api.views.data.stock import StockViewSet
        run = self.make_output_run()
        output = run.outputs.get(component_type='carton')
        material = output.stock.product.raw_material
        before = RawMaterialStock.objects.get(raw_material=material).quantity
        view = type('OpenStock', (StockViewSet,), {'permission_classes': []}).as_view({'post': 'add_material'})
        response = view(APIRequestFactory().post('/', {'raw_material': material.pk, 'quantity': '5.2', 'unit_cost_afn': '3'}, format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['id'], output.stock_id)
        self.assertEqual(Decimal(response.data['piece_amount']), Decimal('6.2000'))
        self.assertEqual(
            response.data['product_details']['raw_material_details']['name'],
            material.name,
        )
        self.assertEqual(
            Decimal(response.data['product_details']['raw_material_details']['capacity_liters']),
            material.capacity_liters,
        )
        self.assertEqual(RawMaterialStock.objects.get(raw_material=material).quantity, before)
        self.assertEqual(Product.objects.filter(raw_material=material).count(), 1)

    def test_deleting_packing_reverses_all_three_outputs(self):
        from api.services.packing import delete_packing_run
        run = self.make_output_run()
        stock_ids = list(run.outputs.values_list('stock_id', flat=True))
        batch_ids = list(run.outputs.values_list('inventory_batch_id', flat=True))
        delete_packing_run(packing_run_id=run.pk)
        self.assertFalse(run.outputs.exists())
        self.assertFalse(InventoryBatch.objects.filter(pk__in=batch_ids).exists())
        self.assertTrue(all(stock.piece_amount == 0 for stock in Stock.objects.filter(pk__in=stock_ids)))
        for row in self.components:
            stock = RawMaterialStock.objects.get(raw_material_id=row['raw_material'])
            self.assertEqual(stock.quantity, self.initial_material_balances[stock.raw_material_id])

    def test_used_carton_output_blocks_run_reversal_and_rolls_back(self):
        from api.services.packing import delete_packing_run
        from rest_framework.exceptions import ValidationError
        run = self.make_output_run()
        output = run.outputs.get(component_type='carton')
        output.inventory_batch.remaining_pieces = 0
        output.inventory_batch.save(update_fields=['remaining_pieces'])
        before = dict(run.outputs.values_list('stock_id', 'stock__piece_amount'))
        with self.assertRaises(ValidationError):
            delete_packing_run(packing_run_id=run.pk)
        self.assertEqual(dict(run.outputs.values_list('stock_id', 'stock__piece_amount')), before)
        self.assertEqual(run.outputs.count(), 3)

    def test_manual_inflow_rejects_non_positive_or_invalid_quantities(self):
        from api.views.data.stock import StockViewSet
        view = type('OpenStock', (StockViewSet,), {'permission_classes': []}).as_view({'post': 'add_material'})
        for quantity in ('0', '-1', 'NaN'):
            response = view(APIRequestFactory().post('/', {'raw_material': self.components[0]['raw_material'], 'quantity': quantity}, format='json'))
            self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Product.objects.filter(raw_material__isnull=False).exists())

    def test_manual_inflow_allows_fractional_plastic_stock(self):
        from api.views.data.stock import StockViewSet
        view = type('OpenStock', (StockViewSet,), {'permission_classes': []}).as_view({'post': 'add_material'})
        response = view(APIRequestFactory().post('/', {
            'raw_material': self.components[3]['raw_material'],
            'quantity': '67.1',
            'unit_cost_afn': '4',
        }, format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data['piece_amount']), Decimal('67.1000'))
        self.assertEqual(Decimal(response.data['buy_price']), Decimal('4.0000'))

    def test_manual_bottle_stock_rejects_fractional_quantity(self):
        from api.views.data.stock import StockViewSet
        view = type('OpenStock', (StockViewSet,), {'permission_classes': []}).as_view({'post': 'add_material'})
        response = view(APIRequestFactory().post('/', {
            'raw_material': self.components[0]['raw_material'],
            'quantity': '1.5',
        }, format='json'))
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('quantity', response.data)

    def test_legacy_run_without_outputs_still_reverses(self):
        from api.services.packing import delete_packing_run
        run = self.make_output_run()
        # Emulate the pre-migration single-output shape with its original cost.
        for output in list(run.outputs.exclude(component_type='bottle')):
            from api.services.material_finished_stock import reverse_output
            reverse_output(output, action='deleted')
        bottle = run.outputs.get(component_type='bottle')
        run.cost_per_bottle_afn = bottle.unit_cost_afn
        run.save(update_fields=['cost_per_bottle_afn'])
        bottle.delete()
        delete_packing_run(packing_run_id=run.pk)
        self.assertEqual(Stock.objects.get(pk=run.finished_stock_id).piece_amount, Decimal('0'))


    def test_archived_bottle_stock_is_listed_without_purchase(self):
        bottle_id = self.components[0]['raw_material']
        material = RawMaterial.objects.get(pk=bottle_id)
        material.soft_delete()
        for line in RawMaterialPurchaseItem.objects.filter(raw_material_id=bottle_id):
            line.soft_delete()
        stock = RawMaterialStock.objects.get(raw_material_id=bottle_id)
        before_quantity = stock.quantity
        stock.last_purchase_price = Decimal('10')
        stock.save(update_fields=['last_purchase_price'])
        option = next(row for row in get_available_packing_components() if row['raw_material'] == bottle_id)
        self.assertEqual(option['category'], material.category_id)
        self.assertEqual(option['purchase_lots'], [])
        self.assertEqual(Decimal(option['available_quantity']), stock.quantity)
        self.assertEqual(Decimal(option['unit_cost_afn']), Decimal('10'))
        components = [{key: value for key, value in row.items() if key != 'purchase_item'} for row in self.components]
        view = type('OpenPacking', (PackingRunViewSet,), {'permission_classes': []}).as_view({'post': 'create'})
        response = view(APIRequestFactory().post('/', {'storage_tank': self.tank.pk, 'quantity_liters': '8', 'bottle_volume_liters': '1', 'components': components}, format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        run = PackingRun.objects.get(pk=response.data['id'])
        component = run.components.get(component_type='bottle')
        self.assertEqual(component.unit_cost_afn, Decimal('10'))
        self.assertEqual(component.inventory_allocations[0]['source'], 'stock')
        stock.refresh_from_db()
        self.assertEqual(stock.quantity, before_quantity - Decimal('8'))

    def test_saved_output_prices_and_weighted_stock_match_cost_allocation(self):
        from api.services.material_finished_stock import add_material_stock
        bottle = RawMaterial.objects.get(pk=self.components[0]['raw_material'])
        add_material_stock(material=bottle, quantity=4, total_cost=40)
        run = self.make_output_run()
        outputs = {output.component_type: output for output in run.outputs.select_related('stock', 'inventory_batch')}
        self.assertEqual(run.total_cost_afn, Decimal('51.6667'))
        # unit_cost_afn on the output now equals the pool weighted average (matches stock.buy_price)
        self.assertEqual(outputs['bottle'].unit_cost_afn, Decimal('6.888892'))
        self.assertEqual(outputs['carton'].unit_cost_afn, Decimal('1'))
        self.assertEqual(outputs['plastic'].unit_cost_afn, Decimal('1'))
        self.assertEqual(outputs['bottle'].inventory_batch.receipt_unit_cost, Decimal('5.333338'))
        self.assertEqual(outputs['bottle'].inventory_batch.unit_cost, Decimal('6.888892'))
        self.assertEqual(outputs['bottle'].stock.piece_amount, Decimal('12'))
        self.assertEqual(outputs['bottle'].stock.buy_price, Decimal('6.888892'))
        self.assertEqual(sum(output.total_cost_afn for output in outputs.values()), run.total_cost_afn)
