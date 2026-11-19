from datetime import timedelta
from decimal import Decimal
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory

from api.models.data.loan import LoanPayment
from api.serializers.data.loan import LoanPaymentSerializer, LoanSerializer
from api.tests.accounting.helpers import create_loan, create_exchange_rate, journal_for_source, TXN_WHEN
from api.views.data.loan import LoanPaymentViewSet, LoanViewSet


class OpenPayments(LoanPaymentViewSet):
    permission_classes = []


class OpenLoans(LoanViewSet):
    permission_classes = []


class LoanPaymentTests(TestCase):
    def setUp(self):
        self.loan = create_loan(amount=Decimal('100.00'))
        self.factory = APIRequestFactory()

    def create_payment(self, amount='25.50', **extra):
        serializer = LoanPaymentSerializer(data={'loan': self.loan.pk, 'amount': amount, 'payment_date': TXN_WHEN.isoformat(), **extra})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        return serializer.save()

    def test_create_multipart_bill_and_backdated_payment(self):
        with tempfile.TemporaryDirectory() as media, override_settings(MEDIA_ROOT=media):
            date = TXN_WHEN - timedelta(days=2)
            request = self.factory.post('/loan-payments/', {
                'loan': self.loan.pk, 'amount': '0.25', 'payment_date': date.isoformat(),
                'payment_method': 'bank', 'bill_number': 'B-125', 'reference_number': 'BANK-1',
                'bill_file': SimpleUploadedFile('receipt.pdf', b'%PDF-1.4 receipt', content_type='application/pdf'),
            }, format='multipart')
            response = OpenPayments.as_view({'post': 'create'})(request)
            self.assertEqual(response.status_code, 201, response.data)
            payment = LoanPayment.objects.get(pk=response.data['id'])
            self.assertEqual(payment.payment_date, date)
            self.assertEqual(payment.bill_number, 'B-125')
            self.assertTrue(payment.bill_file.storage.exists(payment.bill_file.name))
            self.assertEqual(response.data['currency_details']['code'], 'AFN')
            self.loan.refresh_from_db()
            self.assertEqual(self.loan.amount_paid, Decimal('0.25'))
            self.assertEqual(journal_for_source(payment).entry_date, date)

    def test_api_rejects_invalid_amounts_dates_and_overpayment(self):
        self.create_payment('90')
        for payload in ({'amount': '11'}, {'amount': '0'}, {'amount': '-1'}, {'amount': 'NaN'}, {'amount': 'no'}, {'amount': '0.001'}, {'amount': '1', 'payment_date': 'invalid'}):
            request = self.factory.post('/loan-payments/', {'loan': self.loan.pk, **payload}, format='json')
            response = OpenPayments.as_view({'post': 'create'})(request)
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(self.loan.payments.count(), 1)

    def test_legacy_action_uses_same_validation_and_bill_fields(self):
        view = OpenLoans.as_view({'post': 'add_payment'})
        request = self.factory.post('/', {'amount': 'bad', 'payment_date': 'bad'}, format='json')
        self.assertEqual(view(request, pk=self.loan.pk).status_code, 400)
        request = self.factory.post('/', {'amount': '12.25', 'bill_number': 'OLD-1', 'payment_date': TXN_WHEN.isoformat()}, format='json')
        response = view(request, pk=self.loan.pk)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['bill_number'], 'OLD-1')

    def test_edit_updates_balance_date_and_journal(self):
        payment = self.create_payment('100')
        when = TXN_WHEN + timedelta(days=1)
        serializer = LoanPaymentSerializer(payment, data={'amount': '0.75', 'payment_date': when.isoformat(), 'payment_method': 'sarafi'}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        payment = serializer.save()
        self.loan.refresh_from_db()
        self.assertEqual(self.loan.amount_paid, Decimal('0.75'))
        self.assertEqual(self.loan.balance_due, Decimal('99.25'))
        self.assertFalse(self.loan.is_paid)
        self.assertEqual(journal_for_source(payment).entry_date, when)

    def test_edit_does_not_double_count_own_payment(self):
        payment = self.create_payment('20')
        self.create_payment('70')
        valid = LoanPaymentSerializer(payment, data={'amount': '30'}, partial=True)
        self.assertTrue(valid.is_valid(), valid.errors)
        invalid = LoanPaymentSerializer(payment, data={'amount': '31'}, partial=True)
        self.assertFalse(invalid.is_valid())

    def test_save_rechecks_balance_after_another_payment(self):
        serializer = LoanPaymentSerializer(data={'loan': self.loan.pk, 'amount': '90'})
        self.assertTrue(serializer.is_valid())
        self.create_payment('20')
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            serializer.save()

    def test_payment_cannot_move_to_another_loan(self):
        payment = self.create_payment()
        other = create_loan(amount=Decimal('200'))
        serializer = LoanPaymentSerializer(payment, data={'loan': other.pk}, partial=True)
        self.assertFalse(serializer.is_valid())
        self.assertIn('loan', serializer.errors)

    def test_loan_cannot_reduce_below_paid_or_change_currency(self):
        self.create_payment('50')
        for changes in ({'amount': '40'}, {'currency': 2}, {'loan_type': 'loan_in'}):
            self.loan.refresh_from_db()
            serializer = LoanSerializer(self.loan, data=changes, partial=True)
            self.assertFalse(serializer.is_valid())

    def test_soft_delete_restores_balance_and_removes_journal(self):
        payment = self.create_payment()
        payment.soft_delete()
        self.loan.refresh_from_db()
        self.assertEqual(self.loan.amount_paid, Decimal('0'))
        self.assertEqual(self.loan.amount_paid_base, Decimal('0'))
        self.assertIsNone(journal_for_source(payment))

    def test_loan_edit_preserves_paid_base_from_repayments(self):
        create_exchange_rate(from_currency=2, rate=Decimal('87.20'), when=TXN_WHEN)
        when = TXN_WHEN + timedelta(days=1)
        create_exchange_rate(from_currency=2, rate=Decimal('90'), when=when)
        loan = create_loan(amount=Decimal('100'), currency=2)
        payment = LoanPaymentSerializer(data={'loan': loan.pk, 'amount': '25', 'payment_date': when.isoformat()})
        self.assertTrue(payment.is_valid(), payment.errors)
        payment.save()
        loan.refresh_from_db()
        serializer = LoanSerializer(loan, data={'notes': 'Updated note', 'amount_paid_base': '999'}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        loan.refresh_from_db()
        self.assertEqual(loan.amount_paid_base, Decimal('2250'))

    def test_history_uses_payment_date_and_searches_bill(self):
        recent = self.create_payment('1', bill_number='B-SEARCH')
        self.create_payment('2', payment_method='bank')
        LoanPayment.objects.filter(pk=recent.pk).update(payment_date=TXN_WHEN + timedelta(days=1))
        view = OpenPayments.as_view({'get': 'list'})
        response = view(self.factory.get('/loan-payments/', {'loan': self.loan.pk, 'page_size': 25}))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'][0]['id'], recent.pk)
        response = view(self.factory.get('/loan-payments/', {'search': 'B-SEARCH', 'page_size': 25}))
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['bill_number'], 'B-SEARCH')
