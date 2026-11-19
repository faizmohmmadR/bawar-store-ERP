from decimal import Decimal

from django.test import TestCase
from django.db import IntegrityError, transaction
from rest_framework.test import APIRequestFactory

from api.models.data.raw_materials import RawMaterial, RawMaterialCategory, RawMaterialStock, RawMaterialPurchase, RawMaterialPurchaseItem
from api.models.data.raw_material_process import RawMaterialProcess
from api.models.data.storage_tank import StorageTank
from api.models.data.vendors import Vendor
from api.serializers.data.raw_materials import RawMaterialSerializer, RawMaterialCategorySerializer
from api.serializers.data.storage_tank import StorageTankSerializer
from api.services.raw_material_stock import reconcile_raw_material_stock
from api.services.tank_inventory import get_tank_mass_quantity
from api.views.data.raw_material_process import RawMaterialProcessViewSet
from api.views.data.raw_materials import RawMaterialViewSet, RawMaterialStockViewSet


class OpenProduction(RawMaterialProcessViewSet):
    permission_classes = []


class MaterialCategoriesAndMassTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.category = RawMaterialCategory.objects.get(name='A')
        self.material = RawMaterial.objects.create(name='Ingredient', unit='kg')
        purchase = RawMaterialPurchase.objects.create(vendor=Vendor.objects.create(name='Supplier'), status='received', currency=1)
        RawMaterialPurchaseItem.objects.create(purchase=purchase, raw_material=self.material, quantity=Decimal('10'), price_per_unit=Decimal('20'))
        reconcile_raw_material_stock(purchase, previous_status='draft', previous_items=[], save_stock=True)

    def create_process(self, **overrides):
        payload = {
            'product_name': 'Kg production', 'output_quantity_kg': '5', 'water_quantity_kg': '4.5',
            'items': [{'raw_material': self.material.pk, 'quantity': '500', 'quantity_unit': 'g'}],
        }
        payload.update(overrides)
        return OpenProduction.as_view({'post': 'create'})(self.factory.post('/raw-material-processes/', payload, format='json'))

    def test_migration_seeds_categories_and_custom_categories_are_reusable(self):
        self.assertEqual(set(RawMaterialCategory.objects.values_list('name', flat=True)), set('ABCDEFG'))
        category = RawMaterialCategorySerializer(data={'name': 'H'})
        self.assertTrue(category.is_valid(), category.errors)
        category.save()
        duplicate = RawMaterialCategorySerializer(data={'name': ' h '})
        self.assertFalse(duplicate.is_valid())
        for material_type in ['bottle', 'bottle_with_cap', 'plastic']:
            serializer = RawMaterialSerializer(data={
                'name': material_type, 'material_type': material_type, 'unit': 'piece',
                'category': category.instance.pk, 'capacity_kg': '0.5', 'bottles_per_plastic': 6,
            })
            self.assertTrue(serializer.is_valid(), serializer.errors)
            material = serializer.save()
            self.assertEqual(material.category.name, 'H')
            self.assertEqual(serializer.data['category_name'], 'H')

    def test_category_required_for_new_bottles_and_not_valid_for_chemistry(self):
        for payload in [
            {'name': 'Bottle', 'material_type': 'bottle', 'capacity_kg': '1'},
            {'name': 'Chemistry', 'material_type': 'chemistry', 'category': self.category.pk},
        ]:
            serializer = RawMaterialSerializer(data=payload)
            self.assertFalse(serializer.is_valid())
            self.assertIn('category', serializer.errors)

    def test_product_create_and_edit_use_exact_canonical_kg(self):
        from api.models.data.products import Product
        from api.views.data.products import ProductViewSet
        class OpenProducts(ProductViewSet):
            permission_classes = []
        create = OpenProducts.as_view({'post': 'create'})
        response = create(self.factory.post('/products/', {'name': 'Mass product', 'bottle_capacity_kg': '0.7500'}, format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        product = Product.objects.get(pk=response.data['id'])
        self.assertEqual(product.bottle_capacity_kg, Decimal('0.7500'))
        # An existing historical density must not cause rounded volume to change mass.
        product.density_kg_per_liter = Decimal('10.4')
        product.save()
        patch = OpenProducts.as_view({'patch': 'partial_update'})
        updated = patch(self.factory.patch('/products/', {'bottle_capacity_kg': '0.7500'}, format='json'), pk=product.pk)
        self.assertEqual(updated.status_code, 200, updated.data)
        product.refresh_from_db()
        self.assertEqual(product.bottle_capacity_kg, Decimal('0.7500'))
        self.assertEqual(Decimal(str(updated.data['bottle_capacity_kg'])), Decimal('0.7500'))
        from api.utils.packaging import kilograms_per_bottle, pieces_from_kilograms
        self.assertEqual(kilograms_per_bottle(product), Decimal('0.7500'))
        self.assertEqual(pieces_from_kilograms(Decimal('1.5'), product), Decimal('2'))

    def test_database_rejects_packaging_without_category(self):
        for material_type in ['bottle', 'bottle_with_cap', 'plastic']:
            with self.assertRaises(IntegrityError), transaction.atomic():
                RawMaterial.objects.create(name=f'Missing {material_type}', material_type=material_type)

    def test_partial_update_cannot_leave_packaging_without_category(self):
        legacy = RawMaterial(name='Legacy bottle', material_type='bottle', capacity_kg=Decimal('1'))
        serializer = RawMaterialSerializer(legacy, data={'description': 'Updated'}, partial=True)
        self.assertFalse(serializer.is_valid())
        self.assertIn('category', serializer.errors)
        valid = RawMaterialSerializer(legacy, data={'category': self.category.pk}, partial=True)
        self.assertTrue(valid.is_valid(), valid.errors)

    def test_material_and_stock_category_filters_preserve_material_identity(self):
        bottle = RawMaterial.objects.create(name='A bottle', material_type='bottle', unit='piece', category=self.category)
        RawMaterialStock.objects.create(raw_material=bottle, quantity=10)
        class OpenMaterials(RawMaterialViewSet):
            permission_classes = []
        class OpenStocks(RawMaterialStockViewSet):
            permission_classes = []
        materials = OpenMaterials.as_view({'get': 'list'})(self.factory.get('/raw-materials/', {'category': self.category.pk}))
        self.assertEqual([row['id'] for row in materials.data], [bottle.pk])
        stocks = OpenStocks.as_view({'get': 'list'})(self.factory.get('/raw-material-stocks/', {'raw_material__category': self.category.pk, 'raw_material__material_type': 'bottle'}))
        self.assertEqual([row['raw_material'] for row in stocks.data], [bottle.pk])
        self.assertEqual(stocks.data[0]['raw_material_details']['category_name'], 'A')

    def test_grams_deduct_kilograms_and_cost_the_same_quantity(self):
        response = self.create_process()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data['items'][0]['quantity']), Decimal('0.5'))
        self.assertEqual(Decimal(response.data['material_cost_afn']), Decimal('10'))
        self.assertEqual(Decimal(response.data['cost_per_kg_afn']), Decimal('2'))
        self.assertEqual(Decimal(response.data['water_quantity_kg']), Decimal('4.5'))
        self.assertEqual(RawMaterialStock.objects.get(raw_material=self.material).quantity, Decimal('9.5'))
        process_id = response.data['id']
        deleted = OpenProduction.as_view({'delete': 'destroy'})(self.factory.delete(f'/raw-material-processes/{process_id}/'), pk=process_id)
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(RawMaterialStock.objects.get(raw_material=self.material).quantity, Decimal('10'))

    def test_unsupported_units_and_insufficient_grams_roll_back(self):
        for quantity, unit in [('500', 'L'), ('10001', 'g'), ('0.01', 'g')]:
            response = self.create_process(items=[{'raw_material': self.material.pk, 'quantity': quantity, 'quantity_unit': unit}])
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(RawMaterialProcess.objects.count(), 0)
        self.assertEqual(RawMaterialStock.objects.get(raw_material=self.material).quantity, Decimal('10'))

    def test_kg_only_storage_transfer_capacity_and_edit_validation(self):
        tank_serializer = StorageTankSerializer(data={'name': 'Mass tank', 'capacity_kg': '6'})
        self.assertTrue(tank_serializer.is_valid(), tank_serializer.errors)
        tank = tank_serializer.save()
        response = self.create_process(status='moved_to_storage', storage_transfers=[{'storage_tank': tank.pk, 'quantity_kg': '5'}])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(get_tank_mass_quantity(tank), Decimal('5'))
        shrink = StorageTankSerializer(tank, data={'capacity_kg': '4'}, partial=True)
        self.assertFalse(shrink.is_valid())
        overflow = self.create_process(status='moved_to_storage', storage_transfers=[{'storage_tank': tank.pk, 'quantity_kg': '2'}])
        self.assertEqual(overflow.status_code, 400, overflow.data)
        self.assertEqual(get_tank_mass_quantity(tank), Decimal('5'))
        self.assertEqual(RawMaterialStock.objects.get(raw_material=self.material).quantity, Decimal('9.5'))

    def test_gram_material_unit_can_be_created_and_updated(self):
        serializer = RawMaterialSerializer(data={'name': 'Fine powder', 'unit': 'g'})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        material = serializer.save()
        self.assertEqual(material.unit, 'g')
        update = RawMaterialSerializer(material, data={'name': 'Updated powder', 'unit': 'g'}, partial=True)
        self.assertTrue(update.is_valid(), update.errors)
        self.assertEqual(update.save().unit, 'g')

    def test_production_converts_kilograms_to_gram_inventory(self):
        self.material.unit = 'g'
        self.material.save(update_fields=['unit'])
        stock = RawMaterialStock.objects.get(raw_material=self.material)
        response = self.create_process(items=[{
            'raw_material': self.material.pk, 'quantity': '0.005', 'quantity_unit': 'kg',
        }])
        self.assertEqual(response.status_code, 201, response.data)
        stock.refresh_from_db()
        self.assertEqual(stock.quantity, Decimal('5'))

    def test_production_keeps_grams_in_gram_inventory(self):
        self.material.unit = 'g'
        self.material.save(update_fields=['unit'])
        stock = RawMaterialStock.objects.get(raw_material=self.material)
        response = self.create_process(items=[{
            'raw_material': self.material.pk, 'quantity': '2.5', 'quantity_unit': 'g',
        }])
        self.assertEqual(response.status_code, 201, response.data)
        stock.refresh_from_db()
        self.assertEqual(stock.quantity, Decimal('7.5'))
