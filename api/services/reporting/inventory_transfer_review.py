"""Review whether internal stock moves have usable, paired source records."""
from decimal import Decimal

from rest_framework.exceptions import ValidationError

from api.models.data.stock_adjustment import StockAdjustment
from api.models.data.stock_transfer import StockTransfer
from .invoices import string4

ZERO = Decimal('0')


def inventory_transfer_review(scope):
    if scope.start_date is not None or scope.currency is not None or scope.account_id is not None:
        raise ValidationError({'filters': 'Stock transfer review supports only end_date.'})
    rows = []
    transfers = StockTransfer.objects.select_related('source_stock', 'target_stock')
    if scope.end_date is not None:
        transfers = transfers.filter(transfer_date__lte=scope.end_date)
    for transfer in transfers:
        issues = []
        endpoints_present = bool(transfer.source_stock_id and transfer.target_stock_id)
        if not endpoints_present:
            issues.append('transfer_endpoint_missing')
        elif transfer.source_stock_id == transfer.target_stock_id:
            issues.append('transfer_locations_not_distinct')
        if endpoints_present and (transfer.source_stock.product_id != transfer.product_id
                       or transfer.target_stock.product_id != transfer.target_product_id):
            issues.append('transfer_product_mismatch')
        if transfer.piece_amount <= ZERO:
            issues.append('transfer_quantity_invalid')
        paired = endpoints_present and transfer.piece_amount > ZERO
        value_known = transfer.currency == 1 and transfer.total_value > ZERO
        if not value_known:
            issues.append('historical_transfer_cost_unknown')
        rows.append({
            'source_model': 'stocktransfer', 'source_id': transfer.pk,
            'reference_number': transfer.transfer_number,
            'effective_at': transfer.transfer_date.isoformat(),
            'source_stock_id': transfer.source_stock_id,
            'target_stock_id': transfer.target_stock_id,
            'quantity_pieces': string4(transfer.piece_amount),
            'value_afn': string4(transfer.total_value) if value_known else None,
            'paired_movement': paired, 'net_change_afn': string4(ZERO) if paired and value_known else None,
            'issues': issues,
        })
    adjustments = StockAdjustment.objects.filter(
        adjustment_type=StockAdjustment.ADJUSTMENT_TYPE_TRANSFER,
    ).select_related('inventory_batch')
    if scope.end_date is not None:
        adjustments = adjustments.filter(adjustment_date__lte=scope.end_date)
    for adjustment in adjustments:
        rows.append({
            'source_model': 'stockadjustment', 'source_id': adjustment.pk,
            'reference_number': adjustment.reference_number or adjustment.inventory_batch.batch_number,
            'effective_at': adjustment.adjustment_date.isoformat(),
            'source_stock_id': None, 'target_stock_id': None,
            'quantity_pieces': string4(abs(adjustment.quantity_after - adjustment.quantity_before)),
            'value_afn': None, 'paired_movement': False, 'net_change_afn': None,
            'issues': ['transfer_adjustment_destination_not_recorded'],
        })
    rows.sort(key=lambda row: (row['effective_at'], row['source_model'], row['source_id']))
    return {
        'meta': {**scope.metadata(), 'report': 'inventory_transfer_review',
                 'source': 'stock_transfer_documents_and_transfer_adjustments', 'currency_id': 1},
        'status': 'review_required', 'rows': rows,
        'limitations': [
            'Only completed StockTransfer documents with both stock endpoints generate paired movement-review events.',
            'A same-stock transfer has no distinct recorded location even though its two accounting-neutral legs net to zero.',
            'Transfer-type StockAdjustment lacks a destination and cannot generate a reliable pair of movements.',
            'Historical condition moves made before StockTransfer recording cannot be reconstructed from batch notes reliably.',
            'Foreign or zero saved transfer value remains unknown; no current GL posting is expected for internal transfers.',
        ],
    }
