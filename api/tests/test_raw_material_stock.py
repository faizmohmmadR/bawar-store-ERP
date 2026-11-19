from decimal import Decimal
from datetime import timedelta

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
from api.models.data.currency import ExchangeRate
from api.models.data.raw_material_process import (
    RawMaterialProcess,
)
from api.models.data.vendors import Vendor
from api.serializers.data.raw_materials import (
    RawMaterialPurchaseItemSerializer,
    RawMaterialSerializer,
    RawMaterialStockSerializer,
)
from api.services.raw_material_stock import reconcile_raw_material_stock
from api.services.raw_material_process import consume_raw_materials_for_process
from api.views.data.raw_materials import RawMaterialPurchaseViewSet, RawMaterialViewSet


class RawMaterialStockCostLayerTests(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Raw material supplier')
        self.material = RawMaterial.objects.create(name='Flour', unit='kg')

    def create_received_purchase(self, invoice, quantity, price, piece_count=0):
        purchase = RawMaterialPurchase.objects.create(
            vendor=self.vendor,
            invoice_number=invoice,
            currency=1,
            status='received',
        )
        item = RawMaterialPurchaseItem.objects.create(
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
        return purchase, item

    def test_bottle_material_saves_volume_capacity_without_product_link(self):
        serializer = RawMaterialSerializer(data={
            'name': '500 ml bottle',
            'material_type': RawMaterial.TYPE_BOTTLE,
            'category': RawMaterialCategory.objects.get(name='A').pk,
            'unit': RawMaterial.UNIT_PIECE,
            'capacity_liters': '0.5000',
            'capacity_kg': None,
            'capacity_display_unit': RawMaterial.CAPACITY_UNIT_ML,
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
        material = serializer.save()

        self.assertEqual(material.capacity_liters, Decimal('0.5000'))
        self.assertIsNone(material.capacity_kg)
        self.assertNotIn('product', serializer.data)

    def test_bottle_material_saves_weight_capacity_without_volume_capacity(self):
        serializer = RawMaterialSerializer(data={
            'name': '1 kg bottle',
            'material_type': RawMaterial.TYPE_BOTTLE_WITH_CAP,
            'category': RawMaterialCategory.objects.get(name='A').pk,
            'unit': RawMaterial.UNIT_PIECE,
            'capacity_liters': None,
            'capacity_kg': '1.0000',
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
        material = serializer.save()

        self.assertIsNone(material.capacity_liters)
        self.assertEqual(material.capacity_kg, Decimal('1.0000'))

    def test_bottle_material_rejects_both_or_neither_capacity_units(self):
        for liter_capacity, kg_capacity in (
            ('0.5000', '0.4500'),
            (None, None),
        ):
            serializer = RawMaterialSerializer(data={
                'name': f'bottle {liter_capacity} {kg_capacity}',
                'material_type': RawMaterial.TYPE_BOTTLE,
            'category': RawMaterialCategory.objects.get(name='A').pk,
                'unit': RawMaterial.UNIT_PIECE,
                'capacity_liters': liter_capacity,
                'capacity_kg': kg_capacity,
            })

            self.assertFalse(serializer.is_valid())
            self.assertIn('capacity_liters', serializer.errors)

    def test_received_purchases_keep_separate_prices_in_one_stock_row(self):
        self.create_received_purchase('RM-001', '10', '20', piece_count=2)
        self.create_received_purchase('RM-002', '20', '25', piece_count=5)
        self.create_received_purchase('RM-003', '5', '30', piece_count=3)
        self.create_received_purchase('RM-004', '0', '99', piece_count=88)

        self.assertEqual(RawMaterialStock.objects.count(), 1)
        stock = RawMaterialStock.objects.get(raw_material=self.material)
        self.assertEqual(stock.quantity, Decimal('35.0000'))
        self.assertEqual(stock.piece_count, 10)
        # Weighted average: (10×20 + 20×25 + 5×30) / 35 = 850/35 ≈ 24.285714
        self.assertEqual(stock.last_purchase_price, Decimal('24.285714'))

        serialized_layers = RawMaterialStockSerializer(
            stock).data['cost_layers']
        self.assertEqual(
            [
                (
                    Decimal(layer['quantity']),
                    Decimal(layer['price_per_unit']),
                    layer['piece_count'],
                )
                for layer in serialized_layers
            ],
            [
                (Decimal('10'), Decimal('20'), 2),
                (Decimal('20'), Decimal('25'), 5),
                (Decimal('5'), Decimal('30'), 3),
            ],
        )

    def test_edit_and_status_change_reconcile_stock_without_double_counting(self):
        self.create_received_purchase('RM-001', '10', '20', piece_count=2)
        purchase, item = self.create_received_purchase(
            'RM-002', '20', '25', piece_count=4
        )

        previous_items = [
            (item.raw_material_id, item.quantity, item.piece_count, item.quantity * item.price_per_unit_base)]
        item.quantity = Decimal('15')
        item.piece_count = 6
        item.price_per_unit = Decimal('26')
        item.save()
        reconcile_raw_material_stock(
            purchase,
            previous_status='received',
            previous_items=previous_items,
            save_stock=True,
        )

        stock = RawMaterialStock.objects.get(raw_material=self.material)
        self.assertEqual(stock.quantity, Decimal('25.0000'))
        self.assertEqual(stock.piece_count, 8)
        # Weighted average: (10×20 + 15×26) / 25 = 590/25 = 23.6
        self.assertEqual(stock.last_purchase_price, Decimal('23.600000'))

        previous_items = [
            (item.raw_material_id, item.quantity, item.piece_count, item.quantity * item.price_per_unit_base)]
        purchase.status = 'draft'
        purchase.save()
        reconcile_raw_material_stock(
            purchase,
            previous_status='received',
            previous_items=previous_items,
            save_stock=True,
        )
        stock.refresh_from_db()
        self.assertEqual(stock.quantity, Decimal('10.0000'))
        self.assertEqual(stock.piece_count, 2)
        # Only purchase 1 remains: 10kg@20 → avg = 20.0
        self.assertEqual(stock.last_purchase_price, Decimal('20.000000'))

        purchase.status = 'received'
        purchase.save()
        reconcile_raw_material_stock(
            purchase,
            previous_status='draft',
            previous_items=previous_items,
            save_stock=True,
        )
        stock.refresh_from_db()
        self.assertEqual(stock.quantity, Decimal('25.0000'))
        self.assertEqual(stock.piece_count, 8)

    def test_purchase_patch_updates_stock_once(self):
        purchase, item = self.create_received_purchase(
            'RM-001', '10', '20', piece_count=2
        )

        class UnrestrictedPurchaseViewSet(RawMaterialPurchaseViewSet):
            permission_classes = []

        patch_purchase = UnrestrictedPurchaseViewSet.as_view(
            {'patch': 'partial_update'}
        )
        request = APIRequestFactory().patch(
            f'/raw-material-purchases/{purchase.id}/',
            {
                'items': [{
                    'id': item.id,
                    'raw_material': self.material.id,
                    'quantity': '15',
                    'piece_count': 4,
                    'price_per_unit': '26',
                }],
            },
            format='json',
        )
        response = patch_purchase(request, pk=purchase.id)

        self.assertEqual(response.status_code, 200, response.data)
        stock = RawMaterialStock.objects.get(raw_material=self.material)
        self.assertEqual(stock.quantity, Decimal('15.0000'))
        self.assertEqual(stock.piece_count, 4)
        self.assertEqual(stock.last_purchase_price, Decimal('26.0000'))

    def test_piece_based_material_rejects_additional_piece_count(self):
        piece_material = RawMaterial.objects.create(name='Screw', unit='piece')
        purchase = RawMaterialPurchase.objects.create(
            vendor=self.vendor,
            invoice_number='RM-PIECE-001',
            currency=1,
        )
        serializer = RawMaterialPurchaseItemSerializer(data={
            'purchase': purchase.id,
            'raw_material': piece_material.id,
            'quantity': '3',
            'piece_count': 1,
            'price_per_unit': '2',
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn('piece_count', serializer.errors)

    def test_purchase_rejects_invalid_numbers_without_changing_stock(self):
        class UnrestrictedPurchaseViewSet(RawMaterialPurchaseViewSet):
            permission_classes = []

        purchase, item = self.create_received_purchase('RM-INVALID', '10', '20')
        for action, method in (('create', 'post'), ('partial_update', 'patch')):
            view = UnrestrictedPurchaseViewSet.as_view({method: action})
            for field in ('quantity', 'price_per_unit', 'paid_amount'):
                for invalid in ('invalid', 'NaN', 'Infinity', '1e100'):
                    with self.subTest(action=action, field=field, invalid=invalid):
                        line = {
                            'id': item.id,
                            'raw_material': self.material.id,
                            'quantity': '10',
                            'price_per_unit': '20',
                        }
                        payload = {
                            'vendor': self.vendor.id,
                            'currency': 1,
                            'purchase_items': [line],
                        }
                        if field == 'paid_amount':
                            payload[field] = invalid
                        else:
                            line[field] = invalid
                        request = getattr(APIRequestFactory(), method)(
                            '/raw-material-purchases/', payload, format='json',
                        )
                        response = view(request, pk=purchase.pk) if method == 'patch' else view(request)
                        self.assertEqual(response.status_code, 400, response.data)
                        self.assertEqual(RawMaterialPurchase.objects.count(), 1)
                        self.assertEqual(
                            RawMaterialStock.objects.get(raw_material=self.material).quantity,
                            Decimal('10'),
                        )

    def test_blank_raw_material_purchase_invoice_is_generated_uniquely(self):
        first = RawMaterialPurchase.objects.create(
            vendor=self.vendor,
            currency=1,
        )
        second = RawMaterialPurchase.objects.create(
            vendor=self.vendor,
            currency=1,
        )

        self.assertTrue(first.invoice_number.startswith('R'))
        self.assertTrue(second.invoice_number.startswith('R'))
        self.assertNotEqual(first.invoice_number, second.invoice_number)

    def test_purchase_create_accepts_blank_invoice_and_returns_generated_number(self):
        class UnrestrictedPurchaseViewSet(RawMaterialPurchaseViewSet):
            permission_classes = []

        create_purchase = UnrestrictedPurchaseViewSet.as_view(
            {'post': 'create'})
        invoice_numbers = []
        for _ in range(2):
            request = APIRequestFactory().post(
                '/raw-material-purchases/',
                {
                    'vendor': self.vendor.id,
                    'invoice_number': '',
                    'bill_number': f'SUPPLIER-BILL-{len(invoice_numbers) + 1}',
                    'currency': 1,
                    'status': 'draft',
                    'purchase_items': [{
                        'raw_material': self.material.id,
                        'quantity': '1',
                        'piece_count': 0,
                        'price_per_unit': '2',
                    }],
                },
                format='json',
            )
            response = create_purchase(request)
            self.assertEqual(response.status_code, 201, response.data)
            self.assertEqual(
                response.data['bill_number'],
                f'SUPPLIER-BILL-{len(invoice_numbers) + 1}',
            )
            invoice_numbers.append(response.data['invoice_number'])

        self.assertTrue(all(number.startswith('R')
                        for number in invoice_numbers))
        self.assertNotEqual(invoice_numbers[0], invoice_numbers[1])

    def test_purchase_create_rejects_duplicate_raw_material_lines(self):
        class UnrestrictedPurchaseViewSet(RawMaterialPurchaseViewSet):
            permission_classes = []

        create_purchase = UnrestrictedPurchaseViewSet.as_view(
            {'post': 'create'})
        request = APIRequestFactory().post(
            '/raw-material-purchases/',
            {
                'vendor': self.vendor.id,
                'currency': 1,
                'status': 'received',
                'purchase_items': [
                    {
                        'raw_material': self.material.id,
                        'quantity': '3',
                        'piece_count': 0,
                        'price_per_unit': '2',
                    },
                    {
                        'raw_material': self.material.id,
                        'quantity': '4',
                        'piece_count': 0,
                        'price_per_unit': '3',
                    },
                ],
            },
            format='json',
        )

        response = create_purchase(request)

        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(RawMaterialPurchase.objects.count(), 0)
        self.assertFalse(RawMaterialStock.objects.filter(
            raw_material=self.material).exists())

    def test_list_orders_newest_created_before_existing_name_order(self):
        older = RawMaterial.objects.create(name='Alpha')
        RawMaterial.objects.filter(pk=older.pk).update(
            created_at=timezone.now() - timedelta(days=1),
        )
        RawMaterial.objects.create(name='Zeta')

        class UnrestrictedRawMaterialViewSet(RawMaterialViewSet):
            permission_classes = []

        list_materials = UnrestrictedRawMaterialViewSet.as_view({
                                                                'get': 'list'})
        request = APIRequestFactory().get('/raw-materials/', {'page_size': 10})
        response = list_materials(request)

        self.assertEqual(response.status_code, 200)
        names = [row['name'] for row in response.data['results']]
        self.assertEqual(names, ['Zeta', 'Flour', 'Alpha'])


class RawMaterialProductionCostTests(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Production supplier')
        self.material = RawMaterial.objects.create(name='Water', unit='kg')
        first_date = timezone.now() - timedelta(days=2)
        second_date = timezone.now() - timedelta(days=1)
        self.first_purchase, self.first_item = self.make_purchase(
            '4', '2', 2, first_date,
        )
        self.second_purchase, self.second_item = self.make_purchase(
            '6', '5', 3, second_date,
        )
        RawMaterialStock.objects.create(
            raw_material=self.material,
            quantity=Decimal('10'),
            piece_count=5,
        )

    def make_purchase(self, quantity, price, piece_count, purchase_date):
        purchase = RawMaterialPurchase.objects.create(
            vendor=self.vendor,
            currency=1,
            status='received',
            purchase_date=purchase_date,
        )
        item = RawMaterialPurchaseItem.objects.create(
            purchase=purchase,
            raw_material=self.material,
            quantity=Decimal(quantity),
            piece_count=piece_count,
            price_per_unit=Decimal(price),
        )
        return purchase, item

    def make_process(self, *, expense=0, currency=1, output='2'):
        return RawMaterialProcess.objects.create(
            product_name='Liquid cleaner',
            output_quantity_liters=Decimal(output),
            expense_currency=currency,
            extra_expense=Decimal(str(expense)),
        )

    def test_process_uses_fifo_costs_and_deducts_material_and_packages(self):
        process = self.make_process(expense=400)

        consume_raw_materials_for_process(process, [{
            'raw_material': self.material.id,
            'quantity': '7',
            'piece_count': 2,
        }])

        process.refresh_from_db()
        stock = RawMaterialStock.objects.get(raw_material=self.material)
        sources = process.items.get().purchase_sources
        self.assertEqual([source['purchase_item'] for source in sources], [
            self.first_item.id, self.second_item.id,
        ])
        self.assertEqual(
            [Decimal(source['quantity']) for source in sources],
            [Decimal('4'), Decimal('3')],
        )
        self.assertEqual(process.material_cost_afn, Decimal('23.0000'))
        self.assertEqual(process.total_cost_afn, Decimal('423.0000'))
        self.assertEqual(process.cost_per_liter_afn, Decimal('211.500000'))
        self.assertEqual(stock.quantity, Decimal('3.0000'))
        self.assertEqual(stock.piece_count, 3)

    def test_process_converts_overhead_at_process_date(self):
        ExchangeRate.objects.create(
            from_currency=2,
            to_currency=1,
            rate=Decimal('90'),
            date=timezone.now() - timedelta(hours=1),
        )
        process = self.make_process(expense=2, currency=2)

        consume_raw_materials_for_process(process, [{
            'raw_material': self.material.id,
            'quantity': '1',
        }])

        process.refresh_from_db()
        self.assertEqual(process.extra_expense_afn, Decimal('180.0000'))

    def test_process_rejects_quantity_above_available_stock_atomically(self):
        process = self.make_process()

        with self.assertRaises(Exception):
            consume_raw_materials_for_process(process, [{
                'raw_material': self.material.id,
                'quantity': '11',
            }])

        self.assertEqual(
            RawMaterialStock.objects.get(raw_material=self.material).quantity,
            Decimal('10.0000'),
        )
        self.assertFalse(process.items.exists())

    def test_foreign_currency_purchase_cost_is_saved_in_afn_and_used_by_process(self):
        purchase_date = timezone.now() - timedelta(minutes=10)
        exchange_rate = ExchangeRate.objects.create(
            from_currency=2,
            to_currency=1,
            rate=Decimal('90'),
            date=purchase_date,
        )

        class UnrestrictedPurchaseViewSet(RawMaterialPurchaseViewSet):
            permission_classes = []

        create_purchase = UnrestrictedPurchaseViewSet.as_view(
            {'post': 'create'})
        request = APIRequestFactory().post(
            '/raw-material-purchases/',
            {
                'vendor': self.vendor.id,
                'currency': 2,
                'purchase_date': purchase_date.isoformat(),
                'status': 'received',
                'purchase_items': [{
                    'raw_material': self.material.id,
                    'quantity': '2',
                    'piece_count': 0,
                    'price_per_unit': '3',
                }],
            },
            format='json',
        )
        response = create_purchase(request)

        self.assertEqual(response.status_code, 201, response.data)
        purchase = RawMaterialPurchase.objects.get(pk=response.data['id'])
        purchase_item = purchase.items.get()
        self.assertEqual(purchase.exchange_rate, Decimal('90.000000'))
        self.assertEqual(purchase.total_amount_base, Decimal('540.0000'))
        self.assertEqual(purchase_item.price_per_unit_base,
                         Decimal('270.000000'))
        self.assertEqual(purchase_item.total_price_base, Decimal('540.0000'))
        stock = RawMaterialStock.objects.get(raw_material=self.material)
        # Weighted average across all received purchases for this material:
        # setUp: 4kg@2 + 6kg@5, this test adds 2kg@270 → (8+30+540)/12 ≈ 48.166667
        self.assertEqual(stock.last_purchase_price, Decimal('48.166667'))
        layer = next(
            layer for layer in RawMaterialStockSerializer(stock).data['cost_layers']
            if layer['purchase_id'] == purchase.id
        )
        self.assertEqual(
            Decimal(layer['price_per_unit_base']), Decimal('270.000000'))
        self.assertEqual(
            Decimal(layer['total_price_base']), Decimal('540.0000'))

        exchange_rate.rate = Decimal('100')
        exchange_rate.save(update_fields=['rate', 'updated_at'])

        class UnrestrictedPurchaseUpdateViewSet(RawMaterialPurchaseViewSet):
            permission_classes = []

        update_purchase = UnrestrictedPurchaseUpdateViewSet.as_view(
            {'patch': 'partial_update'}
        )
        update_request = APIRequestFactory().patch(
            f'/raw-material-purchases/{purchase.id}/',
            {'notes': 'retain historical exchange rate'},
            format='json',
        )
        update_response = update_purchase(update_request, pk=purchase.id)
        self.assertEqual(update_response.status_code,
                         200, update_response.data)
        purchase.refresh_from_db()
        purchase_item.refresh_from_db()
        self.assertEqual(purchase.exchange_rate, Decimal('90.000000'))
        self.assertEqual(purchase_item.price_per_unit_base,
                         Decimal('270.000000'))

        process = self.make_process(output='1')
        consume_raw_materials_for_process(process, [{
            'raw_material': self.material.id,
            'quantity': '1',
            'purchase_item': purchase_item.id,
        }])
        process.refresh_from_db()
        self.assertEqual(process.material_cost_afn, Decimal('270.0000'))
