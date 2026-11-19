from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from api.models.data.customers import Customer
from api.models.data.packing import PackingRun
from api.models.data.products import Product
from api.models.data.raw_material_process import RawMaterialProcess
from api.models.data.sales import Sales, SalesItems
from api.models.data.stock import Stock
from api.models.data.storage_tank import ProductionStorageTransfer, StorageTank
from api.serializers.data.sales import SalesItemsSerializer
from api.services.tank_inventory import get_tank_liquid_totals
from api.views.data.sales import SalesViewSet
from api.views.data.storage_tanks import StorageTankViewSet


class TankFillSaleTests(TestCase):
    def setUp(self):
        self.tank = StorageTank.objects.create(
            name='Fill Tank',
            capacity_liters=Decimal('100'),
        )
        production = RawMaterialProcess.objects.create(
            product_name='Dishwashing',
            status=RawMaterialProcess.STATUS_MOVED_TO_STORAGE,
            output_quantity_liters=Decimal('50'),
            cost_per_liter_afn=Decimal('10'),
        )
        ProductionStorageTransfer.objects.create(
            production=production,
            storage_tank=self.tank,
            quantity_liters=Decimal('50'),
        )
        self.customer = Customer.objects.create(name='Walk-in customer')

    def test_tank_balance_reduces_after_tank_fill_sale(self):
        class UnrestrictedSalesViewSet(SalesViewSet):
            permission_classes = []
            authentication_classes = []

        liters_before, _, cost_before = get_tank_liquid_totals(self.tank)
        self.assertEqual(liters_before, Decimal('50.0000'))
        self.assertEqual(cost_before, Decimal('10.000000'))

        create = UnrestrictedSalesViewSet.as_view({'post': 'create'})
        response = create(
            APIRequestFactory().post(
                '/sales/',
                {
                    'customer': self.customer.id,
                    'currency': 1,
                    'sale_date': '2026-10-03T10:00:00Z',
                    'status': 'confirmed',
                    'discount_percentage': 0,
                    'total_amount': '200',
                    'sales_items': [
                        {
                            'sale_source': 'tank',
                            'storage_tank': self.tank.id,
                            'unit': 'liter',
                            'quantity': '20',
                            'liter_amount': '20',
                            'sell_price': '10',
                        }
                    ],
                },
                format='json',
            ),
        )
        self.assertEqual(response.status_code, 201, response.data)

        item = SalesItems.objects.get(sales_id=response.data['id'])
        self.assertEqual(item.sale_source, SalesItems.SOURCE_TANK)
        self.assertEqual(item.unit, SalesItems.UNIT_LITER)
        self.assertEqual(item.quantity, Decimal('20.0000'))
        self.assertEqual(item.unit_cost, Decimal('10.000000'))
        self.assertIsNone(item.stock_id)

        liters_after, _, _ = get_tank_liquid_totals(self.tank)
        self.assertEqual(liters_after, Decimal('30.0000'))

        class UnrestrictedTankViewSet(StorageTankViewSet):
            permission_classes = []
            authentication_classes = []

        tank_list = UnrestrictedTankViewSet.as_view({'get': 'list'})
        tank_response = tank_list(APIRequestFactory().get('/storage-tanks/'))
        self.assertEqual(tank_response.status_code, 200)
        row = next(r for r in tank_response.data if r['id'] == self.tank.id)
        self.assertEqual(Decimal(row['current_liters']), Decimal('30.0000'))

    def test_tank_fill_and_packing_share_available_liters(self):
        Sales.objects.create(
            customer=self.customer,
            currency=1,
            status='confirmed',
            total_amount=Decimal('100'),
        )
        sale = Sales.objects.latest('id')
        SalesItems.objects.create(
            sales=sale,
            sale_source=SalesItems.SOURCE_TANK,
            storage_tank=self.tank,
            unit=SalesItems.UNIT_LITER,
            quantity=Decimal('30'),
            liter_amount=Decimal('30'),
            sell_price=Decimal('8'),
            unit_cost=Decimal('10'),
        )

        liters, _, _ = get_tank_liquid_totals(self.tank)
        self.assertEqual(liters, Decimal('20.0000'))

        # Packing 25 L should fail because only 20 L remain after tank-fill sale.
        from rest_framework.exceptions import ValidationError
        from api.services.packing import _tank_liquid_totals

        available, _, _ = _tank_liquid_totals(self.tank)
        self.assertEqual(available, Decimal('20.0000'))
        with self.assertRaises(ValidationError):
            from api.services.tank_inventory import validate_tank_fill_quantity
            validate_tank_fill_quantity(self.tank, Decimal('25'))

    def test_rejects_overdraw_tank_fill(self):
        class UnrestrictedSalesViewSet(SalesViewSet):
            permission_classes = []
            authentication_classes = []

        create = UnrestrictedSalesViewSet.as_view({'post': 'create'})
        response = create(
            APIRequestFactory().post(
                '/sales/',
                {
                    'customer': self.customer.id,
                    'currency': 1,
                    'sale_date': '2026-10-03T10:00:00Z',
                    'status': 'confirmed',
                    'discount_percentage': 0,
                    'total_amount': '1000',
                    'sales_items': [
                        {
                            'sale_source': 'tank',
                            'storage_tank': self.tank.id,
                            'unit': 'liter',
                            'quantity': '80',
                            'liter_amount': '80',
                            'sell_price': '10',
                        }
                    ],
                },
                format='json',
            ),
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(SalesItems.objects.count(), 0)

    def test_tank_fill_can_be_sold_in_kilograms(self):
        class UnrestrictedSalesViewSet(SalesViewSet):
            permission_classes = []
            authentication_classes = []

        product = Product.objects.create(
            name='Dense Dishwashing',
            density_kg_per_liter=Decimal('2'),
        )
        self.tank.product = product
        self.tank.save(update_fields=['product', 'updated_at'])
        production = RawMaterialProcess.objects.latest('id')
        production.product = product
        production.output_quantity_kg = Decimal('100')
        production.save(update_fields=['product', 'output_quantity_kg', 'updated_at'])
        ProductionStorageTransfer.objects.filter(production=production).update(
            quantity_kg=Decimal('100'),
        )

        create = UnrestrictedSalesViewSet.as_view({'post': 'create'})
        response = create(
            APIRequestFactory().post(
                '/sales/',
                {
                    'customer': self.customer.id,
                    'currency': 1,
                    'sale_date': '2026-10-03T10:00:00Z',
                    'status': 'confirmed',
                    'discount_percentage': 0,
                    'total_amount': '200',
                    'sales_items': [
                        {
                            'sale_source': 'tank',
                            'storage_tank': self.tank.id,
                            'unit': 'kg',
                            'quantity': '10',
                            'sell_price': '20',
                        }
                    ],
                },
                format='json',
            ),
        )
        self.assertEqual(response.status_code, 201, response.data)
        item = SalesItems.objects.get(sales_id=response.data['id'])
        self.assertEqual(item.unit, SalesItems.UNIT_KG)
        self.assertEqual(item.quantity, Decimal('10.0000'))
        self.assertEqual(item.liter_amount, Decimal('5.0000'))
        self.assertEqual(item.kilogram_amount, Decimal('10.0000'))
        self.assertEqual(item.unit_cost, Decimal('5.000000'))
        liters_remaining, _, _ = get_tank_liquid_totals(self.tank)
        self.assertEqual(liters_remaining, Decimal('45.0000'))

    def test_packed_stock_kilograms_convert_to_bottle_equivalents(self):
        product = Product.objects.create(
            name='Bottled Dishwashing',
            bottle_capacity_liters=Decimal('0.5'),
            density_kg_per_liter=Decimal('2'),
        )
        stock = Stock(
            product=product,
            piece_amount=Decimal('40'),
            buy_price=Decimal('10'),
            currency=1,
        )
        stock._skip_stock_journal = True
        stock.save()
        sale = Sales.objects.create(
            customer=self.customer,
            currency=1,
            status='draft',
            total_amount=Decimal('100'),
        )
        serializer = SalesItemsSerializer(data={
            'sales': sale.id,
            'sale_source': 'stock',
            'stock': stock.id,
            'unit': 'kg',
            'quantity': '5',
            'sell_price': '20',
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(
            serializer.validated_data['liter_amount'],
            Decimal('5.0000'),
        )
        self.assertEqual(
            serializer.validated_data['kilogram_amount'],
            Decimal('5.0000'),
        )
