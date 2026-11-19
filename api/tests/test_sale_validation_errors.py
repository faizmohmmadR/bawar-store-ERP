from django.test import TestCase
from api.tests import test_raw_material_sales as fixtures
from api.models.data.sales import Sales


class SaleValidationErrorTests(TestCase):
    setUp = fixtures.RawMaterialSalesTests.setUp

    def line(self, quantity, price=100):
        return {'sale_source': 'raw_material', 'raw_material_stock': self.stock.pk, 'unit': 'kg', 'quantity': quantity, 'sell_price': price}

    def test_create_reports_the_failing_row_and_field_and_rolls_back(self):
        response = self.client.post('/api/raw-material-sales/', {'customer': self.customer.pk, 'currency': 1, 'status': 'confirmed',
            'sales_items': [self.line(5), self.line(200)]}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('quantity', response.data['sales_items'][1])
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 100)
        self.assertFalse(Sales.objects.exists())

    def test_missing_line_price_identifies_its_exact_row(self):
        response = self.client.post('/api/raw-material-sales/', {'customer': self.customer.pk, 'currency': 1, 'status': 'confirmed',
            'sales_items': [self.line(5), self.line(2, price=0)]}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('sell_price', response.data['sales_items'][1])

    def test_update_reports_row_error_without_changing_existing_sale(self):
        response = self.client.post('/api/raw-material-sales/', {'customer': self.customer.pk, 'currency': 1, 'status': 'confirmed',
            'sales_items': [self.line(5)]}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        sale = Sales.objects.get(pk=response.data['id'])
        item = sale.sales_items.get()
        first = {**self.line(6), 'id': item.pk}
        response = self.client.patch(f'/api/raw-material-sales/{sale.pk}/', {'sales_items': [first, self.line(999)]}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('quantity', response.data['sales_items'][1])
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 95)
        item.refresh_from_db()
        self.assertEqual(item.quantity, 5)
