"""Walk-in (no customer) sales settle as cash automatically."""
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from django.utils import timezone

from api.models.data.currency import BASE_CURRENCY_ID
from api.models.data.customers import Customer
from api.models.data.payment import Payment
from api.models.data.sales import Sales
from api.services.accounting.coa import ensure_accounting_ready
from api.services.walk_in_sale_payment import auto_pay_walk_in_sale, is_walk_in_sale
from api.tests.accounting.helpers import create_staff_user


class WalkInSalePaymentTests(TestCase):
    def setUp(self):
        ensure_accounting_ready(currency_id=BASE_CURRENCY_ID)
        self.user = create_staff_user(username='walkin', email='walkin@test.local', as_admin=True)

    def test_is_walk_in_when_no_party(self):
        sale = Sales.objects.create(
            sale_date=timezone.now(),
            currency=BASE_CURRENCY_ID,
            status='confirmed',
            total_amount=Decimal('50'),
        )
        self.assertTrue(is_walk_in_sale(sale))

    def test_not_walk_in_with_customer(self):
        customer = Customer.objects.create(name='Named')
        sale = Sales.objects.create(
            customer=customer,
            sale_date=timezone.now(),
            currency=BASE_CURRENCY_ID,
            status='confirmed',
            total_amount=Decimal('50'),
        )
        self.assertFalse(is_walk_in_sale(sale))
        self.assertIsNone(auto_pay_walk_in_sale(sale, user=self.user))

    def _confirmed_walk_in(self, amount='2500.00'):
        # Sales post_save recalculates totals from lines; set amount via update.
        sale = Sales.objects.create(
            sale_date=timezone.now(),
            currency=BASE_CURRENCY_ID,
            status='confirmed',
            total_amount=Decimal(amount),
        )
        Sales.objects.filter(pk=sale.pk).update(total_amount=Decimal(amount))
        sale.refresh_from_db()
        return sale

    def test_auto_pays_full_cash_balance(self):
        sale = self._confirmed_walk_in('2500.00')
        payment = auto_pay_walk_in_sale(sale, user=self.user)
        self.assertIsNotNone(payment)
        self.assertEqual(payment.payment_method, 'cash')
        self.assertEqual(payment.payment_type, 'sale')
        self.assertEqual(payment.amount, Decimal('2500.00'))
        self.assertEqual(payment.object_id, sale.pk)

        sale.refresh_from_db()
        self.assertEqual(sale.paid_amount, Decimal('2500.0000'))

        ct = ContentType.objects.get_for_model(sale)
        self.assertEqual(
            Payment.objects.filter(content_type=ct, object_id=sale.pk).count(),
            1,
        )

    def test_idempotent_does_not_double_pay(self):
        sale = self._confirmed_walk_in('100')
        first = auto_pay_walk_in_sale(sale, user=self.user)
        second = auto_pay_walk_in_sale(sale, user=self.user)
        self.assertIsNotNone(first)
        self.assertIsNone(second)
        self.assertEqual(
            Payment.objects.filter(
                content_type=ContentType.objects.get_for_model(sale),
                object_id=sale.pk,
            ).count(),
            1,
        )

    def test_skips_free_and_draft(self):
        free = Sales.objects.create(
            sale_date=timezone.now(),
            currency=BASE_CURRENCY_ID,
            status='confirmed',
            transaction_type='free',
            total_amount=Decimal('0'),
        )
        draft = Sales.objects.create(
            sale_date=timezone.now(),
            currency=BASE_CURRENCY_ID,
            status='draft',
            total_amount=Decimal('80'),
        )
        self.assertIsNone(auto_pay_walk_in_sale(free, user=self.user))
        self.assertIsNone(auto_pay_walk_in_sale(draft, user=self.user))
