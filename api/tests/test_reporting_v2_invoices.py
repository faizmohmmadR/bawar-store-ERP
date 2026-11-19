from datetime import timedelta
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.journal import GLAccount, JournalEntry, JournalLine
from api.models.data.sales import Sales, SalesItems
from api.models.data.payment import Payment
from api.models.data.raw_materials import RawMaterial, RawMaterialPurchase, RawMaterialPurchaseItem
from api.models.data.returns import Return, ReturnItems
from api.models.data.vendors import Vendor
from api.services.reporting.contracts import ReportScope
from api.services.reporting.invoices import invoice_reconciliation, customer_invoice_balances
from api.tests.accounting.helpers import TXN_WHEN, create_confirmed_sale, create_order_payment, create_staff_user


class InvoiceReportingTests(TestCase):
    def sale(self, when=TXN_WHEN):
        return create_confirmed_sale(amount=Decimal('100'), when=when)

    def balances(self, **params):
        return customer_invoice_balances(ReportScope.from_params(params))

    def check(self, **params):
        return invoice_reconciliation(ReportScope.from_params(params))

    def returned(self, sale, amount=20, refund=0, when=TXN_WHEN, quantity=2):
        item = sale.sales_items.first()
        SalesItems.objects.filter(pk=item.pk).update(unit='kg', quantity=10, liter_amount=10, sell_price=10)
        doc = Return.objects.bulk_create([Return(sales=sale, return_number=f'R-{sale.pk}-{Return.objects.count()}',
            return_date=when, currency=1, total_amount=amount, total_amount_base=amount,
            refund_amount=refund, refund_amount_base=refund)])[0]
        ReturnItems.objects.bulk_create([ReturnItems(return_order=doc, sales_item=item, quantity_kg=quantity,
            return_price=10, return_amount=amount)])
        journal = JournalEntry.objects.create(content_type=ContentType.objects.get_for_model(doc), object_id=doc.pk, entry_date=when)
        for code, debit, credit in [('4100', amount, 0), ('1200', 0, amount - refund), ('1000', 0, refund)]:
            if debit or credit:
                JournalLine.objects.create(journal_entry=journal, gl_account=GLAccount.objects.get(code=code, currency=1),
                    currency=1, debit=debit, credit=credit, base_debit=debit, base_credit=credit, exchange_rate=1)
        return doc

    def test_sale_item_quantity_price_total_matches(self):
        self.sale()
        self.assertEqual(self.check()['findings'], [])

    def test_discount_is_applied_once_to_sum_of_lines(self):
        sale = self.sale()
        Sales.objects.filter(pk=sale.pk).update(discount_percentage=10, total_amount=90, total_amount_base=90)
        self.assertEqual(self.check()['findings'], [])
        Sales.objects.filter(pk=sale.pk).update(total_amount=100)
        self.assertIn('invoice_total_mismatch', self.check()['findings'][0]['errors'])

    def test_missing_quantity_is_reviewed_without_current_packaging_guess(self):
        sale = self.sale()
        sale.sales_items.update(quantity=0)
        row = self.check()['findings'][0]
        self.assertEqual(row['kind'], 'requires_review')
        self.assertIn('historical_quantity_basis_missing', row['errors'])

    def test_missing_invoice_items_are_not_accepted_as_zero(self):
        sale = self.sale()
        sale.sales_items.update(deleted_at=TXN_WHEN)
        self.assertIn('missing_invoice_items', self.check()['findings'][0]['errors'])

    def test_purchase_line_and_header_are_independently_checked(self):
        vendor = Vendor.objects.create(name='Supplier')
        material = RawMaterial.objects.create(name='Material', unit='kg')
        purchase = RawMaterialPurchase.objects.bulk_create([RawMaterialPurchase(vendor=vendor, invoice_number='P-ITEMS',
            currency=1, total_amount=20, total_amount_base=20, status='received', purchase_date=TXN_WHEN)])[0]
        item = RawMaterialPurchaseItem.objects.bulk_create([RawMaterialPurchaseItem(purchase=purchase, raw_material=material,
            quantity=2, price_per_unit=10, total_price=20)])[0]
        self.assertEqual(self.check()['findings'], [])
        RawMaterialPurchaseItem.objects.filter(pk=item.pk).update(total_price=19)
        self.assertIn('purchase_line_total_mismatch', self.check()['findings'][0]['errors'])

    def test_return_without_refund_reduces_invoice_outstanding(self):
        sale = self.sale()
        create_order_payment(order=sale, amount=Decimal('30'), payment_type='sale')
        self.returned(sale)
        row = self.balances()['rows'][0]
        self.assertEqual(row['closing_balance'], '50.0000')
        self.assertEqual(self.check()['findings'], [])

    def test_refund_does_not_reduce_receivable_twice(self):
        sale = self.sale()
        create_order_payment(order=sale, amount=Decimal('100'), payment_type='sale')
        self.returned(sale, refund=20)
        self.assertEqual(self.balances()['rows'][0]['closing_balance'], '0.0000')
        self.assertEqual(self.check()['findings'], [])

    def test_partial_refund_only_applies_remaining_return_credit(self):
        sale = self.sale()
        self.returned(sale, refund=5)
        self.assertEqual(self.balances()['rows'][0]['closing_balance'], '85.0000')

    def test_future_payment_and_return_do_not_change_past_balance(self):
        sale = self.sale()
        later = TXN_WHEN + timedelta(days=3)
        create_order_payment(order=sale, amount=Decimal('30'), payment_type='sale', when=later)
        self.returned(sale, when=later)
        self.assertEqual(self.balances(end_date=TXN_WHEN.date().isoformat())['rows'][0]['closing_balance'], '100.0000')

    def test_old_invoice_is_included_in_closing_balance_and_opening(self):
        sale = self.sale(when=TXN_WHEN - timedelta(days=10))
        create_order_payment(order=sale, amount=Decimal('30'), payment_type='sale')
        row = self.balances(start_date=TXN_WHEN.date().isoformat())['rows'][0]
        self.assertEqual((row['opening_balance'], row['period_change'], row['closing_balance']), ('100.0000', '-30.0000', '70.0000'))

    def test_current_paid_cache_is_not_used_for_historical_balance(self):
        sale = self.sale()
        Sales.objects.filter(pk=sale.pk).update(paid_amount=999, paid_amount_base=999)
        self.assertEqual(self.balances()['rows'][0]['closing_balance'], '100.0000')

    def test_overpayment_stays_visible_as_customer_credit(self):
        sale = self.sale()
        create_order_payment(order=sale, amount=Decimal('100'), payment_type='sale')
        self.returned(sale)
        party = self.balances()['parties'][0]
        self.assertEqual((party['receivable'], party['customer_credit']), ('0.0000', '20.0000'))

    def test_different_customers_are_not_offset_against_one_another(self):
        first, second = self.sale(), self.sale()
        create_order_payment(order=first, amount=Decimal('100'), payment_type='sale')
        self.returned(first)
        positions = {p['customer_id']: p for p in self.balances()['parties']}
        self.assertEqual(positions[first.customer_id]['customer_credit'], '20.0000')
        self.assertEqual(positions[second.customer_id]['receivable'], '100.0000')

    def test_deleted_return_does_not_change_invoice_balance(self):
        sale = self.sale()
        doc = self.returned(sale)
        Return.objects.filter(pk=doc.pk).update(deleted_at=TXN_WHEN)
        self.assertEqual(self.balances()['rows'][0]['closing_balance'], '100.0000')

    def test_return_wrong_currency_is_flagged_and_not_added_to_native_balance(self):
        sale = self.sale()
        doc = self.returned(sale)
        Return.objects.filter(pk=doc.pk).update(currency=2)
        row = self.balances()['rows'][0]
        self.assertEqual(row['closing_balance'], '100.0000')
        self.assertTrue(row['issues'])
        self.assertIn('return_currency_mismatch', self.check()['findings'][0]['errors'])

    def test_return_refund_above_total_is_flagged(self):
        sale = self.sale()
        doc = self.returned(sale, refund=20)
        Return.objects.filter(pk=doc.pk).update(refund_amount=25, refund_amount_base=25)
        self.assertIn('invalid_return_or_refund_amount', self.check()['findings'][0]['errors'])

    def test_foreign_return_at_different_rate_is_not_certified(self):
        sale = self.sale()
        doc = self.returned(sale)
        Sales.objects.filter(pk=sale.pk).update(currency=2, exchange_rate=80, total_amount_base=8000)
        Return.objects.filter(pk=doc.pk).update(currency=2, exchange_rate=90, total_amount_base=1800)
        row = next(row for row in self.check()['findings'] if row['source_model'] == 'return')
        self.assertEqual(row['kind'], 'requires_review')
        self.assertIn('foreign_return_carrying_rate_requires_review', row['errors'])

    def test_same_customer_invoices_net_at_customer_level_only(self):
        first, second = self.sale(), self.sale()
        Sales.objects.filter(pk=second.pk).update(customer_id=first.customer_id)
        create_order_payment(order=first, amount=Decimal('100'), payment_type='sale')
        self.returned(first)
        parties = self.balances()['parties']
        self.assertEqual(len(parties), 1)
        self.assertEqual(parties[0]['receivable'], '80.0000')

    def test_credit_receipt_and_application_count_only_once(self):
        from api.services.general_payments import save_general_payment
        sale = self.sale()
        save_general_payment(dict(payment_type='sale', customer=sale.customer, currency=1,
            amount=Decimal('100'), amount_base=Decimal('100'), exchange_rate=Decimal('1'),
            payment_method='cash', payment_date=TXN_WHEN))
        row = self.balances()['rows'][0]
        self.assertEqual((row['settled_amount'], row['closing_balance']), ('100.0000', '0.0000'))
        self.assertEqual(len(row['payment_ids']), 1)

    def test_credit_application_without_header_marks_position_unverified(self):
        sale = self.sale()
        payment = create_order_payment(order=sale, amount=Decimal('10'), payment_type='sale')
        Payment.objects.filter(pk=payment.pk).update(is_credit_application=True)
        self.assertIn('invalid_credit_application_header', self.balances()['rows'][0]['issues'])

    def test_opening_does_not_include_future_invoice(self):
        self.sale(when=TXN_WHEN + timedelta(days=1))
        row = self.balances(start_date=TXN_WHEN.date().isoformat())['rows'][0]
        self.assertEqual(row['opening_balance'], '0.0000')

    def test_wrong_sale_line_on_return_is_flagged(self):
        first, second = self.sale(), self.sale()
        doc = self.returned(first)
        ReturnItems.objects.filter(return_order=doc).update(sales_item=second.sales_items.first())
        self.assertIn('return_item_wrong_or_deleted_sale_line', self.check()['findings'][0]['errors'])

    def test_cumulative_return_quantity_includes_prior_period(self):
        sale = self.sale(when=TXN_WHEN - timedelta(days=10))
        self.returned(sale, amount=60, quantity=6, when=TXN_WHEN - timedelta(days=5))
        self.returned(sale, amount=60, quantity=6)
        rows = self.check(start_date=TXN_WHEN.date().isoformat())['findings']
        self.assertTrue(any('return_quantity_exceeds_sale_or_is_invalid' in row['errors'] for row in rows))
        self.assertIn('returned_value_exceeds_invoice', self.balances()['rows'][0]['issues'])

    def test_return_journal_wrong_refund_account_is_detected(self):
        sale = self.sale()
        doc = self.returned(sale, refund=20)
        JournalLine.objects.filter(journal_entry__content_type=ContentType.objects.get_for_model(doc),
            journal_entry__object_id=doc.pk, gl_account__code='1000').update(gl_account=GLAccount.objects.get(code='1050', currency=1))
        self.assertIn('unexpected_account_or_currency', self.check()['findings'][0]['errors'])

    def test_read_only_and_permission_protected_paginated_api(self):
        self.sale()
        before = (JournalEntry.objects.count(), JournalLine.objects.count(), ContentType.objects.count())
        self.balances()
        self.check()
        self.assertEqual(before, (JournalEntry.objects.count(), JournalLine.objects.count(), ContentType.objects.count()))
        client = APIClient()
        self.assertIn(client.get('/api/reports/v2/customer-invoice-balances/').status_code, (401, 403))
        user = create_staff_user(username='invoice-audit', email='invoice-audit@example.com', as_admin=True)
        client.force_authenticate(user)
        response = client.get('/api/reports/v2/customer-invoice-balances/', {'page_size': 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['meta']['amount_scale'], 4)
        self.assertEqual(client.get('/api/reports/v2/invoice-reconciliation/', {'account_id': 1}).status_code, 400)
