from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from api.tests import test_raw_material_sales as fixtures
from api.models.data.sales import Sales
from api.models.data.raw_materials import RawMaterial, RawMaterialCategory, RawMaterialPurchase, RawMaterialStock
from api.models.data.vendors import Vendor
from api.services.material_finished_stock import add_material_stock
from api.tests.accounting.helpers import journal_for_source, native_totals


class FreeTransactionTests(TestCase):
    setUp = fixtures.RawMaterialSalesTests.setUp

    def raw_sale(self, **overrides):
        payload = {'customer': self.customer.pk, 'currency': 1, 'status': 'confirmed', 'transaction_type': 'free',
            'sales_items': [{'sale_source': 'raw_material', 'raw_material_stock': self.stock.pk, 'unit': 'kg', 'quantity': 5}]}
        payload.update(overrides)
        return self.client.post('/api/raw-material-sales/', payload, format='json')

    def purchase(self, material, qty=10, kind='free', price=None):
        vendor, _ = Vendor.objects.get_or_create(name='Free supplier')
        item = {'raw_material': material.pk, 'quantity': qty}
        if price is not None:item['price_per_unit'] = price
        return self.client.post('/api/raw-material-purchases/', {'vendor': vendor.pk, 'currency': 1,
            'status': 'received', 'transaction_type': kind, 'purchase_items': [item]}, format='json')

    def test_free_raw_sale_optional_price_deducts_stock_no_debt_and_expenses_cost(self):
        response = self.raw_sale()
        self.assertEqual(response.status_code, 201, response.data)
        sale = Sales.objects.get(pk=response.data['id'])
        self.assertEqual(sale.total_amount, 0)
        self.assertEqual(sale.total_amount_base, 0)
        self.assertEqual(sale.sales_items.get().sell_price, 0)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 95)
        journal = journal_for_source(sale)
        self.assertEqual(native_totals(journal), (Decimal('250'), Decimal('250')))
        codes = set(journal.lines.values_list('gl_account__code', flat=True))
        self.assertIn('5220', codes)
        self.assertNotIn('1200', codes)
        self.assertNotIn('4000', codes)
        from api.services.accounting.reports import get_profit_and_loss
        report = get_profit_and_loss()
        self.assertEqual(report['revenue'], 0)
        self.assertEqual(report['cogs'], 0)
        self.assertEqual(report['net_income'], -250)

    def test_free_stock_sale_omits_price_and_consumes_bottles(self):
        bottle = RawMaterial.objects.create(name='Free stock bottle', material_type='bottle', unit='piece',
            capacity_kg=1, category=RawMaterialCategory.objects.get(name='A'))
        stock, _, _ = add_material_stock(material=bottle, quantity=10, total_cost=70)
        response = self.client.post('/api/sales/', {'customer': self.customer.pk, 'currency': 1, 'status': 'confirmed',
            'transaction_type': 'free', 'sales_items': [{'stock': stock.pk, 'sale_source': 'stock', 'unit': 'bottle', 'quantity': 2}]}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        stock.refresh_from_db()
        self.assertEqual(stock.piece_amount, 8)
        sale = Sales.objects.get(pk=response.data['id'])
        self.assertEqual(native_totals(journal_for_source(sale)), (Decimal('14'), Decimal('14')))

    def test_free_tank_sale_omits_price_and_consumes_liquid(self):
        from api.models.data.raw_material_process import RawMaterialProcess
        from api.models.data.storage_tank import StorageTank, ProductionStorageTransfer
        tank = StorageTank.objects.create(name='Free tank', capacity_liters=100)
        production = RawMaterialProcess.objects.create(product_name='Free liquid', status='moved_to_storage',
            output_quantity_liters=20, output_quantity_kg=20, density_kg_per_liter=1, cost_per_liter_afn=3)
        ProductionStorageTransfer.objects.create(production=production, storage_tank=tank, quantity_liters=20, quantity_kg=20)
        response = self.client.post('/api/sales/', {'customer': self.customer.pk, 'currency': 1, 'status': 'confirmed',
            'transaction_type': 'free', 'sales_items': [{'storage_tank': tank.pk, 'sale_source': 'tank', 'unit': 'kg', 'quantity': 4}]}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        sale = Sales.objects.get(pk=response.data['id'])
        self.assertEqual(native_totals(journal_for_source(sale)), (Decimal('12'), Decimal('12')))
        from api.services.tank_inventory import get_tank_mass_quantity
        self.assertEqual(get_tank_mass_quantity(tank), 16)

    def test_paid_sale_still_requires_price_and_free_sale_ignores_submitted_price(self):
        response = self.raw_sale(transaction_type='paid')
        self.assertEqual(response.status_code, 400)
        response = self.raw_sale(sales_items=[{'sale_source': 'raw_material', 'raw_material_stock': self.stock.pk,
            'unit': 'kg', 'quantity': 5, 'sell_price': 99}])
        self.assertEqual(response.status_code, 201, response.data)
        item = Sales.objects.get(pk=response.data['id']).sales_items.get()
        self.assertEqual(item.sell_price, 0)

    def test_free_purchase_receives_zero_value_stock_and_no_vendor_debt(self):
        material = RawMaterial.objects.create(name='Gift chemistry', material_type='chemistry', unit='kg')
        response = self.purchase(material)
        self.assertEqual(response.status_code, 201, response.data)
        purchase = RawMaterialPurchase.objects.get(pk=response.data['id'])
        self.assertEqual(purchase.total_amount, 0)
        self.assertIsNone(journal_for_source(purchase))
        stock = RawMaterialStock.objects.get(raw_material=material)
        self.assertEqual(stock.quantity, 10)
        self.assertEqual(stock.last_purchase_price, 0)
        self.assertTrue(stock.zero_cost_allowed)
        from api.services.raw_material_process import consume_raw_materials_for_process
        from api.models.data.raw_material_process import RawMaterialProcess
        process = RawMaterialProcess.objects.create(product_name='Free production', output_quantity_liters=2)
        consume_raw_materials_for_process(process, [{'raw_material': material.pk, 'quantity': 2}])
        stock.refresh_from_db()
        self.assertEqual(stock.quantity, 8)
        process.refresh_from_db()
        self.assertEqual(process.material_cost_afn, 0)

    def test_free_receipt_dilutes_existing_average_without_inventing_value(self):
        response = self.purchase(self.material, qty=100)
        self.assertEqual(response.status_code, 201, response.data)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 200)
        self.assertEqual(self.stock.last_purchase_price, 25)
        self.assertEqual(self.stock.quantity * self.stock.last_purchase_price, 5000)

    def test_paid_receipt_after_free_stock_computes_weighted_average(self):
        material = RawMaterial.objects.create(name='Initially gifted chemistry', material_type='chemistry', unit='kg')
        self.assertEqual(self.purchase(material).status_code, 201)
        response = self.purchase(material, kind='paid', price=20)
        self.assertEqual(response.status_code, 201, response.data)
        stock = RawMaterialStock.objects.get(raw_material=material)
        self.assertEqual(stock.quantity, 20)
        self.assertEqual(stock.last_purchase_price, 10)
        self.assertFalse(stock.zero_cost_allowed)

    def test_paid_purchase_price_required_and_free_purchase_forces_zero(self):
        self.assertEqual(self.purchase(self.material, kind='paid').status_code, 400)
        response = self.purchase(self.material, price=50)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data['total_amount']), 0)
        self.assertEqual(Decimal(response.data['items'][0]['price_per_unit']), 0)

    def test_free_sales_count_separately_in_trade_reports(self):
        response = self.raw_sale()
        self.assertEqual(response.status_code, 201, response.data)
        from api.services.trade_reporting import trade_summary
        summary = trade_summary(Sales.objects.all(), Sales.objects.all())
        self.assertEqual(summary['free_count'], 1)
        self.assertEqual(summary['total'], 0)
        self.assertEqual(summary['unpaid'], 0)
        self.assertEqual(summary['paid_count'], 0)

    def test_free_sale_cancel_and_delete_restore_stock(self):
        response = self.raw_sale()
        sale_id = response.data['id']
        response = self.client.patch(f'/api/raw-material-sales/{sale_id}/', {'status': 'cancelled'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 100)
        self.assertIsNone(journal_for_source(Sales.objects.get(pk=sale_id)))

    def test_free_purchase_edit_and_cancel_reconcile_quantity(self):
        response = self.purchase(self.material)
        purchase_id = response.data['id']
        response = self.client.patch(f'/api/raw-material-purchases/{purchase_id}/', {
            'purchase_items': [{'raw_material': self.material.pk, 'quantity': 20}]}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 120)
        self.assertAlmostEqual(self.stock.quantity * self.stock.last_purchase_price, Decimal('5000'), places=3)
        response = self.client.patch(f'/api/raw-material-purchases/{purchase_id}/', {'status': 'cancelled'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 100)
        self.assertAlmostEqual(self.stock.last_purchase_price, Decimal('50'), places=3)

    def test_zero_cost_snapshot_stays_zero_after_stock_cost_changes(self):
        from api.services.accounting.sync import sync_sales_journal
        bottle = RawMaterial.objects.create(name='Gift bottle', material_type='bottle', unit='piece', capacity_kg=1, category=RawMaterialCategory.objects.get(name='A'))
        stock, _, _ = add_material_stock(material=bottle, quantity=10, total_cost=0)
        response = self.client.post('/api/sales/', {'customer': self.customer.pk, 'currency': 1,
            'status': 'confirmed', 'transaction_type': 'free', 'sales_items': [
                {'stock': stock.pk, 'sale_source': 'stock', 'unit': 'bottle', 'quantity': 2}]}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        sale = Sales.objects.get(pk=response.data['id'])
        self.assertTrue(sale.sales_items.get().cost_is_known)
        stock.buy_price = 20
        stock._skip_stock_journal = True
        stock.save()
        sync_sales_journal(sale)
        self.assertIsNone(journal_for_source(sale))

    def test_free_return_zero_refund_restores_stock_and_reverses_distribution_cost(self):
        response = self.raw_sale()
        sale = Sales.objects.get(pk=response.data['id'])
        item = sale.sales_items.get()
        response = self.client.post('/api/returns/', {'sales': sale.pk, 'currency': 1,
            'return_items': [{'sales_item': item.pk, 'quantity_kg': 2, 'return_price': 100}]}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data['total_amount']), 0)
        self.assertEqual(Decimal(response.data['refund_amount']), 0)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 97)
        from api.services.accounting.reports import get_profit_and_loss
        self.assertEqual(get_profit_and_loss()['net_income'], -150)

    def test_paid_purchase_can_be_changed_to_free_without_retaining_value(self):
        response = self.purchase(self.material, kind='paid', price=20)
        purchase_id = response.data['id']
        response = self.client.patch(f'/api/raw-material-purchases/{purchase_id}/', {'transaction_type': 'free'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        purchase = RawMaterialPurchase.objects.get(pk=purchase_id)
        self.assertEqual(purchase.total_amount, 0)
        self.assertEqual(purchase.items.get().price_per_unit, 0)
        self.assertIsNone(journal_for_source(purchase))

    def test_free_invoices_reject_bill_payments_and_returns_reject_refunds(self):
        response = self.raw_sale()
        sale = Sales.objects.get(pk=response.data['id'])
        from api.views.data.payment import PaymentViewSet
        self.assertIn('Free invoices', PaymentViewSet()._validate_payment_amount(sale, Decimal('1')))
        response = self.client.post('/api/returns/', {'sales': sale.pk, 'currency': 1, 'refund_amount': 1}, format='json')
        self.assertEqual(response.status_code, 400, response.data)

    def test_foreign_currency_free_sale_keeps_base_inventory_cost(self):
        from api.tests.accounting.helpers import create_exchange_rate
        create_exchange_rate(from_currency=2, rate=Decimal('100'), when=timezone.now())
        response = self.raw_sale(currency=2)
        self.assertEqual(response.status_code, 201, response.data)
        sale = Sales.objects.get(pk=response.data['id'])
        journal = journal_for_source(sale)
        self.assertEqual(native_totals(journal), (Decimal('2.50'), Decimal('2.50')))
        from api.services.accounting.reports import get_profit_and_loss
        self.assertEqual(get_profit_and_loss(mode='base')['net_income'], -250)

    def test_return_in_later_period_reduces_distribution_expense(self):
        from datetime import timedelta
        from api.models.data.returns import Return
        from api.services.accounting import sync_return_journal
        from api.services.accounting.reports import get_profit_and_loss
        response = self.raw_sale(sale_date=(timezone.now() - timedelta(days=3)).isoformat())
        sale = Sales.objects.get(pk=response.data['id'])
        response = self.client.post('/api/returns/', {'sales': sale.pk, 'currency': 1,
            'return_items': [{'sales_item': sale.sales_items.get().pk, 'quantity_kg': 2}]}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        sync_return_journal(Return.objects.get(pk=response.data['id']))
        report = get_profit_and_loss(start_date=timezone.localdate())
        self.assertEqual(report['net_income'], 100)

    def test_cannot_clear_paid_amount_to_convert_purchase_with_payments_to_free(self):
        response = self.purchase(self.material, kind='paid', price=20)
        purchase_id = response.data['id']
        RawMaterialPurchase.objects.filter(pk=purchase_id).update(paid_amount=20)
        response = self.client.patch(f'/api/raw-material-purchases/{purchase_id}/', {
            'transaction_type': 'free', 'paid_amount': 0}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
