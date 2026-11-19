from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.db.models import Sum
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from api.models.data.customers import Customer
from api.models.data.vendors import Vendor
from api.models.data.sales import Sales
from api.models.data.raw_materials import RawMaterialPurchase
from api.models.data.payment import GeneralPayment, Payment
from api.serializers.data.payment import GeneralPaymentSerializer
from api.services.general_payments import balance_data
from api.tests.accounting.helpers import (
    TXN_WHEN, create_confirmed_sale, create_exchange_rate, create_order_payment,
    journal_for_source, native_totals,
)
from api.views.data.general_payment import GeneralPaymentViewSet
from api.views.data.payment import PaymentViewSet


class OpenGeneralPayments(GeneralPaymentViewSet):
    permission_classes = []


class OpenBillPayments(PaymentViewSet):
    permission_classes = []


class GeneralPaymentTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.old = create_confirmed_sale(amount=Decimal('100'), when=TXN_WHEN - timedelta(days=2))
        self.new = create_confirmed_sale(amount=Decimal('200'), when=TXN_WHEN - timedelta(days=1))
        Sales.objects.filter(pk=self.new.pk).update(customer=self.old.customer)
        self.new.refresh_from_db()
        self.vendor = Vendor.objects.create(name='General supplier')

    def post(self, **changes):
        data = dict(payment_type='sale', customer=self.old.customer_id, currency=1,
                    amount='150', payment_method='cash', payment_date=TXN_WHEN.isoformat())
        data.update(changes)
        return OpenGeneralPayments.as_view({'post': 'create'})(self.factory.post('/general-payments/', data, format='json'))

    def edit(self, receipt_id, **changes):
        return OpenGeneralPayments.as_view({'patch': 'partial_update'})(self.factory.patch('/', changes, format='json'), pk=receipt_id)

    def purchase(self, amount, when=TXN_WHEN, **changes):
        return RawMaterialPurchase.objects.create(vendor=self.vendor, currency=1, total_amount=amount,
            total_amount_base=amount, status='received', purchase_date=when, **changes)

    def test_one_receipt_keeps_exact_cash_and_settles_oldest_bills_from_credit(self):
        create_order_payment(order=self.old, amount=Decimal('30'), payment_type='sale')
        response = self.post()
        self.assertEqual(response.status_code, 201, response.data)
        receipt = GeneralPayment.objects.get(pk=response.data['id'])
        advance = receipt.allocations.get(is_advance=True)
        applications = {
            p.object_id: p for p in receipt.allocations.filter(is_credit_application=True)
        }
        self.assertEqual(advance.amount, 150)
        self.assertEqual(applications[self.old.pk].amount, 70)
        self.assertEqual(applications[self.new.pk].amount, 80)
        self.old.refresh_from_db()
        self.new.refresh_from_db()
        self.assertEqual((self.old.paid_amount, self.new.paid_amount), (100, 80))
        # Cash posts once for the exact receipt; bill rows are non-cash applications.
        self.assertEqual(native_totals(journal_for_source(advance)), (150, 150))
        self.assertFalse(
            journal_for_source(applications[self.old.pk]).lines.filter(
                gl_account__code__in=['1000', '1050', '1060'],
            ).exists()
        )
        self.assertIsNone(journal_for_source(receipt))

    def test_general_purchase_pays_multiple_received_bills(self):
        old = self.purchase(40, when=TXN_WHEN - timedelta(days=1))
        new = self.purchase(80)
        response = self.post(payment_type='purchase', customer=None, vendor=self.vendor.pk, amount='90', payment_method='bank')
        self.assertEqual(response.status_code, 201, response.data)
        old.refresh_from_db()
        new.refresh_from_db()
        self.assertEqual((old.paid_amount, new.paid_amount), (40, 50))
        receipt = GeneralPayment.objects.get(pk=response.data['id'])
        advance = receipt.allocations.get(is_advance=True)
        self.assertEqual(advance.amount, 90)
        self.assertEqual(advance.payment_method, 'bank')
        self.assertEqual(native_totals(journal_for_source(advance)), (90, 90))
        for allocation in receipt.allocations.filter(is_credit_application=True):
            self.assertEqual(allocation.payment_method, 'bank')
            self.assertIsNotNone(journal_for_source(allocation))

    def test_balance_excludes_other_parties_currencies_draft_deleted_and_cancelled(self):
        create_confirmed_sale(amount=Decimal('500'))
        for status in ['draft', 'cancelled']:
            Sales.objects.create(customer=self.old.customer, currency=1, total_amount=900, status=status)
        usd = Sales.objects.create(customer=self.old.customer, currency=2, total_amount=999, status='draft')
        Sales.objects.filter(pk=usd.pk).update(status='confirmed')
        deleted = Sales.objects.create(customer=self.old.customer, currency=1, total_amount=900, status='draft')
        deleted.soft_delete()
        self.assertEqual(balance_data('sale', self.old.customer_id, 1)['total_due'], 300)
        pending = self.purchase(100)
        RawMaterialPurchase.objects.filter(pk=pending.pk).update(status='pending')
        self.assertEqual(balance_data('purchase', self.vendor.pk, 1)['total_due'], 0)

    def test_invalid_payment_inputs_create_nothing(self):
        for amount in ['0', '-1', 'NaN', 'Infinity', 'invalid', '0.001']:
            response = self.post(amount=amount)
            self.assertEqual(response.status_code, 400, response.data)
        response = self.post(customer=999999)
        self.assertEqual(response.status_code, 400)
        response = self.post(vendor=self.vendor.pk)
        self.assertEqual(response.status_code, 400)
        response = self.post(currency=99)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(GeneralPayment.objects.count(), 0)
        self.assertEqual(Payment.objects.count(), 0)

    def test_edit_reallocates_without_double_count_and_delete_restores_bills(self):
        receipt_id = self.post().data['id']
        before_ids = list(Payment.objects.values_list('pk', flat=True))
        response = self.edit(receipt_id, amount='250', payment_method='sarafi')
        self.assertEqual(response.status_code, 200, response.data)
        self.old.refresh_from_db()
        self.new.refresh_from_db()
        self.assertEqual((self.old.paid_amount, self.new.paid_amount), (100, 150))
        self.assertFalse(Payment.objects.filter(pk__in=before_ids).exists())
        receipt = GeneralPayment.objects.get(pk=receipt_id)
        advance = receipt.allocations.get(is_advance=True)
        self.assertEqual(advance.amount, 250)
        self.assertEqual(advance.payment_method, 'sarafi')
        self.assertEqual(native_totals(journal_for_source(advance)), (250, 250))
        for p in receipt.allocations.filter(is_credit_application=True):
            self.assertEqual(p.payment_method, 'sarafi')
            self.assertIsNotNone(journal_for_source(p))
        response = OpenGeneralPayments.as_view({'delete': 'destroy'})(self.factory.delete('/'), pk=receipt_id)
        self.assertEqual(response.status_code, 204, response.data)
        self.old.refresh_from_db()
        self.new.refresh_from_db()
        self.assertEqual((self.old.paid_amount, self.new.paid_amount), (0, 0))
        self.assertFalse(Payment.objects.exists())
        self.assertFalse(GeneralPayment.objects.exists())

    def test_failed_edit_rolls_back_receipt_allocations_and_journals(self):
        receipt_id = self.post().data['id']
        ids = list(Payment.objects.values_list('pk', flat=True))
        from rest_framework.exceptions import ValidationError
        with patch('api.services.general_payments._create_payment', side_effect=ValidationError('Posting failed')):
            response = self.edit(receipt_id, amount='301')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(list(Payment.objects.values_list('pk', flat=True)), ids)
        self.assertEqual(GeneralPayment.objects.get(pk=receipt_id).amount, 150)
        self.new.refresh_from_db()
        self.assertEqual(self.new.paid_amount, 50)
        self.assertTrue(all(journal_for_source(p) for p in Payment.objects.all()))

    def test_edit_cannot_move_receipt_to_another_party_type_or_currency(self):
        receipt_id = self.post().data['id']
        for data in [dict(currency=2), dict(customer=Customer.objects.create(name='Other').pk), dict(payment_type='purchase', customer=None, vendor=self.vendor.pk)]:
            response = self.edit(receipt_id, **data)
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(GeneralPayment.objects.get(pk=receipt_id).amount, 150)

    def test_group_allocations_cannot_be_edited_or_deleted_individually(self):
        receipt_id = self.post().data['id']
        payment = GeneralPayment.objects.get(pk=receipt_id).allocations.first()
        for method, action in [('patch', 'partial_update'), ('delete', 'destroy')]:
            request = getattr(self.factory, method)('/', {'amount': '1'}, format='json')
            response = OpenBillPayments.as_view({method: action})(request, pk=payment.pk)
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(Payment.objects.get(pk=payment.pk).amount, payment.amount)

    def test_foreign_currency_rate_and_sum_match_posted_allocations(self):
        create_exchange_rate(from_currency=2, rate=Decimal('80'), when=TXN_WHEN - timedelta(days=5))
        old = create_confirmed_sale(amount=Decimal('10'), currency=2, when=TXN_WHEN - timedelta(days=2))
        new = create_confirmed_sale(amount=Decimal('20'), currency=2, when=TXN_WHEN - timedelta(days=1))
        Sales.objects.filter(pk=new.pk).update(customer=old.customer)
        create_exchange_rate(from_currency=2, rate=Decimal('90'), when=TXN_WHEN)
        response = self.post(customer=old.customer_id, currency=2, amount='15.01')
        self.assertEqual(response.status_code, 201, response.data)
        receipt = GeneralPayment.objects.get(pk=response.data['id'])
        self.assertEqual(receipt.exchange_rate, 90)
        self.assertEqual(receipt.amount_base, Decimal('1350.90'))
        # amount_base comes from the single cash advance, not bill applications.
        self.assertEqual(
            receipt.amount_base,
            receipt.allocations.filter(is_credit_application=False).aggregate(total=Sum('amount_base'))['total'],
        )
        self.assertTrue(all(journal_for_source(p) for p in receipt.allocations.all()))

    def test_save_rechecks_balance_after_another_payment(self):
        serializer = GeneralPaymentSerializer(data=dict(payment_type='sale', customer=self.old.customer_id,
            currency=1, amount='300', payment_date=TXN_WHEN.isoformat()))
        self.assertTrue(serializer.is_valid(), serializer.errors)
        create_order_payment(order=self.old, amount=Decimal('1'), payment_type='sale')
        receipt = serializer.save()
        self.assertEqual(receipt.available_credit, 1)
        self.assertEqual(receipt.allocations.get(is_advance=True).amount, 300)
        self.assertEqual(
            receipt.allocations.filter(is_credit_application=True).aggregate(total=Sum('amount'))['total'],
            299,
        )

    def test_preview_for_edit_includes_own_allocations(self):
        receipt_id = self.post().data['id']
        self.assertEqual(balance_data('sale', self.old.customer_id, 1)['total_due'], 150)
        self.assertEqual(balance_data('sale', self.old.customer_id, 1, receipt_id)['total_due'], 300)
        response = OpenGeneralPayments.as_view({'get': 'balance'})(self.factory.get('/', {
            'payment_type': 'sale', 'party_id': self.old.customer_id, 'currency': 1,
        }))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['total_due'], 150)

    def test_bill_payment_validation_and_general_payment_share_balance(self):
        self.post(amount='250')
        create = OpenBillPayments.as_view({'post': 'create'})
        for amount in ['51', '-1', 'NaN', 'invalid']:
            response = create(self.factory.post('/', dict(content_type='sales', object_id=self.new.pk,
                amount=amount, currency=1, payment_date=TXN_WHEN.isoformat()), format='json'))
            self.assertEqual(response.status_code, 400, response.data)
        response = create(self.factory.post('/', dict(content_type='sales', object_id=self.new.pk,
            amount='50', currency=1, payment_date=TXN_WHEN.isoformat()), format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(balance_data('sale', self.old.customer_id, 1)['total_due'], 0)
        response = self.post(amount='0.01')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(GeneralPayment.objects.get(pk=response.data['id']).available_credit, Decimal('0.01'))

    def test_failure_mid_allocation_rolls_back_everything(self):
        original = Payment.objects.create
        calls = []
        def create(**kwargs):
            calls.append(kwargs)
            # Fail while applying retained credit to the second open bill.
            if len(calls) == 3:
                from rest_framework.exceptions import ValidationError
                raise ValidationError('Simulated posting failure')
            return original(**kwargs)
        with patch.object(Payment.objects, 'create', side_effect=create):
            response = self.post()
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(GeneralPayment.objects.count(), 0)
        self.assertEqual(Payment.objects.count(), 0)
        self.old.refresh_from_db()
        self.assertEqual(self.old.paid_amount, 0)

    def test_zero_balance_customer_can_leave_a_deposit(self):
        customer = Customer.objects.create(name='Advance customer')
        response = self.post(customer=customer.pk, amount='125')
        self.assertEqual(response.status_code, 201, response.data)
        receipt = GeneralPayment.objects.get(pk=response.data['id'])
        self.assertEqual(receipt.available_credit, 125)
        self.assertEqual(response.data['allocations'], [])
        advance = receipt.allocations.get(is_advance=True)
        self.assertEqual(native_totals(journal_for_source(advance)), (125, 125))
        from api.services.contact_ledger import get_customer_finance, query_customer_transactions
        self.assertEqual(get_customer_finance(customer)['AFN']['balance'], -125)
        self.assertEqual(sum(row['credit_amount'] for row in query_customer_transactions(customer)), 125)

    def test_excess_customer_payment_automatically_pays_future_sale_once(self):
        response = self.post(amount='350')
        self.assertEqual(response.status_code, 201, response.data)
        receipt = GeneralPayment.objects.get(pk=response.data['id'])
        self.assertEqual(receipt.allocations.get(is_advance=True).amount, 350)
        self.assertEqual(receipt.available_credit, 50)
        future = create_confirmed_sale(amount=Decimal('100'), when=TXN_WHEN + timedelta(days=1))
        future.customer = self.old.customer
        future.save(update_fields=['customer'])
        future.refresh_from_db()
        self.assertEqual(future.paid_amount, 50)
        self.assertEqual(receipt.available_credit, 0)
        application = receipt.allocations.get(is_credit_application=True, object_id=future.pk)
        self.assertEqual(application.payment_date, future.sale_date)
        self.assertFalse(journal_for_source(application).lines.filter(gl_account__code__in=['1000', '1050', '1060']).exists())
        from api.services.financial_reports import _period_sale_payments
        # Cash is counted once from the advance (credit applications are excluded).
        self.assertEqual(_period_sale_payments(None, None).aggregate(total=Sum('amount'))['total'], 350)
        from api.services.trade_reporting import get_trade_report
        self.assertEqual(get_trade_report()['sales']['payments_in_period'], 350)
        from api.services.contact_ledger import get_customer_finance, query_customer_transactions
        self.assertEqual(get_customer_finance(self.old.customer)['AFN']['balance'], 50)
        self.assertEqual(sum(row['credit_amount'] for row in query_customer_transactions(self.old.customer)), 350)
        # Re-saving the same bill cannot spend the credit twice.
        future.save()
        self.assertEqual(receipt.allocations.filter(is_credit_application=True, object_id=future.pk).count(), 1)

    def test_supplier_deposit_is_applied_only_when_purchase_received(self):
        response = self.post(payment_type='purchase', customer=None, vendor=self.vendor.pk, amount='75')
        self.assertEqual(response.status_code, 201, response.data)
        receipt = GeneralPayment.objects.get(pk=response.data['id'])
        self.assertEqual(receipt.available_credit, 75)
        purchase = RawMaterialPurchase.objects.create(vendor=self.vendor, currency=1, total_amount=40,
            total_amount_base=40, status='pending', purchase_date=TXN_WHEN + timedelta(days=1))
        self.assertEqual(purchase.paid_amount, 0)
        purchase.status = 'received'
        purchase.save()
        purchase.refresh_from_db()
        self.assertEqual(purchase.paid_amount, 40)
        self.assertEqual(receipt.available_credit, 35)
        from api.services.contact_ledger import get_vendor_finance, query_vendor_transactions
        self.assertEqual(get_vendor_finance(self.vendor)['AFN']['balance'], 35)
        self.assertEqual(sum(row['debit_amount'] for row in query_vendor_transactions(self.vendor)), 75)
        from api.services.financial_reports import _period_purchase_payments
        self.assertEqual(_period_purchase_payments(None, None).aggregate(total=Sum('amount'))['total'], 75)

    def test_cancel_delete_and_reduce_bill_return_credit(self):
        receipt_id = self.post(amount='350').data['id']
        receipt = GeneralPayment.objects.get(pk=receipt_id)
        future = create_confirmed_sale(amount=Decimal('100'), when=TXN_WHEN + timedelta(days=1))
        future.customer = self.old.customer
        future.save()
        self.assertEqual(receipt.available_credit, 0)
        future.status = 'cancelled'
        future.save()
        self.assertEqual(receipt.available_credit, 50)
        future.status = 'confirmed'
        item = future.sales_items.first()
        item.sell_price = Decimal('20')
        item.save()
        future.save()
        self.assertEqual(receipt.available_credit, 30)
        future.delete()
        self.assertEqual(receipt.available_credit, 50)

    def test_credit_stays_with_original_party_and_currency(self):
        receipt_id = self.post(amount='350').data['id']
        receipt = GeneralPayment.objects.get(pk=receipt_id)
        other = create_confirmed_sale(amount=Decimal('10'))
        self.assertEqual(other.paid_amount, 0)
        create_exchange_rate(from_currency=2, rate=Decimal('80'), when=TXN_WHEN - timedelta(days=5))
        other = create_confirmed_sale(amount=Decimal('10'), currency=2)
        other.customer = self.old.customer
        other.save()
        self.assertEqual(other.paid_amount, 0)
        self.assertEqual(receipt.available_credit, 50)

    def test_fx_credit_application_posts_at_future_bill_date_without_new_cash(self):
        customer = Customer.objects.create(name='FX advance customer')
        create_exchange_rate(from_currency=2, rate=Decimal('80'), when=TXN_WHEN)
        response = self.post(customer=customer.pk, currency=2, amount='10')
        self.assertEqual(response.status_code, 201, response.data)
        receipt = GeneralPayment.objects.get(pk=response.data['id'])
        create_exchange_rate(from_currency=2, rate=Decimal('90'), when=TXN_WHEN + timedelta(days=1))
        bill = create_confirmed_sale(amount=Decimal('10'), currency=2, when=TXN_WHEN + timedelta(days=1))
        bill.customer = customer
        bill.save()
        application = receipt.allocations.get(is_credit_application=True)
        self.assertEqual(application.exchange_rate, 80)
        self.assertEqual(journal_for_source(application).entry_date, bill.sale_date)
        self.assertFalse(journal_for_source(application).lines.filter(gl_account__code='1000').exists())
        self.assertEqual(receipt.available_credit, 0)
        self.assertEqual(receipt.amount_base, 800)

    def test_delete_advance_receipt_restores_future_bill_balance(self):
        receipt_id = self.post(amount='350').data['id']
        future = create_confirmed_sale(amount=Decimal('100'), when=TXN_WHEN + timedelta(days=1))
        future.customer = self.old.customer
        future.save()
        response = OpenGeneralPayments.as_view({'delete': 'destroy'})(self.factory.delete('/'), pk=receipt_id)
        self.assertEqual(response.status_code, 204, response.data)
        future.refresh_from_db()
        self.assertEqual(future.paid_amount, 0)
        self.assertFalse(Payment.objects.exists())

    def test_changing_future_sale_customer_returns_credit_to_original_customer(self):
        receipt = GeneralPayment.objects.get(pk=self.post(amount='350').data['id'])
        future = create_confirmed_sale(amount=Decimal('100'), when=TXN_WHEN + timedelta(days=1))
        future.customer = self.old.customer
        future.save()
        self.assertEqual(receipt.available_credit, 0)
        future.customer = Customer.objects.create(name='Different customer')
        future.save()
        future.refresh_from_db()
        self.assertEqual(future.paid_amount, 0)
        self.assertEqual(receipt.available_credit, 50)

    def test_multiple_advances_apply_oldest_first_and_leave_auditable_cash(self):
        customer = Customer.objects.create(name='Multiple deposits')
        first = GeneralPayment.objects.get(pk=self.post(customer=customer.pk, amount='20').data['id'])
        second = GeneralPayment.objects.get(pk=self.post(customer=customer.pk, amount='40', payment_date=(TXN_WHEN + timedelta(days=1)).isoformat()).data['id'])
        future = create_confirmed_sale(amount=Decimal('50'), when=TXN_WHEN + timedelta(days=2))
        future.customer = customer
        future.save()
        self.assertEqual(first.available_credit, 0)
        self.assertEqual(second.available_credit, 10)
        self.assertEqual(first.allocations.get(is_credit_application=True).amount, 20)
        self.assertEqual(second.allocations.get(is_credit_application=True).amount, 30)

    def test_editing_used_deposit_preserves_cash_and_reapplies_remaining_credit(self):
        receipt_id = self.post(amount='350').data['id']
        future = create_confirmed_sale(amount=Decimal('100'), when=TXN_WHEN + timedelta(days=1))
        future.customer = self.old.customer
        future.save()
        response = self.edit(receipt_id, amount='320')
        self.assertEqual(response.status_code, 200, response.data)
        receipt = GeneralPayment.objects.get(pk=receipt_id)
        future.refresh_from_db()
        self.assertEqual(future.paid_amount, 20)
        self.assertEqual(receipt.available_credit, 0)
        self.assertEqual(receipt.allocations.get(is_advance=True).amount, 320)
        self.assertEqual(
            receipt.allocations.get(is_credit_application=True, object_id=future.pk).amount,
            20,
        )
        self.assertEqual(
            receipt.allocations.filter(is_credit_application=False).aggregate(total=Sum('amount'))['total'],
            320,
        )
