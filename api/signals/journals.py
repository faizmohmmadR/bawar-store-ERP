"""
Journal posting signals.

Errors are re-raised so the surrounding DB transaction rolls back and
books stay consistent with source documents.
"""
from django.db.models.signals import post_delete, post_save, pre_save, pre_delete
from django.dispatch import receiver


# ── Sales ──────────────────────────────────────────────────────────────
@receiver(post_save, sender='api.Sales')
def handle_sales_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source, sync_sales_journal
    if instance.deleted_at is not None:
        delete_journal_for_source(instance)
        return
    sync_sales_journal(instance)
    from api.services.general_payments import apply_credit_to_order
    apply_credit_to_order(instance)


@receiver(post_delete, sender='api.Sales')
def delete_sales_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source
    delete_journal_for_source(instance)


def _resync_sale_from_items(sale_id):
    from api.models.data.sales import Sales
    from api.services.accounting import recalculate_sale_totals, sync_sales_journal

    sale = Sales.objects.filter(pk=sale_id).first()
    if sale:
        recalculate_sale_totals(sale)
        sync_sales_journal(sale)
        from api.services.general_payments import apply_credit_to_order
        apply_credit_to_order(sale)


@receiver(post_save, sender='api.SalesItems')
def resync_sale_journal_on_item_save(sender, instance, **kwargs):
    if instance.sales_id:
        _resync_sale_from_items(instance.sales_id)


@receiver(post_delete, sender='api.SalesItems')
def resync_sale_journal_on_item_delete(sender, instance, **kwargs):
    if instance.sales_id:
        _resync_sale_from_items(instance.sales_id)


# ── Returns ────────────────────────────────────────────────────────────
@receiver(post_save, sender='api.Return')
def handle_return_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source, sync_return_journal
    if instance.deleted_at is not None:
        delete_journal_for_source(instance)
    else:
        sync_return_journal(instance)
    _sync_employee_return_settlement(instance.sales)


@receiver(post_delete, sender='api.Return')
def delete_return_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source
    delete_journal_for_source(instance)
    _sync_employee_return_settlement(instance.sales)


def _sync_employee_return_settlement(sale):
    if sale and sale.employee_id:
        from api.services.employee_sale_salary import sync_employee_sale_salary_settlement
        sync_employee_sale_salary_settlement(sale)


def _resync_return_from_items(return_id):
    from api.models.data.returns import Return
    from api.services.accounting import recalculate_return_totals, sync_return_journal

    return_order = Return.objects.filter(pk=return_id).first()
    if return_order:
        recalculate_return_totals(return_order)
        sync_return_journal(return_order)
        _sync_employee_return_settlement(return_order.sales)


@receiver(post_save, sender='api.ReturnItems')
def resync_return_journal_on_item_save(sender, instance, **kwargs):
    if instance.return_order_id:
        _resync_return_from_items(instance.return_order_id)


@receiver(post_delete, sender='api.ReturnItems')
def resync_return_journal_on_item_delete(sender, instance, **kwargs):
    if instance.return_order_id:
        _resync_return_from_items(instance.return_order_id)


# ── Product purchases ──────────────────────────────────────────────────
@receiver(post_save, sender='api.Purchase')
def handle_purchase_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source, sync_purchase_journal
    if instance.deleted_at is not None:
        delete_journal_for_source(instance)
        return
    sync_purchase_journal(instance)
    from api.services.general_payments import apply_credit_to_order
    apply_credit_to_order(instance)


@receiver(post_delete, sender='api.Purchase')
def delete_purchase_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source
    delete_journal_for_source(instance)


def _resync_purchase_from_items(purchase_id):
    from api.models.data.purchases import Purchase
    from api.services.accounting import sync_purchase_journal

    purchase = Purchase.objects.filter(pk=purchase_id).first()
    if purchase:
        sync_purchase_journal(purchase)
        from api.services.general_payments import apply_credit_to_order
        apply_credit_to_order(purchase)


@receiver(post_save, sender='api.PurchaseItem')
def resync_purchase_journal_on_item_save(sender, instance, **kwargs):
    if instance.purchase_id:
        _resync_purchase_from_items(instance.purchase_id)


@receiver(post_delete, sender='api.PurchaseItem')
def resync_purchase_journal_on_item_delete(sender, instance, **kwargs):
    if instance.purchase_id:
        _resync_purchase_from_items(instance.purchase_id)


# ── Salesman commission payments ───────────────────────────────────────
@receiver(post_save, sender='api.SalesmanCommissionPayment')
def handle_salesman_commission_payment_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source, sync_salesman_commission_payment_journal
    if instance.deleted_at is not None:
        delete_journal_for_source(instance)
        return
    sync_salesman_commission_payment_journal(instance)


@receiver(post_delete, sender='api.SalesmanCommissionPayment')
def delete_salesman_commission_payment_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source
    delete_journal_for_source(instance)


# ── Payments ───────────────────────────────────────────────────────────
@receiver(post_save, sender='api.Payment')
def handle_payment_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source, sync_payment_journal
    if instance.deleted_at is not None:
        delete_journal_for_source(instance)
        from api.services.accounting import sync_order_paid_amount
        related = instance.content_object
        if related and not instance.is_advance:
            sync_order_paid_amount(related)
        # Soft-deleted payments: leave historical drawer row; do not auto-void here.
        return
    sync_payment_journal(instance)
    from api.services.cash_register import sync_drawer_from_payment
    sync_drawer_from_payment(instance)


@receiver(post_delete, sender='api.Payment')
def delete_payment_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source, sync_order_paid_amount

    related = instance.content_object
    delete_journal_for_source(instance)
    if related and not instance.is_advance:
        sync_order_paid_amount(related)


# ── Payroll ────────────────────────────────────────────────────────────
@receiver(post_save, sender='api.Payroll')
def handle_payroll_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source, sync_payroll_journal
    if instance.deleted_at is not None:
        delete_journal_for_source(instance)
        return
    sync_payroll_journal(instance)


@receiver(post_delete, sender='api.Payroll')
def delete_payroll_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source
    delete_journal_for_source(instance)


# ── Loans ──────────────────────────────────────────────────────────────
@receiver(post_save, sender='api.Loan')
def handle_loan_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source, sync_loan_journal
    if getattr(instance, 'deleted_at', None) is not None:
        delete_journal_for_source(instance)
        return
    sync_loan_journal(instance)


@receiver(post_delete, sender='api.Loan')
def delete_loan_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source
    delete_journal_for_source(instance)


@receiver(post_save, sender='api.LoanPayment')
def handle_loan_payment_journal(sender, instance, **kwargs):
    if instance.deleted_at is not None:
        from api.services.accounting import delete_journal_for_source
        delete_journal_for_source(instance)
        return
    from api.services.accounting import sync_loan_payment_journal
    sync_loan_payment_journal(instance)


@receiver(post_delete, sender='api.LoanPayment')
def delete_loan_payment_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source
    delete_journal_for_source(instance)


@receiver(post_save, sender='api.Expense')
def handle_expense_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source, sync_expense_journal
    if instance.deleted_at is not None:
        delete_journal_for_source(instance)
        return
    sync_expense_journal(instance)
    from api.services.cash_register import sync_drawer_from_expense
    sync_drawer_from_expense(instance)


@receiver(post_delete, sender='api.Expense')
def delete_expense_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source
    delete_journal_for_source(instance)


@receiver(post_save, sender='api.Withdrawal')
def handle_withdrawal_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source, sync_withdrawal_journal
    if getattr(instance, 'deleted_at', None) is not None:
        delete_journal_for_source(instance)
        return
    sync_withdrawal_journal(instance)
    from api.services.cash_register import sync_drawer_from_withdrawal
    sync_drawer_from_withdrawal(instance)


@receiver(post_delete, sender='api.Withdrawal')
def delete_withdrawal_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source
    delete_journal_for_source(instance)


@receiver(post_save, sender='api.CurrencyExchange')
def handle_currency_exchange_journal(sender, instance, **kwargs):
    from api.services.accounting import sync_currency_exchange_journal
    sync_currency_exchange_journal(instance)


@receiver(post_delete, sender='api.CurrencyExchange')
def delete_currency_exchange_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source
    delete_journal_for_source(instance)


@receiver(post_save, sender='api.FxRevaluation')
def handle_fx_revaluation_journal(sender, instance, **kwargs):
    from api.services.accounting.revaluation import sync_fx_revaluation_journal
    sync_fx_revaluation_journal(instance)


@receiver(post_delete, sender='api.FxRevaluation')
def delete_fx_revaluation_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source
    delete_journal_for_source(instance)





# ── Stock / batches ────────────────────────────────────────────────────
@receiver(post_save, sender='api.StockAdjustment')
def handle_stock_adjustment_journal(sender, instance, **kwargs):
    from api.services.accounting import sync_stock_adjustment_journal
    sync_stock_adjustment_journal(instance)


@receiver(post_delete, sender='api.StockAdjustment')
def delete_stock_adjustment_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source
    delete_journal_for_source(instance)


@receiver(pre_save, sender='api.Stock')
def cache_stock_before_save(sender, instance, **kwargs):
    if not instance.pk:
        instance._accounting_old_piece_amount = 0
        instance._accounting_old_buy_price = 0
        return
    try:
        old = sender.objects.get(pk=instance.pk)
        instance._accounting_old_piece_amount = old.piece_amount
        instance._accounting_old_buy_price = old.buy_price
    except sender.DoesNotExist:
        instance._accounting_old_piece_amount = 0
        instance._accounting_old_buy_price = 0


@receiver(post_save, sender='api.Stock')
def handle_stock_journal(sender, instance, **kwargs):
    from api.services.accounting import sync_stock_adjustment_journal

    if getattr(instance, '_skip_stock_journal', False):
        return
    old_pieces = getattr(instance, '_accounting_old_piece_amount', None)
    old_price = getattr(instance, '_accounting_old_buy_price', None)
    if old_pieces is None and old_price is None:
        return
    if old_pieces == instance.piece_amount and old_price == instance.buy_price:
        return
    sync_stock_adjustment_journal(
        instance,
        reason='Manual stock edit',
        old_piece_amount=old_pieces if old_pieces is not None else instance.piece_amount,
        old_buy_price=old_price if old_price is not None else instance.buy_price,
    )


@receiver(post_delete, sender='api.Stock')
def delete_stock_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source
    delete_journal_for_source(instance)


@receiver(post_save, sender='api.InventoryBatch')
def handle_inventory_batch_journal(sender, instance, created, **kwargs):
    from api.services.accounting import sync_inventory_batch_journal
    if getattr(instance, '_skip_batch_journal', False):
        return
    # Opening Equity is for true opening intake only. Later remaining_pieces
    # changes (FEFO sales, returns, moves) must not rewrite that journal —
    # sale COGS / stock adjustments own the inventory relief.
    if not created:
        return
    sync_inventory_batch_journal(instance)


@receiver(post_delete, sender='api.InventoryBatch')
def delete_inventory_batch_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source
    delete_journal_for_source(instance)


@receiver(post_save, sender='api.StockTransfer')
def handle_stock_transfer_journal(sender, instance, **kwargs):
    from api.services.accounting import sync_stock_transfer_journal
    sync_stock_transfer_journal(instance)


@receiver(post_delete, sender='api.StockTransfer')
def delete_stock_transfer_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source
    delete_journal_for_source(instance)


# ── Equipment (fixed assets / optional expense) ────────────────────────
@receiver(post_save, sender='api.Equipment')
def handle_equipment_journal(sender, instance, **kwargs):
    from api.services.accounting import sync_equipment_journal
    from api.services.equipment_expense import sync_equipment_linked_expense

    sync_equipment_linked_expense(instance)
    sync_equipment_journal(instance)


@receiver(post_delete, sender='api.Equipment')
def delete_equipment_journal(sender, instance, **kwargs):
    from api.models.data.expenses import Expense
    from api.services.accounting import delete_journal_for_source

    delete_journal_for_source(instance)
    expense_id = getattr(instance, 'expense_id', None)
    if expense_id:
        Expense.objects.filter(pk=expense_id).delete()


# ── Equipment Depreciation ─────────────────────────────────────────────
@receiver(post_save, sender='api.EquipmentDepreciation')
def handle_equipment_depreciation_journal(sender, instance, created, **kwargs):
    from api.services.equipment_depreciation import (
        sync_depreciation_journal,
        recalculate_equipment_accumulated_depreciation,
    )
    sync_depreciation_journal(instance)
    recalculate_equipment_accumulated_depreciation(instance.equipment)


@receiver(post_delete, sender='api.EquipmentDepreciation')
def delete_equipment_depreciation_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source
    from api.services.equipment_depreciation import recalculate_equipment_accumulated_depreciation

    delete_journal_for_source(instance)
    recalculate_equipment_accumulated_depreciation(instance.equipment)


@receiver(post_save, sender='api.SaleBatchAllocation')
def handle_allocation_journal(sender, instance, **kwargs):
    from api.services.accounting import sync_batch_allocation_journal
    sync_batch_allocation_journal(instance)


@receiver(post_delete, sender='api.SaleBatchAllocation')
def delete_allocation_journal(sender, instance, **kwargs):
    from api.services.accounting import delete_journal_for_source
    delete_journal_for_source(instance)


@receiver(pre_delete, sender='api.Sales')
@receiver(pre_delete, sender='api.Purchase')
def release_advance_before_bill_delete(sender, instance, **kwargs):
    from django.contrib.contenttypes.models import ContentType
    from api.models.data.payment import Payment
    for payment in Payment.objects.filter(content_type=ContentType.objects.get_for_model(instance), object_id=instance.pk, is_credit_application=True):
        payment.delete()
