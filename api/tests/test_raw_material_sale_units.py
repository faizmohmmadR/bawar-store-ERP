from decimal import Decimal
from django.test import TestCase
from api.tests import test_raw_material_sales as fixtures
from api.models.data.sales import Sales
from api.models.data.raw_materials import RawMaterial, RawMaterialStock, RawMaterialCategory
from api.tests.accounting.helpers import journal_for_source


class RawMaterialSaleUnitTests(TestCase):
    setUp = fixtures.RawMaterialSalesTests.setUp

    def sale(self, stock=None, unit='piece', quantity=2, piece_count=0):
        return self.client.post('/api/raw-material-sales/', {'customer': self.customer.pk, 'currency': 1, 'status': 'confirmed',
            'sales_items': [{'sale_source': 'raw_material', 'raw_material_stock': (stock or self.stock).pk,
                'unit': unit, 'quantity': quantity, 'piece_count': piece_count, 'sell_price': 100}]}, format='json')

    def piece_stock(self):
        material = RawMaterial.objects.create(name='Weighed bottles', material_type='bottle', unit='piece', capacity_kg=4, category=RawMaterialCategory.objects.first())
        return RawMaterialStock.objects.create(raw_material=material, quantity=20, last_purchase_price=2)

    def test_kg_stock_can_be_sold_by_pieces_with_saved_weight_and_cost(self):
        response = self.sale()
        self.assertEqual(response.status_code, 201, response.data)
        sale = Sales.objects.get(pk=response.data['id'])
        item = sale.sales_items.get()
        self.assertEqual(item.unit, 'piece')
        self.assertEqual(item.quantity, 2)
        self.assertEqual(item.kilogram_amount, 20)
        self.assertEqual(item.piece_count, 2)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 80)
        self.assertEqual(self.stock.piece_count, 8)
        self.assertEqual(sale.total_amount, 200)
        self.assertEqual(journal_for_source(sale).lines.get(gl_account__code='5200').debit, 1000)

    def test_piece_stock_can_be_sold_in_kg_using_number_weighed_not_fill_capacity(self):
        stock = self.piece_stock()
        response = self.sale(stock=stock, unit='kg', quantity=2, piece_count=5)
        self.assertEqual(response.status_code, 201, response.data)
        sale = Sales.objects.get(pk=response.data['id'])
        item = sale.sales_items.get()
        self.assertEqual(item.liter_amount, 5)
        self.assertEqual(item.kilogram_amount, 2)
        self.assertEqual(item.quantity, 2)
        stock.refresh_from_db()
        self.assertEqual(stock.quantity, 15)
        self.assertEqual(journal_for_source(sale).lines.get(gl_account__code='5200').debit, 10)

    def test_missing_conversion_information_and_fractional_pieces_are_rejected(self):
        self.stock.piece_count = 0
        self.stock.save()
        self.assertEqual(self.sale().status_code, 400)
        self.assertEqual(self.sale(stock=self.piece_stock(), unit='kg', quantity=2).status_code, 400)
        self.assertEqual(self.sale(unit='piece', quantity=Decimal('1.5')).status_code, 400)

    def test_piece_quantity_edit_uses_original_ratio_then_cancel_restores_both(self):
        response = self.sale()
        sale = Sales.objects.get(pk=response.data['id'])
        item = sale.sales_items.get()
        response = self.client.patch(f'/api/raw-material-sales/{sale.pk}/', {'sales_items': [
            {'id': item.pk, 'sale_source': 'raw_material', 'raw_material_stock': self.stock.pk, 'unit': 'piece', 'quantity': 3, 'sell_price': 100}]}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 70)
        self.assertEqual(self.stock.piece_count, 7)
        response = self.client.patch(f'/api/raw-material-sales/{sale.pk}/', {'status': 'cancelled'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 100)
        self.assertEqual(self.stock.piece_count, 10)

    def test_customer_piece_return_uses_selected_unit_and_restores_saved_physical_quantity(self):
        response = self.sale()
        sale = Sales.objects.get(pk=response.data['id'])
        response = self.client.post('/api/returns/', {'sales': sale.pk, 'currency': 1, 'return_items': [
            {'sales_item': sale.sales_items.get().pk, 'liter_amount': 1, 'return_price': 100}]}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data['total_amount']), 100)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 90)
        self.assertEqual(self.stock.piece_count, 9)
        response = self.client.patch(f"/api/returns/{response.data['id']}/", {'return_items': [
            {'id': response.data['return_items'][0]['id'], 'liter_amount': 2}]}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 100)
        self.assertEqual(self.stock.piece_count, 10)

    def test_partial_kg_return_from_piece_stock_restores_whole_piece_fraction(self):
        stock = self.piece_stock()
        response = self.sale(stock=stock, unit='kg', quantity=2, piece_count=5)
        sale = Sales.objects.get(pk=response.data['id'])
        response = self.client.post('/api/returns/', {'sales': sale.pk, 'currency': 1, 'return_items': [
            {'sales_item': sale.sales_items.get().pk, 'quantity_kg': '0.4', 'return_price': 100}]}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        stock.refresh_from_db()
        self.assertEqual(stock.quantity, 16)

    def test_vendor_piece_sale_credits_selected_unit_value(self):
        from api.models.data.vendors import Vendor
        from api.models.data.raw_materials import RawMaterialPurchase
        vendor = Vendor.objects.create(name='Unit conversion supplier')
        purchase = self.client.post('/api/raw-material-purchases/', {'vendor': vendor.pk, 'currency': 1, 'status': 'received',
            'purchase_items': [{'raw_material': self.material.pk, 'quantity': 10, 'price_per_unit': 100}]}, format='json')
        self.assertEqual(purchase.status_code, 201, purchase.data)
        response = self.client.post('/api/raw-material-sales/', {'vendor': vendor.pk, 'currency': 1, 'status': 'confirmed',
            'sales_items': [{'sale_source': 'raw_material', 'raw_material_stock': self.stock.pk, 'unit': 'piece', 'quantity': 2, 'sell_price': 100}]}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        purchase = RawMaterialPurchase.objects.get(pk=purchase.data['id'])
        self.assertEqual(purchase.paid_amount, 200)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 88)
        self.assertEqual(self.stock.piece_count, 8)

    def test_kg_return_that_represents_fractional_physical_piece_is_rejected(self):
        response = self.sale(stock=self.piece_stock(), unit='kg', quantity=2, piece_count=5)
        sale = Sales.objects.get(pk=response.data['id'])
        response = self.client.post('/api/returns/', {'sales': sale.pk, 'currency': 1, 'return_items': [
            {'sales_item': sale.sales_items.get().pk, 'quantity_kg': '0.5', 'return_price': 100}]}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_piece_stock_kg_sale_automatically_uses_saved_weight_without_second_quantity(self):
        stock = self.piece_stock()
        stock.raw_material.weight_per_piece_kg = Decimal('0.4')
        stock.raw_material.save()
        response = self.sale(stock=stock, unit='kg', quantity=2)
        self.assertEqual(response.status_code, 201, response.data)
        item = Sales.objects.get(pk=response.data['id']).sales_items.get()
        self.assertEqual(item.liter_amount, 5)
        self.assertEqual(item.quantity, 2)
        stock.refresh_from_db()
        self.assertEqual(stock.quantity, 15)

    def test_kg_stock_can_sell_pieces_with_saved_weight_without_tracked_count(self):
        self.material.weight_per_piece_kg = Decimal('0.5')
        self.material.save()
        self.stock.piece_count = 0
        self.stock.save()
        response = self.sale(unit='piece', quantity=4)
        self.assertEqual(response.status_code, 201, response.data)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 98)
        self.assertEqual(self.stock.piece_count, 0)

    def test_saved_piece_weight_rejects_fractional_bottle_deduction(self):
        stock = self.piece_stock()
        stock.raw_material.weight_per_piece_kg = Decimal('0.4')
        stock.raw_material.save()
        response = self.sale(stock=stock, unit='kg', quantity=1)
        self.assertEqual(response.status_code, 400)
        stock.refresh_from_db()
        self.assertEqual(stock.quantity, 20)
