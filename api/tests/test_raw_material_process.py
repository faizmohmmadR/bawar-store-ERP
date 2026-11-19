from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from api.models.data.raw_materials import (
    RawMaterial,
    RawMaterialCategory,
    RawMaterialPurchase,
    RawMaterialPurchaseItem,
    RawMaterialStock,
)
from api.models.data.raw_material_process import RawMaterialProcess
from api.models.data.stock import Stock
from api.models.data.vendors import Vendor
from api.models.data.storage_tank import StorageTank
from api.serializers.data.raw_material_process import RawMaterialProcessSerializer
from api.services.raw_material_stock import reconcile_raw_material_stock
from api.services.raw_material_process import (
    consume_raw_materials_for_process,
    get_available_raw_material_process_options,
)
from api.views.data.raw_material_process import RawMaterialProcessViewSet


class RawMaterialProcessApiTests(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(
            name='Production ingredients supplier')
        self.material = RawMaterial.objects.create(
            name='Base liquid', unit='kg')

    def receive_lot(self, invoice, quantity, piece_count, price):
        purchase = RawMaterialPurchase.objects.create(
            vendor=self.vendor,
            invoice_number=invoice,
            bill_number=f'BILL-{invoice}',
            currency=1,
            status='received',
        )
        RawMaterialPurchaseItem.objects.create(
            purchase=purchase,
            raw_material=self.material,
            quantity=Decimal(quantity),
            piece_count=piece_count,
            price_per_unit=Decimal(price),
        )
        reconcile_raw_material_stock(
            purchase,
            previous_status='draft',
            previous_items=[],
            save_stock=True,
        )
        return purchase

    def test_production_expense_currency_must_be_afn(self):
        serializer = RawMaterialProcessSerializer(data={
            'product_name': 'AFN-only production',
            'process_date': timezone.now().isoformat(),
            'output_quantity_liters': '1',
            'extra_expense': '1',
            'expense_currency': 2,
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn('expense_currency', serializer.errors)

    def test_available_production_materials_only_include_chemistry(self):
        self.receive_lot('CHEMISTRY-LOT', '10', 0, '2')
        packaging_material = RawMaterial.objects.create(
            name='Bottle packaging',
            material_type=RawMaterial.TYPE_BOTTLE,
            category=RawMaterialCategory.objects.get(name='A'),
            unit=RawMaterial.UNIT_PIECE,
        )
        RawMaterialStock.objects.create(
            raw_material=packaging_material,
            quantity=Decimal('25'),
        )

        options = get_available_raw_material_process_options()

        self.assertEqual(
            [option['raw_material'] for option in options],
            [self.material.id],
        )

    def test_process_api_costs_fifo_lots_and_reduces_stock(self):
        first_lot = self.receive_lot('PURCHASE-A', '10', 2, '2')
        second_lot = self.receive_lot('PURCHASE-B', '10', 4, '4')

        class UnrestrictedRawMaterialProcessViewSet(RawMaterialProcessViewSet):
            permission_classes = []

        create_process = UnrestrictedRawMaterialProcessViewSet.as_view({
                                                                       'post': 'create'})
        request = APIRequestFactory().post(
            '/raw-material-processes/',
            {
                'product_name': 'Finished mix',
                'process_date': timezone.now().isoformat(),
                'output_quantity_liters': '10',
                'extra_expense': '2',
                'expense_currency': 1,
                'items': [{
                    'raw_material': self.material.id,
                    'quantity': '15',
                    'piece_count': 3,
                }],
            },
            format='json',
        )
        response = create_process(request)

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Stock.objects.count(), 0)
        self.assertEqual(
            Decimal(response.data['material_cost_afn']), Decimal('40.0000'))
        self.assertEqual(
            Decimal(response.data['total_cost_afn']), Decimal('42.0000'))
        self.assertEqual(
            Decimal(response.data['cost_per_liter_afn']), Decimal('4.200000'))
        self.assertEqual(len(response.data['items'][0]['purchase_sources']), 2)
        self.assertEqual(
            [
                source['purchase_item']
                for source in response.data['items'][0]['purchase_sources']
            ],
            list(RawMaterialPurchaseItem.objects.filter(
                purchase__in=[first_lot, second_lot]
            ).order_by('purchase__purchase_date', 'id').values_list('id', flat=True)),
        )
        self.assertEqual(
            [
                source['purchase_invoice_number']
                for source in response.data['items'][0]['purchase_sources']
            ],
            [first_lot.invoice_number, second_lot.invoice_number],
        )
        self.assertEqual(
            [
                source['supplier_bill_number']
                for source in response.data['items'][0]['purchase_sources']
            ],
            [first_lot.bill_number, second_lot.bill_number],
        )

        stock = RawMaterialStock.objects.get(raw_material=self.material)
        self.assertEqual(stock.quantity, Decimal('5.0000'))
        self.assertEqual(stock.piece_count, 3)

    def test_process_saves_water_without_creating_a_material_or_cost(self):
        self.receive_lot('PURCHASE-WATER-TEST', '10', 0, '2')

        class UnrestrictedRawMaterialProcessViewSet(RawMaterialProcessViewSet):
            permission_classes = []

        create_process = UnrestrictedRawMaterialProcessViewSet.as_view({
            'post': 'create'})
        request = APIRequestFactory().post(
            '/raw-material-processes/',
            {
                'product_name': 'Water mix',
                'process_date': timezone.now().isoformat(),
                'output_quantity_liters': '5',
                'water_quantity_liters': '3.5',
                'extra_expense': '0',
                'expense_currency': 1,
                'items': [{
                    'raw_material': self.material.id,
                    'quantity': '2',
                    'piece_count': 0,
                }],
            },
            format='json',
        )
        response = create_process(request)

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            Decimal(response.data['water_quantity_liters']), Decimal('3.5000'))
        self.assertEqual(
            Decimal(response.data['material_cost_afn']), Decimal('4.0000'))
        self.assertEqual(
            Decimal(response.data['cost_per_liter_afn']), Decimal('0.800000'))
        self.assertEqual(len(response.data['items']), 1)

    def test_process_rejects_duplicate_raw_materials_without_consuming_stock(self):
        self.receive_lot('DUPLICATE-INGREDIENTS', '10', 0, '2')

        class UnrestrictedRawMaterialProcessViewSet(RawMaterialProcessViewSet):
            permission_classes = []

        create_process = UnrestrictedRawMaterialProcessViewSet.as_view({
                                                                       'post': 'create'})
        request = APIRequestFactory().post(
            '/raw-material-processes/',
            {
                'product_name': 'Duplicate ingredient test',
                'process_date': timezone.now().isoformat(),
                'output_quantity_liters': '5',
                'water_quantity_liters': '1',
                'extra_expense': '0',
                'expense_currency': 1,
                'items': [
                    {'raw_material': self.material.id,
                        'quantity': '2', 'piece_count': 0},
                    {'raw_material': self.material.id,
                        'quantity': '3', 'piece_count': 0},
                ],
            },
            format='json',
        )

        response = create_process(request)

        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(RawMaterialProcess.objects.count(), 0)
        stock = RawMaterialStock.objects.get(raw_material=self.material)
        self.assertEqual(stock.quantity, Decimal('10.0000'))

    def test_process_create_and_edit_save_storage_transfers(self):
        self.receive_lot('PURCHASE-STORAGE-TEST', '10', 0, '2')
        tank = StorageTank.objects.create(
            name='Production tank',
            capacity_liters=Decimal('10'),
        )

        class UnrestrictedRawMaterialProcessViewSet(RawMaterialProcessViewSet):
            permission_classes = []

        create_process = UnrestrictedRawMaterialProcessViewSet.as_view({
            'post': 'create'})
        response = create_process(APIRequestFactory().post(
            '/raw-material-processes/',
            {
                'product_name': 'Stored batch',
                'process_date': timezone.now().isoformat(),
                'status': 'moved_to_storage',
                'output_quantity_liters': '5',
                'water_quantity_liters': '3',
                'extra_expense': '0',
                'expense_currency': 1,
                'items': [{
                    'raw_material': self.material.id,
                    'quantity': '2',
                    'piece_count': 0,
                }],
                'storage_transfers': [{
                    'storage_tank': tank.id,
                    'quantity_liters': '4',
                }],
            },
            format='json',
        ))

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['status'], 'moved_to_storage')
        self.assertEqual(len(response.data['storage_transfers']), 1)
        self.assertEqual(
            response.data['storage_transfers'][0]['storage_tank_name'],
            tank.name,
        )
        process_id = response.data['id']

        update_process = UnrestrictedRawMaterialProcessViewSet.as_view({
            'put': 'update'})
        updated = update_process(APIRequestFactory().put(
            f'/raw-material-processes/{process_id}/',
            {
                'product_name': 'Stored batch edited',
                'process_date': timezone.now().isoformat(),
                'status': 'moved_to_storage',
                'output_quantity_liters': '6',
                'water_quantity_liters': '3',
                'extra_expense': '0',
                'expense_currency': 1,
                'items': [{
                    'raw_material': self.material.id,
                    'quantity': '2',
                    'piece_count': 0,
                }],
                'storage_transfers': [{
                    'storage_tank': tank.id,
                    'quantity_liters': '6',
                }],
            },
            format='json',
        ), pk=process_id)

        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data['status'], 'moved_to_storage')
        self.assertEqual(
            Decimal(updated.data['storage_transfers'][0]['quantity_liters']),
            Decimal('6'),
        )

        completed = update_process(APIRequestFactory().put(
            f'/raw-material-processes/{process_id}/',
            {
                'product_name': 'Stored batch completed',
                'process_date': timezone.now().isoformat(),
                'status': 'completed',
                'output_quantity_liters': '6',
                'water_quantity_liters': '3',
                'extra_expense': '0',
                'expense_currency': 1,
            },
            format='json',
        ), pk=process_id)
        self.assertEqual(completed.status_code, 200, completed.data)
        self.assertEqual(completed.data['status'], 'completed')
        self.assertEqual(completed.data['storage_transfers'], [])

    def test_process_update_restores_and_reconsumes_stock(self):
        self.receive_lot('PURCHASE-EDIT-TEST', '10', 2, '2')

        class UnrestrictedRawMaterialProcessViewSet(RawMaterialProcessViewSet):
            permission_classes = []

        create_process = UnrestrictedRawMaterialProcessViewSet.as_view({
            'post': 'create'})
        response = create_process(APIRequestFactory().post(
            '/raw-material-processes/',
            {
                'product_name': 'Before edit',
                'process_date': timezone.now().isoformat(),
                'output_quantity_liters': '5',
                'extra_expense': '0',
                'expense_currency': 1,
                'items': [{
                    'raw_material': self.material.id,
                    'quantity': '4',
                    'piece_count': 1,
                }],
            },
            format='json',
        ))
        process_id = response.data['id']

        update_process = UnrestrictedRawMaterialProcessViewSet.as_view({
            'put': 'update'})
        updated = update_process(APIRequestFactory().put(
            f'/raw-material-processes/{process_id}/',
            {
                'product_name': 'After edit',
                'process_date': timezone.now().isoformat(),
                'output_quantity_liters': '8',
                'water_quantity_liters': '6',
                'extra_expense': '0',
                'expense_currency': 1,
                'items': [{
                    'raw_material': self.material.id,
                    'quantity': '3',
                    'piece_count': 1,
                }],
            },
            format='json',
        ), pk=process_id)

        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data['product_name'], 'After edit')
        self.assertEqual(
            Decimal(updated.data['water_quantity_liters']), Decimal('6.0000'))
        self.assertEqual(
            RawMaterialStock.objects.get(raw_material=self.material).quantity,
            Decimal('7.0000'))
        self.assertEqual(
            Decimal(updated.data['cost_per_liter_afn']), Decimal('0.750000'))

    def test_process_can_use_an_explicit_purchase_price_lot(self):
        self.receive_lot('PURCHASE-A', '10', 2, '2')
        selected_purchase = self.receive_lot('PURCHASE-B', '10', 4, '4')
        selected_item = selected_purchase.items.get()

        class UnrestrictedRawMaterialProcessViewSet(RawMaterialProcessViewSet):
            permission_classes = []

        create_process = UnrestrictedRawMaterialProcessViewSet.as_view({
                                                                       'post': 'create'})
        request = APIRequestFactory().post(
            '/raw-material-processes/',
            {
                'product_name': 'Selected lot mix',
                'process_date': timezone.now().isoformat(),
                'output_quantity_liters': '5',
                'extra_expense': '0',
                'expense_currency': 1,
                'items': [{
                    'raw_material': self.material.id,
                    'quantity': '5',
                    'piece_count': 2,
                    'purchase_item': selected_item.id,
                }],
            },
            format='json',
        )
        response = create_process(request)

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            Decimal(response.data['material_cost_afn']), Decimal('20.0000'))
        sources = response.data['items'][0]['purchase_sources']
        self.assertEqual(len(sources), 1)
        self.assertEqual(sources[0]['purchase_item'], selected_item.id)
        stock = RawMaterialStock.objects.get(raw_material=self.material)
        self.assertEqual(stock.quantity, Decimal('15.0000'))
        self.assertEqual(stock.piece_count, 4)

    def test_deleting_process_restores_stock_and_preserves_audit_items(self):
        self.receive_lot('PURCHASE-DELETE-TEST', '10', 2, '2')
        process = RawMaterialProcess.objects.create(
            product_name='Deleted batch',
            output_quantity_liters=Decimal('5'),
        )
        consume_raw_materials_for_process(process, [{
            'raw_material': self.material.id,
            'quantity': '4',
            'piece_count': 1,
        }])
        process_item_id = process.items.get().id

        class UnrestrictedRawMaterialProcessViewSet(RawMaterialProcessViewSet):
            permission_classes = []

        delete_process = UnrestrictedRawMaterialProcessViewSet.as_view({
            'delete': 'destroy'})
        response = delete_process(
            APIRequestFactory().delete(
                f'/raw-material-processes/{process.id}/'),
            pk=process.id,
        )

        self.assertEqual(response.status_code, 204)
        process.refresh_from_db()
        stock = RawMaterialStock.objects.get(raw_material=self.material)
        self.assertIsNotNone(process.deleted_at)
        self.assertTrue(process.items.filter(pk=process_item_id).exists())
        self.assertEqual(stock.quantity, Decimal('10.0000'))
        self.assertEqual(stock.piece_count, 2)

    def test_process_rejects_quantity_beyond_selected_lot_remaining(self):
        selected_purchase = self.receive_lot('PURCHASE-A', '5', 2, '2')
        self.receive_lot('PURCHASE-B', '20', 4, '4')
        selected_item = selected_purchase.items.get()

        class UnrestrictedRawMaterialProcessViewSet(RawMaterialProcessViewSet):
            permission_classes = []

        create_process = UnrestrictedRawMaterialProcessViewSet.as_view({
                                                                       'post': 'create'})
        request = APIRequestFactory().post(
            '/raw-material-processes/',
            {
                'product_name': 'Overdrawn lot mix',
                'process_date': timezone.now().isoformat(),
                'output_quantity_liters': '5',
                'extra_expense': '0',
                'expense_currency': 1,
                'items': [{
                    'raw_material': self.material.id,
                    'quantity': '6',
                    'piece_count': 0,
                    'purchase_item': selected_item.id,
                }],
            },
            format='json',
        )
        response = create_process(request)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            RawMaterialProcessViewSet.queryset.model.objects.count(), 0)
        stock = RawMaterialStock.objects.get(raw_material=self.material)
        self.assertEqual(stock.quantity, Decimal('25.0000'))
