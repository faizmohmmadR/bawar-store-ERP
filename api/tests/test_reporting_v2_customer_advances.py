from datetime import timedelta
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.customers import Customer
from api.models.data.journal import JournalEntry, JournalLine
from api.models.data.payment import GeneralPayment, Payment
from api.models.data.sales import Sales
from api.services.general_payments import save_general_payment
from api.services.reporting.contracts import ReportScope
from api.services.reporting.customer_advances import customer_advance_balances
from api.services.reporting.party_positions import party_position_overview
from api.tests.accounting.helpers import TXN_WHEN, create_confirmed_sale, create_staff_user


class CustomerAdvanceReportingTests(TestCase):
    def setUp(self):
        self.customer = Customer.objects.create(name='Depositor')

    def receipt(self, amount=100, when=TXN_WHEN, customer=None, currency=1):
        return save_general_payment(dict(payment_type='sale', customer=customer or self.customer, currency=currency,
            amount=Decimal(amount), amount_base=Decimal(amount), exchange_rate=Decimal('1'),
            payment_method='cash', payment_date=when))

    def report(self, **params):
        return customer_advance_balances(ReportScope.from_params(params))

    def overview(self, **params):
        return party_position_overview(ReportScope.from_params(params))

    def sale(self, when=TXN_WHEN):
        sale = create_confirmed_sale(amount=Decimal('100'), when=when)
        Sales.objects.filter(pk=sale.pk).update(customer=self.customer)
        return sale

    def test_deposit_without_invoice_remains_visible(self):
        self.receipt()
        report = self.report()
        self.assertEqual(report['rows'][0]['closing_balance'], '100.0000')
        overview = self.overview()['rows'][0]
        self.assertEqual((overview['party_id'], overview['closing_balance']), (self.customer.pk, '-100.0000'))

    def test_real_receipt_application_is_not_counted_twice(self):
        self.sale()
        self.receipt(amount=140)
        row = self.report()['rows'][0]
        self.assertEqual((row['received_amount'], row['applied_amount'], row['closing_balance']), ('140.0000', '100.0000', '40.0000'))
        self.assertEqual(self.overview()['rows'][0]['closing_balance'], '-40.0000')

    def test_partial_payment_leaves_receivable_without_unused_credit(self):
        self.sale()
        self.receipt(amount=40)
        self.assertEqual(self.report()['rows'][0]['closing_balance'], '0.0000')
        self.assertEqual(self.overview()['rows'][0]['closing_balance'], '60.0000')

    def test_future_receipt_does_not_change_past_position(self):
        self.receipt(when=TXN_WHEN + timedelta(days=2))
        self.assertEqual(self.report(end_date=TXN_WHEN.date().isoformat())['rows'], [])

    def test_old_deposit_opening_is_preserved(self):
        self.receipt(when=TXN_WHEN - timedelta(days=3))
        row = self.report(start_date=TXN_WHEN.date().isoformat())['rows'][0]
        self.assertEqual((row['opening_balance'], row['period_change'], row['closing_balance']), ('100.0000', '0.0000', '100.0000'))

    def test_consumption_of_existing_credit_does_not_create_second_net_payment(self):
        header = self.receipt(when=TXN_WHEN - timedelta(days=3))
        sale = self.sale()
        Payment.objects.bulk_create([Payment(general_payment=header, content_type=ContentType.objects.get_for_model(sale),
            object_id=sale.pk, payment_type='sale', currency=1, amount=100, amount_base=100,
            is_credit_application=True, payment_date=TXN_WHEN)])
        report = self.overview(start_date=TXN_WHEN.date().isoformat())['rows'][0]
        self.assertEqual((report['opening_balance'], report['period_change'], report['closing_balance']), ('-100.0000', '100.0000', '0.0000'))
        self.assertEqual(len(report['components']), 2)

    def test_future_application_does_not_consume_past_credit(self):
        self.sale()
        header = self.receipt(amount=140)
        application = header.allocations.get(is_credit_application=True)
        Payment.objects.filter(pk=application.pk).update(payment_date=TXN_WHEN + timedelta(days=2))
        self.assertEqual(self.report(end_date=TXN_WHEN.date().isoformat())['rows'][0]['closing_balance'], '140.0000')

    def test_applying_prior_credit_to_prior_invoice_has_zero_net_period_effect(self):
        self.sale(when=TXN_WHEN - timedelta(days=5))
        header = self.receipt(when=TXN_WHEN - timedelta(days=3))
        header.allocations.filter(is_credit_application=True).update(payment_date=TXN_WHEN)
        row = self.overview(start_date=TXN_WHEN.date().isoformat())['rows'][0]
        self.assertEqual((row['opening_balance'], row['period_change'], row['closing_balance']), ('0.0000', '0.0000', '0.0000'))

    def test_deleted_header_and_allocations_are_excluded(self):
        header = self.receipt()
        GeneralPayment.objects.filter(pk=header.pk).update(deleted_at=TXN_WHEN)
        self.assertEqual(self.report()['rows'], [])

    def test_deleted_main_allocation_is_not_assumed_to_be_header_amount(self):
        header = self.receipt()
        header.allocations.update(deleted_at=TXN_WHEN)
        row = self.report()['rows'][0]
        self.assertEqual(row['received_amount'], '0.0000')
        self.assertIn('receipt_allocation_mismatch', row['issues'])

    def test_wrong_customer_application_is_flagged(self):
        self.sale()
        header = self.receipt()
        other = Customer.objects.create(name='Other')
        GeneralPayment.objects.filter(pk=header.pk).update(customer=other)
        self.assertIn('invalid_credit_application_target', self.report()['rows'][0]['issues'])

    def test_overapplied_credit_is_not_clamped(self):
        self.sale()
        header = self.receipt()
        header.allocations.filter(is_credit_application=True).update(amount=110)
        row = self.report()['rows'][0]
        self.assertEqual(row['closing_balance'], '-10.0000')
        self.assertIn('credit_overapplied', row['issues'])

    def test_wrong_allocation_currency_is_flagged(self):
        header = self.receipt()
        header.allocations.update(currency=2)
        self.assertIn('invalid_allocation_currency_type_or_amount', self.report()['rows'][0]['issues'])

    def test_customer_ids_and_currencies_stay_separate(self):
        self.receipt(amount=10)
        other = Customer.objects.create(name='Other')
        self.receipt(amount=20, customer=other)
        # Import a native USD deposit without relying on a current FX lookup.
        header = GeneralPayment.objects.create(payment_type='sale', customer=self.customer, currency=2,
            amount=5, amount_base=400, exchange_rate=80, payment_date=TXN_WHEN)
        Payment.objects.bulk_create([Payment(general_payment=header, content_type=ContentType.objects.get_for_model(header),
            object_id=header.pk, payment_type='sale', currency=2, amount=5, amount_base=400,
            exchange_rate=80, is_advance=True, payment_date=TXN_WHEN)])
        self.assertEqual(len(self.report()['parties']), 3)
        self.assertEqual(self.report(currency=2)['parties'][0]['closing_balance'], '5.0000')

    def test_unlinked_advance_is_counted_not_guessed_from_target(self):
        sale = self.sale()
        Payment.objects.bulk_create([Payment(content_type=ContentType.objects.get_for_model(sale), object_id=sale.pk,
            payment_type='sale', currency=1, amount=40, is_advance=True, payment_date=TXN_WHEN)])
        self.assertEqual(self.report()['unlinked_advance_count'], 1)
        self.assertEqual(self.overview()['unlinked_customer_advance_count'], 1)

    def test_receipt_method_mismatch_is_visible(self):
        header = self.receipt()
        header.allocations.update(payment_method='bank')
        self.assertIn('receipt_payment_method_mismatch', self.report()['rows'][0]['issues'])

    def test_read_only_permissions_and_pagination(self):
        self.receipt()
        before = (JournalEntry.objects.count(), JournalLine.objects.count(), ContentType.objects.count())
        self.overview()
        self.assertEqual(before, (JournalEntry.objects.count(), JournalLine.objects.count(), ContentType.objects.count()))
        client = APIClient()
        self.assertIn(client.get('/api/reports/v2/customer-advance-balances/').status_code, (401, 403))
        client.force_authenticate(create_staff_user(username='advance-report', email='advance-report@example.com', as_admin=True))
        response = client.get('/api/reports/v2/customer-advance-balances/', {'page_size': 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(client.get('/api/reports/v2/customer-advance-balances/', {'account_id': 1}).status_code, 400)
