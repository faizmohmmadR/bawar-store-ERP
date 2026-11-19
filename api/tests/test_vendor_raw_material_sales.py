from decimal import Decimal
from django.test import TestCase
from api.tests import test_raw_material_sales as fixtures
from api.models.data.vendors import Vendor
from api.models.data.sales import Sales
from api.models.data.raw_materials import RawMaterialPurchase
from api.models.data.payment import GeneralPayment, Payment
from api.tests.accounting.helpers import journal_for_source


class VendorRawMaterialSalesTests(TestCase):
    setUp = fixtures.RawMaterialSalesTests.setUp

    def vendor(self):
        vendor, _ = Vendor.objects.get_or_create(name='Supplier accepting goods')
        return vendor

    def purchase(self, amount=1000, currency=1):
        response = self.client.post('/api/raw-material-purchases/', {'vendor': self.vendor().pk, 'currency': currency,
            'status': 'received', 'purchase_items': [{'raw_material': self.material.pk, 'quantity': 10, 'price_per_unit': amount / 10}]}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return RawMaterialPurchase.objects.get(pk=response.data['id'])

    def goods(self, kind='sale', price=60, quantity=5, **overrides):
        data = {'vendor': self.vendor().pk, 'customer': None, 'vendor_transaction': kind, 'currency': 1, 'status': 'confirmed',
            'sales_items': [{'sale_source': 'raw_material', 'raw_material_stock': self.stock.pk, 'quantity': quantity, 'unit': 'kg', 'sell_price': price}]}
        data.update(overrides)
        return self.client.post('/api/raw-material-sales/', data, format='json')

    def test_sale_reduces_stock_and_vendor_debt_without_cash(self):
        purchase = self.purchase()
        response = self.goods()
        self.assertEqual(response.status_code, 201, response.data)
        sale = Sales.objects.get(pk=response.data['id'])
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 105)
        purchase.refresh_from_db()
        self.assertEqual(purchase.paid_amount, 300)
        receipt = GeneralPayment.objects.get(source_sale=sale)
        self.assertEqual(receipt.available_credit, 0)
        codes = set(journal_for_source(sale).lines.values_list('gl_account__code', flat=True))
        self.assertTrue({'1320', '4000', '5200', '1100'}.issubset(codes))
        self.assertNotIn('1000', codes)
        from api.services.accounting.queries import get_journals_for_source
        self.assertEqual(get_journals_for_source('sales', sale.pk, include_related=True).count(), 2)
        application = receipt.allocations.get(is_credit_application=True)
        self.assertEqual(set(journal_for_source(application).lines.values_list('gl_account__code', flat=True)), {'1320', '2000'})
        self.assertIsNone(journal_for_source(receipt.allocations.get(is_advance=True)))
        from api.services.contact_ledger import get_vendor_finance
        self.assertEqual(get_vendor_finance(self.vendor())['AFN']['balance'], -700)

    def test_purchase_return_is_not_sales_revenue(self):
        purchase = self.purchase()
        response = self.goods(kind='purchase_return')
        self.assertEqual(response.status_code, 201, response.data)
        sale = Sales.objects.get(pk=response.data['id'])
        codes = set(journal_for_source(sale).lines.values_list('gl_account__code', flat=True))
        self.assertIn('1100', codes)
        self.assertNotIn('4000', codes)
        self.assertNotIn('5200', codes)
        purchase.refresh_from_db()
        self.assertEqual(purchase.paid_amount, 300)
        from api.services.trade_reporting import trade_summary
        summary = trade_summary(Sales.objects.all(), Sales.objects.all())
        self.assertEqual(summary['count'], 0)
        from api.services.trade_reporting import get_trade_report
        report = get_trade_report(currency=1)
        self.assertEqual(report['purchases']['returns_in_period'], 300)
        self.assertEqual(report['purchases']['net_invoiced_in_period'], 700)

    def test_excess_vendor_credit_applies_to_future_purchase(self):
        response = self.goods(price=80)
        self.assertEqual(response.status_code, 201, response.data)
        receipt = GeneralPayment.objects.get(source_sale_id=response.data['id'])
        self.assertEqual(receipt.available_credit, 400)
        purchase = self.purchase(amount=200)
        purchase.refresh_from_db()
        self.assertEqual(purchase.paid_amount, 200)
        self.assertEqual(receipt.available_credit, 200)

    def test_cancelling_and_deleting_vendor_goods_reverses_credit_and_stock(self):
        purchase = self.purchase()
        response = self.goods()
        sale_id = response.data['id']
        response = self.client.patch(f'/api/raw-material-sales/{sale_id}/', {'status': 'cancelled'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        purchase.refresh_from_db()
        self.assertEqual(purchase.paid_amount, 0)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 110)
        self.assertFalse(GeneralPayment.objects.filter(source_sale_id=sale_id).exists())
        self.assertIsNone(journal_for_source(Sales.objects.get(pk=sale_id)))

    def test_vendor_credit_is_not_cash_flow_and_is_not_customer_receivable(self):
        self.purchase()
        response = self.goods()
        self.assertEqual(response.status_code, 201, response.data)
        from api.services.financial_reports import _period_purchase_payments, _period_receivable_base
        self.assertFalse(_period_purchase_payments(None, None).exists())
        self.assertEqual(_period_receivable_base(None, None), 0)
        from api.services.trade_reporting import trade_summary
        summary = trade_summary(Sales.objects.all(), Sales.objects.all())
        self.assertEqual(summary['unpaid'], 0)
        self.assertEqual(summary['payments_in_period'], 0)
        purchase_summary = trade_summary(RawMaterialPurchase.objects.all(), RawMaterialPurchase.objects.all())
        self.assertEqual(purchase_summary['credit_settlements_in_period'], 300)
        self.assertEqual(purchase_summary['payments_in_period'], 0)
        from api.services.operational_report import get_operational_report
        report = get_operational_report()
        self.assertEqual(report['operations']['purchases_unpaid_afn'], 700)

    def test_party_and_source_validation(self):
        self.assertEqual(self.goods(customer=self.customer.pk).status_code, 400)
        self.assertEqual(self.goods(vendor=None).status_code, 400)
        self.assertEqual(self.goods(kind='purchase_return', transaction_type='free').status_code, 400)
        response = self.goods(sales_items=[{'sale_source': 'stock', 'quantity': 1, 'sell_price': 10}])
        self.assertEqual(response.status_code, 400)

    def test_price_edit_reallocates_supplier_credit(self):
        purchase = self.purchase()
        response = self.goods()
        sale = Sales.objects.get(pk=response.data['id'])
        item = sale.sales_items.get()
        response = self.client.patch(f'/api/raw-material-sales/{sale.pk}/', {'sales_items': [
            {'id': item.pk, 'sale_source': 'raw_material', 'raw_material_stock': self.stock.pk, 'unit': 'kg', 'quantity': 5, 'sell_price': 70}]}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        purchase.refresh_from_db()
        self.assertEqual(purchase.paid_amount, 350)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 105)

    def test_vendor_bottle_sale_uses_pieces(self):
        from api.models.data.raw_materials import RawMaterial, RawMaterialStock, RawMaterialCategory
        material = RawMaterial.objects.create(name='Supplier bottle', material_type='bottle', unit='piece', capacity_kg=1, category=RawMaterialCategory.objects.first())
        stock = RawMaterialStock.objects.create(raw_material=material, quantity=10, last_purchase_price=2)
        response = self.goods(sales_items=[{'sale_source': 'raw_material', 'raw_material_stock': stock.pk, 'unit': 'piece', 'quantity': 4, 'sell_price': 3}])
        self.assertEqual(response.status_code, 201, response.data)
        stock.refresh_from_db()
        self.assertEqual(stock.quantity, 6)
        self.assertEqual(GeneralPayment.objects.get(source_sale_id=response.data['id']).available_credit, 12)

    def test_vendor_currency_credit_is_not_applied_to_other_currency(self):
        from api.tests.accounting.helpers import create_exchange_rate
        from django.utils import timezone
        create_exchange_rate(from_currency=2, rate=100, when=timezone.now())
        purchase = self.purchase(amount=1000)
        response = self.goods(currency=2, price=2)
        self.assertEqual(response.status_code, 201, response.data)
        purchase.refresh_from_db()
        self.assertEqual(purchase.paid_amount, 0)
        receipt = GeneralPayment.objects.get(source_sale_id=response.data['id'])
        self.assertEqual(receipt.available_credit, 10)
        usd_purchase = self.purchase(amount=20, currency=2)
        usd_purchase.refresh_from_db()
        self.assertEqual(usd_purchase.paid_amount, 10)

    def test_hard_delete_releases_vendor_credit(self):
        purchase = self.purchase()
        response = self.goods()
        response = self.client.delete(f"/api/raw-material-sales/{response.data['id']}/?permanent=true")
        self.assertEqual(response.status_code, 204, getattr(response, 'data', None))
        purchase.refresh_from_db()
        self.assertEqual(purchase.paid_amount, 0)

    def test_soft_delete_restores_raw_stock_and_reopens_purchase(self):
        purchase = self.purchase()
        response = self.goods()
        sale_id = response.data['id']
        response = self.client.delete(f'/api/raw-material-sales/{sale_id}/')
        self.assertEqual(response.status_code, 204)
        purchase.refresh_from_db()
        self.assertEqual(purchase.paid_amount, 0)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 110)
        self.assertFalse(GeneralPayment.objects.filter(source_sale_id=sale_id).exists())
        sale = Sales.all_objects.get(pk=sale_id)
        self.assertEqual(sale.status, 'cancelled')
        self.assertIsNone(journal_for_source(sale))

    def test_vendor_credit_and_party_are_not_editable_as_general_payments(self):
        response = self.goods()
        receipt = GeneralPayment.objects.get(source_sale_id=response.data['id'])
        response = self.client.patch(f'/api/general-payments/{receipt.pk}/', {'amount': 1}, format='json')
        self.assertEqual(response.status_code, 404)
        response = self.client.patch(f'/api/raw-material-sales/{receipt.source_sale_id}/', {'vendor': None, 'customer': self.customer.pk}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_favorable_purchase_return_variance_is_income_not_sales(self):
        response = self.goods(kind='purchase_return', price=60)
        self.assertEqual(response.status_code, 201, response.data)
        sale = Sales.objects.get(pk=response.data['id'])
        journal = journal_for_source(sale)
        self.assertEqual(journal.lines.get(gl_account__code='4200').credit, 50)
        self.assertFalse(journal.lines.filter(gl_account__code='4000').exists())
        from api.services.accounting.reports import get_profit_and_loss
        self.assertEqual(get_profit_and_loss()['net_income'], 50)

    def test_different_historical_rates_post_settlement_fx(self):
        from api.tests.accounting.helpers import create_exchange_rate
        from django.utils import timezone
        from datetime import timedelta
        now = timezone.now()
        create_exchange_rate(from_currency=2, rate=100, when=now)
        purchase = self.purchase(amount=20, currency=2)
        tomorrow = now + timedelta(days=1)
        create_exchange_rate(from_currency=2, rate=120, when=tomorrow)
        response = self.goods(currency=2, price=2, sale_date=tomorrow.isoformat())
        self.assertEqual(response.status_code, 201, response.data)
        receipt = GeneralPayment.objects.get(source_sale_id=response.data['id'])
        self.assertEqual(receipt.exchange_rate, 120)
        application = receipt.allocations.get(is_credit_application=True)
        journal = journal_for_source(application)
        self.assertEqual(journal.lines.get(gl_account__code='5350').debit, 200)
        purchase.refresh_from_db()
        self.assertEqual(purchase.paid_amount, 10)
