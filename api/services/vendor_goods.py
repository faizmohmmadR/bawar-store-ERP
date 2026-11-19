"""Fund supplier credit with raw goods, then settle purchases without cash."""
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction

from api.models.data.payment import GeneralPayment
from api.models.data.vendors import Vendor


@transaction.atomic
def sync_vendor_goods_credit(sale):
    from api.services.general_payments import _create_payment, _remove_allocations, open_bills, apply_credit_to_order

    receipt = GeneralPayment.objects.filter(source_sale_id=sale.pk).first()
    if not sale.vendor_id and not receipt:
        return
    Vendor.objects.select_for_update().get(pk=sale.vendor_id or receipt.vendor_id)
    amount = Decimal(str(sale.total_amount or 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    eligible = sale.vendor_id and sale.deleted_at is None and sale.status not in ('draft', 'cancelled') and amount > 0
    unchanged = receipt and eligible and (receipt.amount, receipt.currency, receipt.exchange_rate, receipt.payment_date) == (amount, sale.currency, sale.exchange_rate, sale.sale_date)
    if receipt and not unchanged:
        _remove_allocations(receipt)
        receipt.delete()
        receipt = None
    if not eligible:
        return
    if not receipt:
        receipt = GeneralPayment.objects.create(source_sale=sale, vendor_id=sale.vendor_id,
            payment_type='purchase', amount=amount,
            amount_base=(amount * sale.exchange_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            currency=sale.currency, exchange_rate=sale.exchange_rate,
            payment_date=sale.sale_date, reference_number=sale.invoice_number, notes=sale.notes)
        _create_payment(receipt, receipt, amount, advance=True)
    for order, _ in open_bills('purchase', sale.vendor_id, sale.currency, lock=True):
        apply_credit_to_order(order)


def sync_vendor_goods_journal(sale, inventory_cost_base):
    """Sale: revenue + COGS. Return: reverse inventory, with any price variance."""
    from api.services.accounting.amounts import cogs_base, cogs_in_txn_currency
    from api.services.accounting.coa import gl_for_source
    from api.services.accounting.posting import replace_journal_for_source, delete_journal_for_source

    if sale.deleted_at is not None or sale.status in ('draft', 'cancelled'):
        delete_journal_for_source(sale)
        sync_vendor_goods_credit(sale)
        return
    total = Decimal(str(sale.total_amount or 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    cost = cogs_in_txn_currency(sale, cogs_base(inventory_cost_base))
    zero = Decimal('0')
    lines = [{'gl_account': gl_for_source('supplier_advance', sale), 'debit': total, 'credit': zero, 'description': 'Supplier credit from raw goods'}]
    if sale.vendor_transaction == 'purchase_return':
        lines.append({'gl_account': gl_for_source('inventory', sale), 'debit': zero, 'credit': cost, 'description': 'Raw materials returned to supplier'})
        variance = cost - total
        if variance:
            lines.append({'gl_account': gl_for_source('stock_adjustment' if variance > 0 else 'other_income', sale), 'debit': max(zero, variance), 'credit': max(zero, -variance), 'description': 'Supplier return price variance'})
    else:
        lines.extend([
            {'gl_account': gl_for_source('sales_revenue', sale), 'debit': zero, 'credit': total, 'description': 'Raw materials sold to supplier'},
            {'gl_account': gl_for_source('free_distribution' if sale.is_free else 'cogs', sale), 'debit': cost, 'credit': zero, 'description': 'Raw material cost'},
            {'gl_account': gl_for_source('inventory', sale), 'debit': zero, 'credit': cost, 'description': 'Raw material stock issued'},
        ])
    replace_journal_for_source(sale, entry_date=sale.sale_date, reference_number=sale.invoice_number,
        description=sale.notes or ('Purchase return' if sale.vendor_transaction == 'purchase_return' else 'Sale to supplier'), lines=lines)
    sync_vendor_goods_credit(sale)
