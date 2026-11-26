"""Critical UOM / packaging / inventory engine scenarios."""
from decimal import Decimal

from django.test import TestCase, TransactionTestCase

from api.models.data.product_packaging import ProductPackaging, ProductPrice
from api.models.data.products import Product
from api.models.data.purchases import Purchase, PurchaseItem
from api.models.data.sales import Sales, SalesItems
from api.models.data.uom import UnitCategory, UnitOfMeasure
from api.models.data.vendors import Vendor
from api.models.data.customers import Customer
from api.models.data.warehouse import Warehouse
from api.models.data.inventory_ledger import InventoryBalance
from api.services.inventory.engine import (
    deliver_sale_item,
    get_default_warehouse,
    open_package,
    receive_purchase_item,
    transfer_stock,
)
from api.services.uom.conversion import assert_same_category, packaging_to_base
from rest_framework.exceptions import ValidationError


class UomInventoryEngineTests(TestCase):
    def setUp(self):
        self.count = UnitCategory.objects.create(code='count', name='Count')
        self.weight = UnitCategory.objects.create(code='weight', name='Weight')
        self.volume = UnitCategory.objects.create(code='volume', name='Volume')
        self.piece = UnitOfMeasure.objects.create(
            category=self.count, code='piece', name='Piece', symbol='pc',
            is_category_reference=True,
        )
        self.g = UnitOfMeasure.objects.create(
            category=self.weight, code='g', name='Gram', symbol='g',
            is_category_reference=True,
        )
        self.kg = UnitOfMeasure.objects.create(
            category=self.weight, code='kg', name='Kilogram', symbol='kg',
            ratio_to_reference=Decimal('1000'),
        )
        self.ml = UnitOfMeasure.objects.create(
            category=self.volume, code='ml', name='Milliliter', symbol='ml',
            is_category_reference=True,
        )
        self.liter = UnitOfMeasure.objects.create(
            category=self.volume, code='L', name='Liter', symbol='L',
            ratio_to_reference=Decimal('1000'),
        )
        self.wh = Warehouse.objects.create(code='MAIN', name='Main', is_default=True)
        self.vendor = Vendor.objects.create(name='Supplier A')
        self.customer = Customer.objects.create(name='Customer A')

    def _balance(self, product, warehouse=None):
        warehouse = warehouse or self.wh
        return InventoryBalance.objects.get(product=product, warehouse=warehouse, lot__isnull=True)

    def test_1_carton_to_bottle(self):
        product = Product.objects.create(name='Water', base_uom=self.piece, sku='W1')
        bottle = ProductPackaging.objects.create(
            product=product, name='Bottle', qty_in_base=1, is_base=True,
            for_purchase=True, for_sale=True,
        )
        carton = ProductPackaging.objects.create(
            product=product, name='Carton', qty_in_base=12,
            for_purchase=True, for_sale=True,
        )
        purchase = Purchase.objects.create(
            vendor=self.vendor, warehouse=self.wh, currency=1, status='received',
            total_amount=0,
        )
        item = PurchaseItem.objects.create(
            purchase=purchase, product=product, packaging=carton,
            quantity=10, conversion_factor=12, price_per_unit=1200,
        )
        receive_purchase_item(item)
        self.assertEqual(self._balance(product).quantity_on_hand, Decimal('120'))

        sale = Sales.objects.create(
            customer=self.customer, warehouse=self.wh, currency=1,
            status='confirmed', total_amount=0,
        )
        s1 = SalesItems.objects.create(
            sales=sale, product=product, packaging=carton,
            quantity=2, conversion_factor=12, sell_price=1350,
        )
        deliver_sale_item(s1, warehouse=self.wh)
        s2 = SalesItems.objects.create(
            sales=sale, product=product, packaging=bottle,
            quantity=5, conversion_factor=1, sell_price=120,
        )
        deliver_sale_item(s2, warehouse=self.wh)
        self.assertEqual(self._balance(product).quantity_on_hand, Decimal('91'))

    def test_2_nested_packaging(self):
        product = Product.objects.create(name='Biscuits', base_uom=self.piece, sku='B1')
        ProductPackaging.objects.create(product=product, name='Piece', qty_in_base=1, is_base=True)
        packet = ProductPackaging.objects.create(product=product, name='Packet', qty_in_base=6, for_purchase=True, for_sale=True)
        carton = ProductPackaging.objects.create(product=product, name='Carton', qty_in_base=144, for_purchase=True, for_sale=True)
        purchase = Purchase.objects.create(vendor=self.vendor, warehouse=self.wh, currency=1, status='received', total_amount=0)
        item = PurchaseItem.objects.create(purchase=purchase, product=product, packaging=carton, quantity=2, conversion_factor=144, price_per_unit=100)
        receive_purchase_item(item)
        sale = Sales.objects.create(customer=self.customer, warehouse=self.wh, currency=1, status='confirmed', total_amount=0)
        deliver_sale_item(SalesItems.objects.create(sales=sale, product=product, packaging=packet, quantity=10, conversion_factor=6, sell_price=10), warehouse=self.wh)
        deliver_sale_item(SalesItems.objects.create(sales=sale, product=product, packaging=product.packagings.get(is_base=True), quantity=15, conversion_factor=1, sell_price=2), warehouse=self.wh)
        # 2*144 - 10*6 - 15 = 288 - 60 - 15 = 213
        self.assertEqual(self._balance(product).quantity_on_hand, Decimal('213'))

    def test_3_weight_based(self):
        product = Product.objects.create(name='Sugar', base_uom=self.g, sku='S1')
        ProductPackaging.objects.create(product=product, name='Gram', qty_in_base=1, is_base=True)
        kg = ProductPackaging.objects.create(product=product, name='Kilogram', qty_in_base=1000, for_sale=True)
        sack = ProductPackaging.objects.create(product=product, name='Sack', qty_in_base=50000, for_purchase=True)
        purchase = Purchase.objects.create(vendor=self.vendor, warehouse=self.wh, currency=1, status='received', total_amount=0)
        receive_purchase_item(PurchaseItem.objects.create(
            purchase=purchase, product=product, packaging=sack, quantity=10, conversion_factor=50000, price_per_unit=2000,
        ))
        sale = Sales.objects.create(customer=self.customer, warehouse=self.wh, currency=1, status='confirmed', total_amount=0)
        deliver_sale_item(SalesItems.objects.create(sales=sale, product=product, packaging=kg, quantity=12, conversion_factor=1000, sell_price=50), warehouse=self.wh)
        deliver_sale_item(SalesItems.objects.create(sales=sale, product=product, packaging=kg, quantity=Decimal('3.5'), conversion_factor=1000, sell_price=50), warehouse=self.wh)
        # 500000 - 12000 - 3500 = 484500 g = 484.5 kg
        self.assertEqual(self._balance(product).quantity_on_hand, Decimal('484500'))

    def test_4_variable_weight(self):
        product = Product.objects.create(name='Cheese', base_uom=self.kg, sku='C1')
        ProductPackaging.objects.create(product=product, name='Kg', qty_in_base=1, is_base=True)
        block = ProductPackaging.objects.create(
            product=product, name='Block', qty_in_base=50, for_purchase=True, is_variable_weight=True,
        )
        purchase = Purchase.objects.create(vendor=self.vendor, warehouse=self.wh, currency=1, status='received', total_amount=0)
        for measured in (Decimal('49.8'), Decimal('50.2'), Decimal('49.5')):
            receive_purchase_item(PurchaseItem.objects.create(
                purchase=purchase, product=product, packaging=block,
                quantity=1, conversion_factor=50, measured_base_quantity=measured, price_per_unit=100,
            ))
        self.assertEqual(self._balance(product).quantity_on_hand, Decimal('149.5'))

    def test_5_volume(self):
        product = Product.objects.create(name='Oil', base_uom=self.ml, sku='O1')
        ProductPackaging.objects.create(product=product, name='ml', qty_in_base=1, is_base=True)
        liter = ProductPackaging.objects.create(product=product, name='Liter', qty_in_base=1000, for_sale=True)
        container = ProductPackaging.objects.create(product=product, name='Container', qty_in_base=20000, for_purchase=True)
        purchase = Purchase.objects.create(vendor=self.vendor, warehouse=self.wh, currency=1, status='received', total_amount=0)
        receive_purchase_item(PurchaseItem.objects.create(
            purchase=purchase, product=product, packaging=container, quantity=10, conversion_factor=20000, price_per_unit=5000,
        ))
        sale = Sales.objects.create(customer=self.customer, warehouse=self.wh, currency=1, status='confirmed', total_amount=0)
        deliver_sale_item(SalesItems.objects.create(
            sales=sale, product=product, packaging=liter, quantity=35, conversion_factor=1000, sell_price=80,
        ), warehouse=self.wh)
        # 200000 - 35000 = 165000 ml = 165 L
        self.assertEqual(self._balance(product).quantity_on_hand, Decimal('165000'))

    def test_6_and_7_costing_and_prices(self):
        product = Product.objects.create(name='Water2', base_uom=self.piece, sku='W2')
        bottle = ProductPackaging.objects.create(product=product, name='Bottle', qty_in_base=1, is_base=True, for_sale=True)
        carton = ProductPackaging.objects.create(product=product, name='Carton', qty_in_base=12, for_purchase=True, for_sale=True)
        ProductPrice.objects.create(product=product, packaging=bottle, price_type='retail', amount=120, currency=1)
        ProductPrice.objects.create(product=product, packaging=carton, price_type='retail', amount=1350, currency=1)
        purchase = Purchase.objects.create(vendor=self.vendor, warehouse=self.wh, currency=1, status='received', total_amount=0)
        item = PurchaseItem.objects.create(
            purchase=purchase, product=product, packaging=carton, quantity=10, conversion_factor=12, price_per_unit=1200,
        )
        receive_purchase_item(item)
        bal = self._balance(product)
        self.assertEqual(bal.quantity_on_hand, Decimal('120'))
        self.assertEqual(bal.average_cost, Decimal('100'))  # 12000/120

        sale = Sales.objects.create(customer=self.customer, warehouse=self.wh, currency=1, status='confirmed', total_amount=0)
        line = SalesItems.objects.create(sales=sale, product=product, packaging=carton, quantity=2, conversion_factor=12, sell_price=1350)
        deliver_sale_item(line, warehouse=self.wh)
        line.refresh_from_db()
        # COGS = 24 * 100 = 2400; revenue = 2700
        self.assertEqual(line.unit_cost, Decimal('100'))
        self.assertEqual(line.line_total, Decimal('2700'))
        bottle_line = SalesItems.objects.create(sales=sale, product=product, packaging=bottle, quantity=5, conversion_factor=1, sell_price=120)
        self.assertEqual(bottle_line.line_total, Decimal('600'))

    def test_8_package_open(self):
        product = Product.objects.create(name='Water3', base_uom=self.piece, sku='W3')
        ProductPackaging.objects.create(product=product, name='Bottle', qty_in_base=1, is_base=True)
        carton = ProductPackaging.objects.create(product=product, name='Carton', qty_in_base=12)
        from api.models.data.inventory_ledger import InventoryPackageBalance
        InventoryPackageBalance.objects.create(
            product=product, warehouse=self.wh, packaging=carton, quantity=5, is_opened=False,
        )
        # Seed base stock 60
        purchase = Purchase.objects.create(vendor=self.vendor, warehouse=self.wh, currency=1, status='received', total_amount=0)
        receive_purchase_item(PurchaseItem.objects.create(
            purchase=purchase, product=product, packaging=carton, quantity=5, conversion_factor=12, price_per_unit=100,
        ))
        before = self._balance(product).quantity_on_hand
        open_package(product=product, warehouse=self.wh, packaging=carton, quantity=1)
        after = self._balance(product).quantity_on_hand
        self.assertEqual(before, after)

    def test_10_warehouse_transfer(self):
        wh2 = Warehouse.objects.create(code='B', name='Branch')
        product = Product.objects.create(name='Water4', base_uom=self.piece, sku='W4')
        ProductPackaging.objects.create(product=product, name='Bottle', qty_in_base=1, is_base=True)
        carton = ProductPackaging.objects.create(product=product, name='Carton', qty_in_base=12, for_purchase=True)
        purchase = Purchase.objects.create(vendor=self.vendor, warehouse=self.wh, currency=1, status='received', total_amount=0)
        receive_purchase_item(PurchaseItem.objects.create(
            purchase=purchase, product=product, packaging=carton, quantity=5, conversion_factor=12, price_per_unit=100,
        ))
        transfer_stock(product=product, from_warehouse=self.wh, to_warehouse=wh2, packaging=carton, quantity=5)
        self.assertEqual(self._balance(product, self.wh).quantity_on_hand, Decimal('0'))
        self.assertEqual(self._balance(product, wh2).quantity_on_hand, Decimal('60'))

    def test_13_historical_conversion(self):
        product = Product.objects.create(name='Water5', base_uom=self.piece, sku='W5')
        carton = ProductPackaging.objects.create(product=product, name='Carton', qty_in_base=12, for_purchase=True)
        ProductPackaging.objects.create(product=product, name='Bottle', qty_in_base=1, is_base=True)
        purchase = Purchase.objects.create(vendor=self.vendor, warehouse=self.wh, currency=1, status='received', total_amount=0)
        item = PurchaseItem.objects.create(
            purchase=purchase, product=product, packaging=carton, quantity=1, conversion_factor=12, price_per_unit=100,
        )
        receive_purchase_item(item)
        carton.qty_in_base = 24
        carton.save(update_fields=['qty_in_base'])
        item.refresh_from_db()
        self.assertEqual(item.conversion_factor, Decimal('12'))
        self.assertEqual(self._balance(product).quantity_on_hand, Decimal('12'))

    def test_14_incompatible_units(self):
        with self.assertRaises(ValidationError):
            assert_same_category(self.kg, self.liter)

    def test_sale_consumes_lot_balance_when_track_expiry(self):
        """Purchases with expiry tracking post to lot balances; sales must deduct them."""
        product = Product.objects.create(
            name='Maryam', base_uom=self.piece, sku='M1', track_expiry=True,
        )
        piece = ProductPackaging.objects.create(
            product=product, name='Piece', qty_in_base=1, is_base=True, for_sale=True,
        )
        carton = ProductPackaging.objects.create(
            product=product, name='Carton', qty_in_base=12, for_purchase=True, for_sale=True,
        )
        purchase = Purchase.objects.create(
            vendor=self.vendor, warehouse=self.wh, currency=1, status='received', total_amount=0,
        )
        receive_purchase_item(PurchaseItem.objects.create(
            purchase=purchase, product=product, packaging=carton,
            quantity=50, conversion_factor=12, price_per_unit=10,
            expiry_date='2027-01-01',
        ))
        lot_bal = InventoryBalance.objects.get(product=product, warehouse=self.wh)
        self.assertIsNotNone(lot_bal.lot_id)
        self.assertEqual(lot_bal.quantity_on_hand, Decimal('600'))

        sale = Sales.objects.create(
            customer=self.customer, warehouse=self.wh, currency=1,
            status='confirmed', total_amount=0,
        )
        line = SalesItems.objects.create(
            sales=sale, product=product, packaging=carton,
            quantity=1, conversion_factor=12, sell_price=12,
        )
        deliver_sale_item(line, warehouse=self.wh)
        lot_bal.refresh_from_db()
        self.assertEqual(lot_bal.quantity_on_hand, Decimal('588'))
        line.refresh_from_db()
        self.assertEqual(line.unit_cost, Decimal('0.833333'))


class ConcurrencyStockTests(TransactionTestCase):
    def test_11_concurrency_does_not_oversell(self):
        count = UnitCategory.objects.create(code='count', name='Count')
        piece = UnitOfMeasure.objects.create(category=count, code='piece', name='Piece', symbol='pc', is_category_reference=True)
        wh = Warehouse.objects.create(code='MAIN', name='Main', is_default=True)
        vendor = Vendor.objects.create(name='V')
        customer = Customer.objects.create(name='C')
        product = Product.objects.create(name='Limited', base_uom=piece, sku='L1', allow_negative_stock=False)
        bottle = ProductPackaging.objects.create(product=product, name='Bottle', qty_in_base=1, is_base=True, for_sale=True)
        purchase = Purchase.objects.create(vendor=vendor, warehouse=wh, currency=1, status='received', total_amount=0)
        item = PurchaseItem.objects.create(
            purchase=purchase, product=product, packaging=bottle, quantity=1, conversion_factor=1, price_per_unit=10,
        )
        receive_purchase_item(item)
        from api.models.data.inventory_ledger import InventoryBalance
        InventoryBalance.objects.filter(product=product).update(quantity_on_hand=1, average_cost=10)

        sale = Sales.objects.create(customer=customer, warehouse=wh, currency=1, status='confirmed', total_amount=0)
        ok = 0
        errors = 0
        for _ in range(2):
            try:
                line = SalesItems.objects.create(
                    sales=sale, product=product, packaging=bottle, quantity=1, conversion_factor=1, sell_price=20,
                )
                deliver_sale_item(line, warehouse=wh)
                ok += 1
            except ValidationError:
                errors += 1
        self.assertEqual(ok, 1)
        self.assertEqual(errors, 1)
        bal = InventoryBalance.objects.get(product=product, warehouse=wh, lot__isnull=True)
        self.assertEqual(bal.quantity_on_hand, Decimal('0'))
