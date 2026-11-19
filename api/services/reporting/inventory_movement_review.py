"""Traceable, read-only inventory-event review for the first stage of the stock ledger.

The existing operational models retain source quantities and cost snapshots but
do not yet provide one immutable inventory-event table.  These rows expose the
recorded movements without pretending they reconstruct a certified historical
stock balance.
"""
from collections import defaultdict
from decimal import Decimal

from rest_framework.exceptions import ValidationError

from api.models.data.packing import PackingRun, PackingRunComponent, PackingRunOutput
from api.models.data.raw_material_process import RawMaterialProcess, RawMaterialProcessItem
from api.models.data.raw_materials import RawMaterialPurchase, RawMaterialPurchaseItem
from api.models.data.returns import ReturnItems
from api.models.data.sales import Sales, SalesItems
from api.models.data.stock_bottle_damage import StockBottleDamage
from api.models.data.stock import Stock
from api.models.data.stock_adjustment import StockAdjustment
from api.models.data.stock_transfer import StockTransfer
from api.models.data.storage_tank import ProductionStorageTransfer
from api.models.data.storage_tank_leak import StorageTankLeak
from api.services.raw_material_sales import raw_stock_quantity
from api.utils.packaging import sales_item_pieces
from .invoices import string4

ZERO = Decimal('0')


def _within(value, scope):
    return ((scope.start_date is None or value >= scope.start_date)
            and (scope.end_date is None or value <= scope.end_date))


def inventory_movement_review(scope):
    if scope.currency is not None:
        raise ValidationError({'currency': 'Inventory movement values are recorded in AFN; native-currency filtering is not supported.'})
    if scope.account_id is not None:
        raise ValidationError({'account_id': 'Inventory movement review is source-event based, not GL-account based.'})
    events = []

    # 1. Received raw-material purchases: external entry to the raw-material pool.
    purchases = RawMaterialPurchase.objects.filter(status='received').select_related('vendor')
    for item in RawMaterialPurchaseItem.objects.filter(purchase__in=purchases, purchase__deleted_at__isnull=True).select_related('purchase', 'raw_material'):
        date = item.purchase.purchase_date
        if _within(date, scope):
            events.append(dict(event_model='rawmaterialpurchaseitem', event_id=item.pk, effective_at=date.isoformat(),
                movement='raw_purchase_receipt', location='raw_material', direction='in', item_type='raw_material',
                item_id=item.raw_material_id, item_name=item.raw_material.name, quantity=string4(item.quantity),
                unit=item.raw_material.unit, value_afn=string4(item.total_price_base), source_id=item.purchase_id,
                source_number=item.purchase.invoice_number, date_basis='purchase_date', issues=[]))

    # 2. Production inputs: recorded consumption from the same raw-material pool.
    process_items = RawMaterialProcessItem.objects.filter(process__deleted_at__isnull=True).select_related('process', 'raw_material')
    for item in process_items:
        date = item.process.process_date
        if _within(date, scope):
            events.append(dict(event_model='rawmaterialprocessitem', event_id=item.pk, effective_at=date.isoformat(),
                movement='production_input', location='raw_material', direction='out', item_type='raw_material',
                item_id=item.raw_material_id, item_name=item.raw_material.name, quantity=string4(item.quantity),
                unit=item.raw_material.unit, value_afn=string4(item.material_cost_afn), source_id=item.process_id,
                source_number=item.process.process_number, date_basis='process_date', issues=[]))

    # 3. Completed production transferred to a storage tank. The transfer model
    # has no business-event timestamp, so created_at is explicit in the output.
    transfers = ProductionStorageTransfer.objects.filter(
        production__status=RawMaterialProcess.STATUS_MOVED_TO_STORAGE, production__deleted_at__isnull=True,
    ).select_related('production', 'storage_tank')
    for transfer in transfers:
        date = transfer.created_at
        if _within(date, scope):
            value = Decimal(transfer.quantity_liters) * Decimal(transfer.production.cost_per_liter_afn)
            events.append(dict(event_model='productionstoragetransfer', event_id=transfer.pk, effective_at=date.isoformat(),
                movement='production_to_tank', location='storage_tank', direction='in', item_type='storage_tank',
                item_id=transfer.storage_tank_id, item_name=transfer.storage_tank.name,
                quantity=string4(transfer.quantity_liters), unit='liter', value_afn=string4(value),
                source_id=transfer.production_id, source_number=transfer.production.process_number,
                date_basis='created_at_fallback', issues=['transfer_effective_date_not_recorded']))

    # 4. Packing consumes tank liquid and creates finished packed stock.
    # Output rows supersede finished_stock: counting both would duplicate a lot.
    outputs = defaultdict(list)
    for output in PackingRunOutput.objects.filter(packing_run__deleted_at__isnull=True).select_related('stock__product'):
        outputs[output.packing_run_id].append(output)
    for run in PackingRun.objects.select_related('storage_tank', 'finished_stock', 'product'):
        date = run.created_at
        if not _within(date, scope):
            continue
        if run.storage_tank_id:
            events.append(dict(event_model='packingrun', event_id=run.pk, effective_at=date.isoformat(),
                movement='tank_to_packing', location='storage_tank', direction='out', item_type='storage_tank',
                item_id=run.storage_tank_id, item_name=run.storage_tank.name, quantity=string4(run.quantity_liters),
                unit='liter', value_afn=string4(run.liquid_cost_afn), source_id=run.pk,
                source_number=run.packing_number, date_basis='created_at_fallback',
                issues=['packing_effective_date_not_recorded']))
        if outputs[run.pk]:
            for output in outputs[run.pk]:
                events.append(dict(event_model='packingrunoutput', event_id=output.pk, effective_at=date.isoformat(),
                    movement='packing_to_finished_stock', location='finished_stock', direction='in', item_type='stock',
                    item_id=output.stock_id, item_name=output.stock.product.name,
                    quantity=string4(output.quantity_pieces), unit='piece', value_afn=string4(output.total_cost_afn),
                    source_id=run.pk, source_number=run.packing_number, date_basis='created_at_fallback',
                    issues=['packing_effective_date_not_recorded']))
        elif run.finished_stock_id:
            events.append(dict(event_model='packingrun', event_id=run.pk, effective_at=date.isoformat(),
                movement='packing_to_finished_stock', location='finished_stock', direction='in', item_type='stock',
                item_id=run.finished_stock_id, item_name=run.product.name if run.product_id else str(run.finished_stock),
                quantity=string4(run.bottle_count), unit='piece', value_afn=string4(run.total_cost_afn), source_id=run.pk,
                source_number=run.packing_number, date_basis='created_at_fallback',
                issues=['packing_effective_date_not_recorded']))

    # Component snapshots record raw packaging consumption. Kg-based material
    # consumes both pieces and weight; allocations retain the deducted weight.
    for component in PackingRunComponent.objects.filter(
        packing_run__deleted_at__isnull=True,
    ).select_related('packing_run', 'raw_material_stock__raw_material', 'stock__product'):
        date = component.packing_run.created_at
        if not _within(date, scope):
            continue
        issues = ['packing_effective_date_not_recorded']
        if component.raw_material_stock_id:
            material = component.raw_material_stock.raw_material
            location, kind, item_id, name = 'raw_material', 'raw_material', material.pk, material.name
            if material.unit == 'kg':
                allocations = component.inventory_allocations or []
                quantity = sum((Decimal(str(row.get('quantity') or 0)) for row in allocations), ZERO)
                if quantity > ZERO:
                    unit = 'kg'
                else:
                    # Old components have only a piece count. Do not invent a
                    # kilogram quantity or combine it with purchase kg totals.
                    quantity, unit = component.quantity_pieces, 'piece'
                    issues.append('historical_component_weight_unknown')
            else:
                quantity, unit = component.quantity_pieces, material.unit
        elif component.stock_id:
            location, kind, item_id, name, unit = ('finished_stock', 'stock', component.stock_id,
                                                  component.stock.product.name, 'piece')
            quantity = component.quantity_pieces
        else:
            continue
        events.append(dict(event_model='packingruncomponent', event_id=component.pk,
            effective_at=date.isoformat(), movement='packing_component_consumption',
            location=location, direction='out', item_type=kind, item_id=item_id, item_name=name,
            quantity=string4(quantity), unit=unit, value_afn=string4(component.total_cost_afn),
            source_id=component.packing_run_id, source_number=component.packing_run.packing_number,
            date_basis='created_at_fallback', issues=issues))

    # 5. Sales remove the physical unit in which each pool is held.  The sale
    # price never becomes inventory value; missing historical cost stays unknown.
    sales = SalesItems.objects.filter(sales__deleted_at__isnull=True).exclude(sales__status__in=['draft', 'cancelled']).select_related(
        'sales', 'stock__product', 'storage_tank', 'raw_material_stock__raw_material')
    for item in sales:
        date = item.sales.sale_date
        if not _within(date, scope):
            continue
        if item.sale_source == SalesItems.SOURCE_RAW_MATERIAL and item.raw_material_stock_id:
            material = item.raw_material_stock.raw_material
            location, kind, pk, name, unit = 'raw_material', 'raw_material', material.pk, material.name, material.unit
            quantity = raw_stock_quantity(item)
        elif item.sale_source == SalesItems.SOURCE_TANK and item.storage_tank_id:
            location, kind, pk, name, unit = 'storage_tank', 'storage_tank', item.storage_tank_id, item.storage_tank.name, 'liter'
            quantity = item.liter_amount
        elif item.sale_source == SalesItems.SOURCE_STOCK and item.stock_id:
            location, kind, pk, name, unit = 'finished_stock', 'stock', item.stock_id, item.stock.product.name, 'piece'
            quantity = sales_item_pieces(item)
        else:
            continue
        known = item.cost_is_known or item.unit_cost > ZERO
        value = (Decimal(item.quantity) if item.sale_source == SalesItems.SOURCE_TANK and item.unit == 'kg'
                 else Decimal(quantity)) * item.unit_cost if known else None
        events.append(dict(event_model='salesitems', event_id=item.pk, effective_at=date.isoformat(),
            movement='sale_inventory_out', location=location, direction='out', item_type=kind,
            item_id=pk, item_name=name, quantity=string4(quantity), unit=unit,
            value_afn=string4(value) if value is not None else None, source_id=item.sales_id,
            source_number=item.sales.invoice_number, date_basis='sale_date',
            issues=[] if known else ['historical_sale_cost_unknown']))

    # 6. Returns restore the same physical pool.  A damaged-material audit
    # row linked to damage/leak is informational and is never another receipt.
    returned_items = ReturnItems.objects.filter(
        return_order__deleted_at__isnull=True, return_order__sales__deleted_at__isnull=True,
        sales_item__deleted_at__isnull=True,
        return_order__sales__status__in=[status for status, _ in Sales.ORDER_STATUS_CHOICES
                                         if status not in ('draft', 'cancelled')],
    ).select_related('return_order', 'sales_item__stock__product', 'sales_item__storage_tank',
                     'sales_item__raw_material_stock__raw_material')
    for returned in returned_items:
        date = returned.return_order.return_date
        if not _within(date, scope):
            continue
        original = returned.sales_item
        known = original.cost_is_known or original.unit_cost > ZERO
        if original.sale_source == SalesItems.SOURCE_RAW_MATERIAL and original.raw_material_stock_id:
            material = original.raw_material_stock.raw_material
            location, kind, pk, name, unit = 'raw_material', 'raw_material', material.pk, material.name, material.unit
            selected = returned.quantity_kg if original.unit == 'kg' else returned.liter_amount
            quantity = raw_stock_quantity(original) * Decimal(selected) / original.quantity if original.quantity else ZERO
            value = quantity * original.unit_cost if known else None
        elif original.sale_source == SalesItems.SOURCE_TANK and original.storage_tank_id:
            location, kind, pk, name, unit = 'storage_tank', 'storage_tank', original.storage_tank_id, original.storage_tank.name, 'liter'
            quantity = returned.liter_amount
            value = (returned.quantity_kg if original.unit == 'kg' else quantity) * original.unit_cost if known else None
        elif original.sale_source == SalesItems.SOURCE_STOCK and original.stock_id:
            location, kind, pk, name, unit = 'finished_stock', 'stock', original.stock_id, original.stock.product.name, 'piece'
            quantity = returned.liter_amount
            value = (sum((Decimal(str(row.get('quantity') or 0)) * Decimal(str(row.get('unit_cost_afn') or 0))
                          for row in returned.batch_returns), ZERO) if returned.batch_returns else
                     Decimal(quantity) * original.unit_cost if known else None)
        else:
            continue
        events.append(dict(event_model='returnitems', event_id=returned.pk, effective_at=date.isoformat(),
            movement='sale_inventory_return', location=location, direction='in', item_type=kind,
            item_id=pk, item_name=name, quantity=string4(quantity), unit=unit,
            value_afn=string4(value) if value is not None else None, source_id=returned.return_order_id,
            source_number=returned.return_order.return_number, date_basis='return_date',
            issues=[] if value is not None else ['historical_return_cost_unknown']))

    # 7. Bottle damage and tank leaks are distinct physical events.  Linked
    # DamagedMaterialRecord rows describe the same loss and are not counted.
    for damage in StockBottleDamage.objects.select_related('stock__product', 'storage_tank'):
        date = damage.recorded_at
        if not _within(date, scope):
            continue
        sources = damage.bottle_sources or []
        bottle_value = sum((Decimal(str(src.get('bottle_count') or 0)) * Decimal(str(src.get('unit_cost_afn') or 0))
                            for src in sources), ZERO)
        covered_bottles = sum((Decimal(str(src.get('bottle_count') or 0)) for src in sources), ZERO)
        cost_known = (bottle_value > ZERO and covered_bottles == damage.bottle_count
                      and all(Decimal(str(src.get('unit_cost_afn') or 0)) > ZERO for src in sources))
        issues = [] if cost_known else ['historical_bottle_cost_unknown']
        events.append(dict(event_model='stockbottledamage', event_id=damage.pk, effective_at=date.isoformat(),
            movement='bottle_damage', location='finished_stock', direction='out', item_type='stock',
            item_id=damage.stock_id, item_name=damage.stock.product.name, quantity=string4(damage.bottle_count),
            unit='piece', value_afn=string4(bottle_value) if cost_known else None,
            source_id=damage.pk, source_number=f'BOTTLE-DMG-{damage.pk}', date_basis='recorded_at', issues=issues))
        if damage.storage_tank_id and damage.remaining_liquid_liters > ZERO:
            events.append(dict(event_model='stockbottledamage', event_id=damage.pk, effective_at=date.isoformat(),
                movement='liquid_salvage_to_tank', location='storage_tank', direction='in', item_type='storage_tank',
                item_id=damage.storage_tank_id, item_name=damage.storage_tank.name,
                quantity=string4(damage.remaining_liquid_liters), unit='liter',
                value_afn=string4(damage.returned_liquid_cost_afn), source_id=damage.pk,
                source_number=f'BOTTLE-DMG-{damage.pk}', date_basis='recorded_at', issues=[]))
    for leak in StorageTankLeak.objects.select_related('storage_tank'):
        date = leak.recorded_at
        if _within(date, scope):
            events.append(dict(event_model='storagetankleak', event_id=leak.pk, effective_at=date.isoformat(),
                movement='tank_leak', location='storage_tank', direction='out', item_type='storage_tank',
                item_id=leak.storage_tank_id, item_name=leak.storage_tank.name,
                quantity=string4(leak.quantity_liters), unit='liter', value_afn=string4(leak.total_cost_afn),
                source_id=leak.pk, source_number=f'TANK-LEAK-{leak.pk}', date_basis='recorded_at', issues=[]))

    # 8. A documented stock transfer is one movement with two equal legs.
    # Missing endpoints cannot be placed reliably; same-row transfers are
    # visible but do not imply distinct physical warehouses.
    for transfer in StockTransfer.objects.select_related(
        'source_stock__product', 'target_stock__product',
    ):
        date = transfer.transfer_date
        if not _within(date, scope):
            continue
        if not transfer.source_stock_id or not transfer.target_stock_id or transfer.piece_amount <= ZERO:
            continue
        issues = []
        if transfer.source_stock_id == transfer.target_stock_id:
            issues.append('transfer_locations_not_distinct')
        if (transfer.source_stock.product_id != transfer.product_id
                or transfer.target_stock.product_id != transfer.target_product_id):
            issues.append('transfer_product_mismatch')
        value_known = transfer.currency == 1 and transfer.total_value > ZERO
        if not value_known:
            issues.append('historical_transfer_cost_unknown')
        for direction, stock, movement in (
            ('out', transfer.source_stock, 'stock_transfer_out'),
            ('in', transfer.target_stock, 'stock_transfer_in'),
        ):
            events.append(dict(event_model='stocktransfer', event_id=transfer.pk,
                effective_at=date.isoformat(), movement=movement,
                location='finished_stock', direction=direction, item_type='stock',
                item_id=stock.pk, item_name=stock.product.name,
                quantity=string4(transfer.piece_amount), unit='piece',
                value_afn=string4(transfer.total_value) if value_known else None,
                source_id=transfer.pk, source_number=transfer.transfer_number,
                date_basis='transfer_date', issues=issues))

    # Batch adjustments are the canonical write-off/manual-count documents.
    # A transfer adjustment is excluded: the corresponding transfer requires
    # two location legs and must not be mistaken for a write-off.
    stock_by_product_condition = {(row.product_id, row.condition): row for row in Stock.objects.select_related('product')}
    for adjustment in StockAdjustment.objects.exclude(
        adjustment_type=StockAdjustment.ADJUSTMENT_TYPE_TRANSFER,
    ).select_related('inventory_batch__product'):
        date = adjustment.adjustment_date
        if not _within(date, scope):
            continue
        batch = adjustment.inventory_batch
        stock = stock_by_product_condition.get((batch.product_id, batch.condition))
        change = Decimal(adjustment.quantity_after) - Decimal(adjustment.quantity_before)
        if change == ZERO:
            continue
        issues = [] if stock else ['stock_summary_missing']
        if batch.currency != 1:
            issues.append('historical_adjustment_fx_value_unknown')
        if adjustment.unit_cost is None:
            issues.append('historical_adjustment_cost_unknown')
        events.append(dict(event_model='stockadjustment', event_id=adjustment.pk,
            effective_at=date.isoformat(), movement='stock_adjustment', location='finished_stock',
            direction='in' if change > ZERO else 'out',
            item_type='stock' if stock else 'inventory_batch', item_id=stock.pk if stock else batch.pk,
            item_name=stock.product.name if stock else batch.product.name,
            quantity=string4(abs(change)), unit='piece',
            value_afn=string4(abs(change) * adjustment.unit_cost)
            if adjustment.unit_cost is not None and batch.currency == 1 else None,
            source_id=adjustment.pk, source_number=adjustment.reference_number or batch.batch_number,
            date_basis='adjustment_date', issues=issues))

    events.sort(key=lambda row: (row['effective_at'], row['event_model'], row['event_id']))
    summaries = defaultdict(lambda: {'in': ZERO, 'out': ZERO, 'value_in': ZERO, 'value_out': ZERO,
                                    'unknown_value_in_count': 0, 'unknown_value_out_count': 0,
                                    'count': 0})
    for event in events:
        key = (event['location'], event['item_type'], event['item_id'], event['item_name'], event['unit'])
        summary = summaries[key]
        direction = event['direction']
        summary['in' if direction == 'in' else 'out'] += Decimal(event['quantity'])
        if event['value_afn'] is None:
            summary['unknown_value_in_count' if direction == 'in' else 'unknown_value_out_count'] += 1
        else:
            summary['value_in' if direction == 'in' else 'value_out'] += Decimal(event['value_afn'])
        summary['count'] += 1
    return dict(meta={**scope.metadata(), 'report': 'inventory_movement_review', 'source': 'operational_inventory_events',
                      'amount_scale': 4}, status='recorded_inventory_events_unverified',
                summaries=[dict(location=key[0], item_type=key[1], item_id=key[2], item_name=key[3], unit=key[4],
                                quantity_in=string4(value['in']), quantity_out=string4(value['out']),
                                value_in_afn=string4(value['value_in']) if not value['unknown_value_in_count'] else None,
                                value_out_afn=string4(value['value_out']) if not value['unknown_value_out_count'] else None,
                                unknown_value_count=value['unknown_value_in_count'] + value['unknown_value_out_count'],
                                unknown_value_in_count=value['unknown_value_in_count'],
                                unknown_value_out_count=value['unknown_value_out_count'],
                                event_count=value['count']) for key, value in summaries.items()],
                events=events,
                limitations=['Recorded purchases, production, tank transfers, packing, component consumption, sales, returns, bottle damage, tank leaks, documented stock transfers and batch adjustments are included.',
                             'Condition moves without StockTransfer documents, transfer adjustments without destinations, unrecorded direct changes and complete historical opening balances are not included.',
                             'Legacy kg packaging components without weight allocations appear separately in pieces; their deducted kg is unknown.',
                             'If any movement value is unknown, that item/location/direction value total is null rather than a partial known sum; unknown counts remain visible.',
                             'Transfers and packing runs lack a dedicated effective-date field; created_at fallback is flagged and cannot certify historical cutoffs.'])
