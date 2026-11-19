"""Current operational inventory pools beside saved AFN Inventory 1100."""
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from api.models.data.inventory_batch import InventoryBatch
from api.models.data.journal import JournalEntry, JournalLine
from api.models.data.packing import PackingReturn
from api.models.data.raw_material_process import RawMaterialProcess
from api.models.data.raw_materials import RawMaterialPurchaseItem, RawMaterialStock
from api.models.data.stock import Stock
from api.models.data.storage_tank import StorageTank
from api.services.tank_inventory import get_tank_liquid_totals
from .contracts import money
from .invoices import string4

ZERO = Decimal('0')
CENT = Decimal('0.01')


def inventory_current_position(scope):
    if any((scope.start_date, scope.end_date, scope.currency, scope.account_id)):
        raise ValidationError({'filters': 'Current inventory position does not support historical or partial filters.'})

    rows = []

    def add(pool, item_id, name, quantity, unit, value, issues=()):
        rows.append({'pool': pool, 'item_id': item_id, 'item_name': name,
                     'quantity': string4(quantity) if quantity is not None else None, 'unit': unit,
                     'value_afn': string4(value) if value is not None else None,
                     'issues': sorted(set(issues))})

    purchase_value = defaultdict(lambda: ZERO)
    for item in RawMaterialPurchaseItem.objects.filter(
        purchase__status='received',
        purchase__deleted_at__isnull=True,
        quantity__gt=0,
    ).only('raw_material_id', 'quantity', 'price_per_unit_base'):
        purchase_value[item.raw_material_id] += (
            Decimal(item.quantity or 0) * Decimal(item.price_per_unit_base or 0)
        )

    stock_ct = ContentType.objects.get_for_model(RawMaterialStock)
    stock_ids_with_gl = set(
        JournalEntry.objects.filter(
            content_type=stock_ct,
            deleted_at__isnull=True,
            is_auto=True,
        ).values_list('object_id', flat=True)
    )

    raw_opening_without_purchase = ZERO
    raw_opening_above_purchases = ZERO
    raw_opening_missing_gl = ZERO

    for stock in RawMaterialStock.objects.select_related('raw_material'):
        qty = Decimal(stock.quantity)
        price = Decimal(stock.last_purchase_price)
        known = qty >= ZERO and (qty == ZERO or price > ZERO or stock.zero_cost_allowed)
        issues = []
        if not known:
            issues.append('raw_material_quantity_invalid' if qty < ZERO else 'raw_material_cost_unknown')
        bought_value = purchase_value.get(stock.raw_material_id, ZERO)
        if known and qty > ZERO and price > ZERO:
            ops_value = qty * price
            opening_value = max(ops_value - bought_value, ZERO)
            if bought_value <= ZERO and opening_value > ZERO:
                raw_opening_without_purchase += opening_value
                if stock.pk not in stock_ids_with_gl:
                    issues.append('opening_stock_without_gl')
                    raw_opening_missing_gl += opening_value
            elif opening_value > ZERO:
                raw_opening_above_purchases += opening_value
                if stock.pk not in stock_ids_with_gl:
                    issues.append('opening_excess_without_gl')
                    raw_opening_missing_gl += opening_value
        add('raw_material', stock.raw_material_id, stock.raw_material.name, qty,
            stock.raw_material.unit, qty * price if known else None, issues)
    for tank in StorageTank.objects.all():
        try:
            liters, value, _ = get_tank_liquid_totals(tank)
            issues = []
        except ValidationError:
            liters, value, issues = None, None, ['tank_balance_inconsistent']
        add('storage_tank', tank.pk, tank.name, liters, 'liter', value, issues)

    batches = defaultdict(list)
    for batch in InventoryBatch.objects.select_related('product'):
        batches[(batch.product_id, batch.condition)].append(batch)
    stocks = {(stock.product_id, stock.condition): stock
              for stock in Stock.all_objects.select_related('product')}
    for key in sorted(set(batches) | set(stocks)):
        stock = stocks.get(key)
        lots = batches.get(key, [])
        if stock is not None and stock.deleted_at is not None and not lots and stock.piece_amount == ZERO:
            continue
        issues = []
        if stock is None:
            issues.append('stock_summary_missing')
        elif stock.deleted_at is not None:
            issues.append('stock_summary_soft_deleted')
        if not lots:
            qty = Decimal(stock.piece_amount)
            if qty > ZERO:
                issues.append('batch_history_missing')
            value = None if qty > ZERO else ZERO
        else:
            on_hand = [lot for lot in lots if lot.status in ('active', 'expired') and lot.remaining_pieces > ZERO]
            unsupported = [lot for lot in lots if lot.status not in ('active', 'expired') and lot.remaining_pieces > ZERO]
            negative = [lot for lot in lots if lot.remaining_pieces < ZERO]
            qty = sum((lot.remaining_pieces for lot in on_hand), ZERO)
            if unsupported:
                issues.append('positive_batch_with_unvalued_status')
            if negative:
                issues.append('negative_batch_quantity')
            if any(lot.currency != 1 or lot.unit_cost <= ZERO for lot in on_hand):
                issues.append('batch_cost_unknown')
            # A missing Stock cache is an operational discrepancy, but priced
            # on-hand batches still provide an independently known valuation.
            value = (sum((lot.remaining_pieces * lot.unit_cost for lot in on_hand), ZERO)
                     if not unsupported and not negative
                     and not any(lot.currency != 1 or lot.unit_cost <= ZERO for lot in on_hand)
                     else None)
            cache_quantity_differs = stock is not None and Decimal(stock.piece_amount) != qty
            cache_price_differs = (stock is not None and value is not None and qty > ZERO
                                   and (Decimal(stock.buy_price) - value / qty).copy_abs() > Decimal('0.0001'))
            if cache_quantity_differs or cache_price_differs:
                issues.append('stock_cache_mismatch')
        product = stock.product if stock else lots[0].product
        add('finished_stock', stock.pk if stock else None, f'{product.name} [{key[1]}]',
            qty, 'piece', value, issues)

    for returned in PackingReturn.objects.select_related('stock__product').filter(
        inventory_moved=True, remaining_bottle_count__gt=0,
    ):
        qty = Decimal(returned.remaining_bottle_count)
        known = returned.unit_cost_afn > ZERO
        add('packing_return', returned.pk, returned.stock.product.name, qty, 'piece',
            qty * returned.unit_cost_afn if known else None,
            [] if known else ['packing_return_cost_unknown'])

    for process in RawMaterialProcess.objects.exclude(status=RawMaterialProcess.STATUS_MOVED_TO_STORAGE).prefetch_related('items'):
        if (process.status == RawMaterialProcess.STATUS_IN_PROCESS
                and process.material_cost_afn == ZERO and process.extra_expense_afn == ZERO):
            continue
        if process.status == RawMaterialProcess.STATUS_COMPLETED:
            value = Decimal(process.total_cost_afn)
            issues = []
        else:
            items = list(process.items.all())
            item_cost = sum((Decimal(item.material_cost_afn) for item in items), ZERO)
            issues = ['work_in_process_output_not_final']
            if not items or any(item.quantity <= ZERO or item.material_cost_afn < ZERO for item in items):
                issues.append('work_in_process_inputs_missing_or_invalid')
            if item_cost != process.material_cost_afn:
                issues.append('work_in_process_material_cost_mismatch')
            if process.extra_expense_afn != ZERO:
                issues.append('extra_production_cost_source_unverified')
            if process.total_cost_afn != process.material_cost_afn + process.extra_expense_afn:
                issues.append('work_in_process_total_cost_mismatch')
            value = Decimal(process.total_cost_afn) if len(issues) == 1 else None
        add('production_pending_transfer', process.pk, process.process_number,
            process.output_quantity_liters if process.status == RawMaterialProcess.STATUS_COMPLETED else None,
            'liter', value, issues)

    lines = JournalLine.objects.filter(journal_entry__deleted_at__isnull=True,
                                       gl_account__code='1100').select_related('journal_entry')
    gl = ZERO
    unknown_gl = 0
    line_count = 0
    for line in lines.iterator(chunk_size=1000):
        line_count += 1
        if (line.base_debit is None or line.base_credit is None or line.needs_rate_review
                or line.exchange_rate is None or line.exchange_rate <= ZERO
                or (line.currency == 1 and line.exchange_rate != 1)):
            unknown_gl += 1
        else:
            gl += line.base_debit - line.base_credit
    unknown_pools = sum(row['value_afn'] is None for row in rows)
    operational = (sum((Decimal(row['value_afn']) for row in rows), ZERO)
                   if not unknown_pools else None)
    recorded = gl if not unknown_gl else None
    difference = (operational.quantize(CENT, rounding=ROUND_HALF_UP) - recorded
                  if operational is not None and recorded is not None else None)
    return {
        'meta': {**scope.metadata(), 'report': 'inventory_current_position',
                 'source': 'current_operational_pools_and_inventory_journal_lines',
                 'currency_id': 1, 'snapshot_at': timezone.now().isoformat()},
        'status': 'comparison_only', 'rows': rows,
        'operational_total_afn': string4(operational) if operational is not None else None,
        'inventory_gl_afn': money(recorded), 'difference_afn': money(difference),
        'unknown_pool_count': unknown_pools, 'unknown_gl_base_count': unknown_gl,
        'inventory_line_count': line_count,
        'gap_analysis': {
            'raw_opening_without_purchase_afn': string4(raw_opening_without_purchase),
            'raw_opening_above_purchases_afn': string4(raw_opening_above_purchases),
            'raw_opening_missing_gl_afn': string4(raw_opening_missing_gl),
        },
        'limitations': [
            'Operational quantities and pooled costs are current mutable snapshots; historical cutoff is intentionally unsupported.',
            'Finished stock is valued from live on-hand batches, raw stock from its moving average, and tank liquid from its operational ledger.',
            'Packing returns, work in process and production awaiting transfer are separate pools. WIP output quantity is not final; its consumed-material value is shown only when item costs match and no unverified extra cost exists.',
            'Missing batch history, unknown cost, inconsistent tank balances or unknown GL base amounts make dependent totals null.',
            'The 1100 difference is a diagnostic comparison, not certified inventory: opening balances, legacy edits and capitalization may differ.',
            'gap_analysis estimates raw opening not backed by received purchases; run repair_raw_material_opening_gl to capitalize missing GL.',
        ],
    }
