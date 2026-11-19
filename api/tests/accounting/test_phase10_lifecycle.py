"""CRUD journal lifecycle: create / update / delete across operational modules."""
from datetime import date
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from api.models.data.currency import BASE_CURRENCY_ID
from api.models.data.employee import Employee
from api.models.data.equipment import Equipment
from api.models.data.journal import JournalEntry
from api.models.data.payroll import Payroll
from api.models.data.products import Product
from api.models.data.raw_materials import RawMaterialPurchase
from api.models.data.returns import Return, ReturnItems
from api.models.data.sales import Sales, SalesItems
from api.models.data.stock_adjustment import StockAdjustment
from api.models.data.vendors import Vendor
from api.services.accounting.amounts import d
from api.services.accounting.coa import ensure_accounting_ready
from api.services.currency_conversion import populate_base_amounts
from api.tests.accounting.helpers import (
    AFN,
    TXN_WHEN,
    USD,
    USD_RATE_8720,
    create_confirmed_sale,
    create_exchange_rate,
    create_expense,
    create_order_payment,
    create_withdrawal,
    journal_for_source,
    native_totals,
)


def _journals_for(source):
    return list(
        JournalEntry.objects.filter(
            content_type=ContentType.objects.get_for_model(source),
            object_id=source.pk,
            is_auto=True,
        )
    )


class Phase10LifecycleTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_exchange_rate(from_currency=USD, rate=USD_RATE_8720, when=TXN_WHEN)
        ensure_accounting_ready(currency_id=AFN)
        ensure_accounting_ready(currency_id=USD)

    def test_expense_update_and_delete_keeps_journal_in_sync(self):
        expense = create_expense(amount=Decimal('100.00'), currency=AFN)
        journal = journal_for_source(expense)
        self.assertIsNotNone(journal)
        debit, credit = native_totals(journal)
        self.assertEqual(debit, Decimal('100.00'))

        expense.amount = Decimal('250.00')
        populate_base_amounts(
            expense,
            amount_fields=['amount'],
            at_datetime=TXN_WHEN,
            raise_if_missing=True,
        )
        expense.save()
        journal = journal_for_source(expense)
        debit, credit = native_totals(journal)
        self.assertEqual(debit, Decimal('250.00'))
        self.assertEqual(credit, Decimal('250.00'))

        expense.amount = Decimal('0')
        populate_base_amounts(
            expense,
            amount_fields=['amount'],
            at_datetime=TXN_WHEN,
            raise_if_missing=True,
        )
        expense.save()
        self.assertIsNone(journal_for_source(expense))

        expense.amount = Decimal('50.00')
        populate_base_amounts(
            expense,
            amount_fields=['amount'],
            at_datetime=TXN_WHEN,
            raise_if_missing=True,
        )
        expense.save()
        pk = expense.pk
        expense.delete()
        self.assertFalse(
            JournalEntry.objects.filter(
                content_type=ContentType.objects.get_for_model(expense),
                object_id=pk,
                is_auto=True,
            ).exists()
        )

    def test_sale_draft_clears_journal_and_delete_clears_journal(self):
        sale = create_confirmed_sale(amount=Decimal('80.00'), currency=AFN)
        self.assertIsNotNone(journal_for_source(sale))

        sale.status = 'draft'
        sale.save(update_fields=['status'])
        self.assertIsNone(journal_for_source(sale))

        sale.status = 'confirmed'
        sale.save(update_fields=['status'])
        self.assertIsNotNone(journal_for_source(sale))

        sale_pk = sale.pk
        sale.delete()
        self.assertFalse(
            JournalEntry.objects.filter(
                content_type=ContentType.objects.get_for_model(Sales),
                object_id=sale_pk,
                is_auto=True,
            ).exists()
        )

    def test_sale_with_unit_cost_posts_cogs_and_return_reverses_cogs(self):
        sale = create_confirmed_sale(amount=Decimal('100.00'), currency=AFN)
        item = sale.sales_items.select_related('stock').first()
        item.unit_cost = Decimal('10.00')
        item.liter_amount = Decimal('8')  # pieces for dana line used by packaging helpers
        item.quantity = Decimal('8')
        item.save()
        sale.refresh_from_db()

        journal = journal_for_source(sale)
        self.assertIsNotNone(journal)
        by_code = {
            line.gl_account.code: line
            for line in journal.lines.select_related('gl_account')
        }
        self.assertIn('4000', by_code)  # sales revenue
        self.assertIn('1200', by_code)  # AR
        self.assertIn('5200', by_code)  # COGS
        self.assertIn('1100', by_code)  # inventory
        self.assertGreater(d(by_code['5200'].debit), Decimal('0'))

        ret = Return.objects.create(
            sales=sale,
            return_date=TXN_WHEN,
            currency=AFN,
            notes='phase10 return',
        )
        ReturnItems.objects.create(
            return_order=ret,
            sales_item=item,
            liter_amount=Decimal('4'),  # half pieces
            return_price=Decimal('100.00'),
        )
        ret.refresh_from_db()
        ret_journal = journal_for_source(ret)
        self.assertIsNotNone(ret_journal)
        ret_codes = {
            line.gl_account.code: line
            for line in ret_journal.lines.select_related('gl_account')
        }
        self.assertIn('4100', ret_codes)  # sales returns
        self.assertIn('1100', ret_codes)
        self.assertIn('5200', ret_codes)
        self.assertGreater(d(ret_codes['1100'].debit), Decimal('0'))
        self.assertGreater(d(ret_codes['5200'].credit), Decimal('0'))

        ret_pk = ret.pk
        ret.delete()
        self.assertFalse(
            JournalEntry.objects.filter(
                content_type=ContentType.objects.get_for_model(Return),
                object_id=ret_pk,
                is_auto=True,
            ).exists()
        )

    def test_withdrawal_zero_amount_deletes_journal(self):
        withdrawal = create_withdrawal(amount=Decimal('75.00'), currency=AFN)
        self.assertIsNotNone(journal_for_source(withdrawal))

        withdrawal.amount = Decimal('0')
        populate_base_amounts(
            withdrawal,
            amount_fields=['amount'],
            at_datetime=TXN_WHEN,
            raise_if_missing=True,
        )
        withdrawal.save()
        self.assertIsNone(journal_for_source(withdrawal))

    def test_payroll_zero_amount_deletes_journal(self):
        employee = Employee.objects.create(
            full_name='Phase10 Payroll',
            salary=Decimal('1000.00'),
            currency=AFN,
        )
        payroll = Payroll(
            employee=employee,
            payroll_type=Payroll.PAYROLL_TYPE_SALARY,
            month='august',
            year=2026,
            amount=Decimal('1000.00'),
            net_salary=Decimal('1000.00'),
            basic_salary=Decimal('1000.00'),
            currency=AFN,
            payment_method='cash',
            payment_date=TXN_WHEN,
            manual_net=True,
        )
        populate_base_amounts(
            payroll,
            amount_fields=['amount', 'net_salary', 'basic_salary'],
            at_datetime=TXN_WHEN,
            raise_if_missing=True,
        )
        payroll.save()
        self.assertIsNotNone(journal_for_source(payroll))

        payroll.net_salary = Decimal('0')
        payroll.amount = Decimal('0')
        populate_base_amounts(
            payroll,
            amount_fields=['amount', 'net_salary', 'basic_salary'],
            at_datetime=TXN_WHEN,
            raise_if_missing=True,
        )
        payroll.save()
        self.assertIsNone(journal_for_source(payroll))

    def test_rm_purchase_journal_only_when_received_and_payment_gated(self):
        vendor = Vendor.objects.create(name='Phase10 Vendor', is_active=True)
        purchase = RawMaterialPurchase(
            vendor=vendor,
            purchase_date=TXN_WHEN,
            status='pending',
            currency=AFN,
            total_amount=Decimal('500.00'),
        )
        populate_base_amounts(
            purchase,
            amount_fields=['total_amount'],
            at_datetime=TXN_WHEN,
            raise_if_missing=True,
        )
        purchase.save()
        self.assertIsNone(journal_for_source(purchase))

        # Payment while pending must not post AP settlement.
        payment = create_order_payment(
            order=purchase,
            amount=Decimal('500.00'),
            payment_type='purchase',
            when=TXN_WHEN,
        )
        self.assertIsNone(journal_for_source(payment))

        purchase.status = 'received'
        purchase.save(update_fields=['status'])
        purchase_journal = journal_for_source(purchase)
        self.assertIsNotNone(purchase_journal)
        by_code = {
            line.gl_account.code: line
            for line in purchase_journal.lines.select_related('gl_account')
        }
        self.assertEqual(d(by_code['1100'].debit), Decimal('500.00'))
        self.assertEqual(d(by_code['2000'].credit), Decimal('500.00'))

        # Receiving the purchase should auto-resync linked payment journals.
        pay_journal = journal_for_source(payment)
        self.assertIsNotNone(pay_journal)
        pay_codes = {
            line.gl_account.code: line
            for line in pay_journal.lines.select_related('gl_account')
        }
        self.assertEqual(d(pay_codes['2000'].debit), Decimal('500.00'))
        self.assertEqual(d(pay_codes['1000'].credit), Decimal('500.00'))

        purchase.status = 'cancelled'
        purchase.save(update_fields=['status'])
        self.assertIsNone(journal_for_source(purchase))
        self.assertIsNone(journal_for_source(payment))

    def test_equipment_serial_change_does_not_duplicate_acquisition_journal(self):
        equipment = Equipment.objects.create(
            name='Phase10 Mixer',
            quantity=Decimal('1'),
            unit_cost=Decimal('5000.00'),
            currency=AFN,
            acquired_date=date(2026, 1, 1),
            acquisition_type='new_purchase',
            payment_method='cash',
            serial_number='SN-OLD-1',
        )
        journals = _journals_for(equipment)
        self.assertEqual(len(journals), 1)
        self.assertEqual(journals[0].reference_number, f'EQ-{equipment.id}')

        equipment.serial_number = 'SN-NEW-2'
        equipment.save()
        journals = _journals_for(equipment)
        acquisition = [
            j for j in journals if not j.reference_number.startswith(f'DEP-EQ-{equipment.pk}-')
        ]
        self.assertEqual(len(acquisition), 1)
        self.assertEqual(acquisition[0].reference_number, f'EQ-{equipment.id}')
        debit, credit = native_totals(acquisition[0])
        self.assertEqual(debit, Decimal('5000.00'))
        self.assertEqual(credit, Decimal('5000.00'))

        eq_pk = equipment.pk
        equipment.delete()
        self.assertFalse(
            JournalEntry.objects.filter(
                content_type=ContentType.objects.get_for_model(Equipment),
                object_id=eq_pk,
                is_auto=True,
            ).exists()
        )

    def test_stock_adjustment_transfer_clears_prior_loss_journal(self):
        from api.models.data.inventory_batch import InventoryBatch
        from api.models.data.stock import Stock

        product = Product.objects.create(
            name='Phase10 Adj Product',
            bottle_capacity_liters=Decimal('1'),
            bottles_per_carton=8,
        )
        stock = Stock(
            product=product,
            piece_amount=Decimal('20'),
            buy_price=Decimal('5'),
            currency=AFN,
        )
        stock._skip_stock_journal = True
        stock.save()

        batch = InventoryBatch(
            product=product,
            batch_number='P10-BATCH-1',
            pieces_received=Decimal('20'),
            remaining_pieces=Decimal('20'),
            unit_cost=Decimal('5'),
            currency=AFN,
            status=InventoryBatch.STATUS_ACTIVE,
        )
        batch._skip_batch_journal = True
        batch.save()

        adj = StockAdjustment.objects.create(
            inventory_batch=batch,
            adjustment_type=StockAdjustment.ADJUSTMENT_TYPE_DAMAGED,
            quantity_before=Decimal('20'),
            quantity_after=Decimal('15'),
            reason='damage test',
            adjustment_date=TXN_WHEN,
        )
        self.assertIsNotNone(journal_for_source(adj))

        adj.adjustment_type = StockAdjustment.ADJUSTMENT_TYPE_TRANSFER
        adj.save()
        self.assertIsNone(journal_for_source(adj))

    def test_payment_delete_clears_journal(self):
        sale = create_confirmed_sale(amount=Decimal('40.00'), currency=AFN)
        payment = create_order_payment(
            order=sale,
            amount=Decimal('40.00'),
            payment_type='sale',
            when=TXN_WHEN,
        )
        self.assertIsNotNone(journal_for_source(payment))
        pay_pk = payment.pk
        payment.delete()
        self.assertFalse(
            JournalEntry.objects.filter(
                content_type=ContentType.objects.get_for_model(payment),
                object_id=pay_pk,
                is_auto=True,
            ).exists()
        )
