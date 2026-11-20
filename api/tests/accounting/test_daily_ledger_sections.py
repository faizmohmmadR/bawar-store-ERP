"""Operational daily ledger includes all money-bearing business sections."""
from decimal import Decimal

from django.test import TestCase

from api.models.data.vendors import Vendor
from api.models.data.purchases import Purchase as RawMaterialPurchase
from api.services.currency_conversion import populate_base_amounts
from api.services.daily_ledger import DAILY_LEDGER_SECTIONS, build_daily_ledger
from api.tests.accounting.helpers import (
    AFN,
    TXN_WHEN,
    create_confirmed_sale,
    create_exchange_rate,
    create_expense,
    create_order_payment,
    create_withdrawal,
    USD,
    USD_RATE_8720,
)


class DailyLedgerSectionsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_exchange_rate(from_currency=USD, rate=USD_RATE_8720, when=TXN_WHEN)

    def test_expected_money_sections_are_registered(self):
        required = {
            'sales',
            'returns',
            'sales_payments',
            'purchases',
            'purchase_payments',
            'expenses',
            'withdrawals',
            'payroll',
            'advances',
            'commission_payments',
            'equipment',
            'currency_exchanges',
            'production',
            'loans_given',
            'loans_received',
            'loan_collections',
            'loan_repayments',
        }
        self.assertTrue(required.issubset(set(DAILY_LEDGER_SECTIONS)))

    def test_operational_daybook_includes_sales_purchases_payments_expenses(self):
        sale = create_confirmed_sale(amount=Decimal('100.00'), currency=AFN, when=TXN_WHEN)
        create_order_payment(
            order=sale,
            amount=Decimal('100.00'),
            payment_type='sale',
            when=TXN_WHEN,
        )
        create_expense(amount=Decimal('25.00'), currency=AFN, when=TXN_WHEN)
        create_withdrawal(amount=Decimal('10.00'), currency=AFN, when=TXN_WHEN)

        vendor = Vendor.objects.create(name='DL Vendor', is_active=True)
        purchase = RawMaterialPurchase(
            vendor=vendor,
            purchase_date=TXN_WHEN,
            status='received',
            currency=AFN,
            total_amount=Decimal('200.00'),
        )
        populate_base_amounts(
            purchase,
            amount_fields=['total_amount'],
            at_datetime=TXN_WHEN,
            raise_if_missing=True,
        )
        purchase.save()
        create_order_payment(
            order=purchase,
            amount=Decimal('50.00'),
            payment_type='purchase',
            when=TXN_WHEN,
        )

        payload, error = build_daily_ledger(
            start_date=TXN_WHEN,
            end_date=TXN_WHEN,
        )
        self.assertIsNone(error)
        sections = {row['section'] for row in payload['rows']}
        self.assertIn('sales', sections)
        self.assertIn('sales_payments', sections)
        self.assertIn('purchases', sections)
        self.assertIn('purchase_payments', sections)
        self.assertIn('expenses', sections)
        self.assertIn('withdrawals', sections)

        self.assertGreater(payload['totals']['cash_in_base'], 0)
        self.assertGreater(payload['totals']['cash_out_base'], 0)

    def test_section_filter_purchase_payments(self):
        vendor = Vendor.objects.create(name='DL Vendor 2', is_active=True)
        purchase = RawMaterialPurchase(
            vendor=vendor,
            purchase_date=TXN_WHEN,
            status='received',
            currency=AFN,
            total_amount=Decimal('80.00'),
        )
        populate_base_amounts(
            purchase,
            amount_fields=['total_amount'],
            at_datetime=TXN_WHEN,
            raise_if_missing=True,
        )
        purchase.save()
        create_order_payment(
            order=purchase,
            amount=Decimal('80.00'),
            payment_type='purchase',
            when=TXN_WHEN,
        )

        payload, error = build_daily_ledger(
            start_date=TXN_WHEN,
            end_date=TXN_WHEN,
            section='purchase_payments',
        )
        self.assertIsNone(error)
        self.assertTrue(payload['rows'])
        self.assertTrue(all(r['section'] == 'purchase_payments' for r in payload['rows']))
