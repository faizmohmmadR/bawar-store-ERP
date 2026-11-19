"""Source-level value checks for production transfers and packing runs."""
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from rest_framework.exceptions import ValidationError

from api.models.data.packing import PackingRun
from api.models.data.raw_material_process import RawMaterialProcess
from .contracts import ReportScope
from .inventory_movement_review import inventory_movement_review
from .invoices import string4

ZERO = Decimal('0')
CENT = Decimal('0.01')


def _difference(left, right):
    return string4(left - right) if left is not None and right is not None else None


def _mismatch(left, right):
    return (left - right).copy_abs().quantize(CENT, rounding=ROUND_HALF_UP) != ZERO


def _event_refs(events):
    return [{'event_model': model, 'event_id': pk}
            for model, pk in sorted({(event['event_model'], event['event_id']) for event in events})]


def inventory_transformation_bridge(scope):
    if scope.start_date is not None or scope.currency is not None or scope.account_id is not None:
        raise ValidationError({'filters': 'AFN transformation comparison supports only end_date.'})
    events = inventory_movement_review(ReportScope(end_date=scope.end_date))['events']
    by_source = defaultdict(lambda: defaultdict(list))
    for event in events:
        if event['movement'] in {'production_input', 'production_to_tank', 'tank_to_packing',
                                 'packing_component_consumption', 'packing_to_finished_stock'}:
            model = 'rawmaterialprocess' if event['movement'].startswith('production_') else 'packingrun'
            by_source[(model, event['source_id'])][event['movement']].append(event)

    rows = []
    processes = RawMaterialProcess.objects.all()
    if scope.end_date is not None:
        processes = processes.filter(process_date__lte=scope.end_date)
    for process in processes:
        movements = by_source[('rawmaterialprocess', process.pk)]
        inputs = movements['production_input']
        transfers = movements['production_to_tank']
        input_value = sum((Decimal(event['value_afn']) for event in inputs), ZERO)
        transfer_value = sum((Decimal(event['value_afn']) for event in transfers), ZERO)
        transferred_liters = sum((Decimal(event['quantity']) for event in transfers), ZERO)
        extra = Decimal(process.extra_expense_afn)
        declared_material = Decimal(process.material_cost_afn)
        declared_total = Decimal(process.total_cost_afn)
        output_liters = Decimal(process.output_quantity_liters)
        issues = set()
        if not inputs:
            issues.add('production_inputs_missing')
        if _mismatch(input_value, declared_material):
            issues.add('material_cost_mismatch')
        if _mismatch(declared_material + extra, declared_total):
            issues.add('production_total_mismatch')
        complete_transfer = process.status == RawMaterialProcess.STATUS_MOVED_TO_STORAGE
        if complete_transfer and transferred_liters != output_liters:
            issues.add('transfer_quantity_mismatch_or_cutoff_incomplete')
        if complete_transfer and transferred_liters == output_liters and _mismatch(transfer_value, declared_total):
            issues.add('transfer_value_mismatch')
        if transfers:
            issues.add('transfer_effective_date_not_recorded')
        rows.append({
            'source_model': 'rawmaterialprocess', 'source_id': process.pk,
            'source_number': process.process_number, 'source_status': process.status,
            'input_count': len(inputs), 'output_count': len(transfers),
            'input_value_afn': string4(input_value), 'extra_expense_afn': string4(extra),
            'declared_material_afn': string4(declared_material),
            'declared_total_afn': string4(declared_total),
            'input_header_difference_afn': _difference(input_value, declared_material),
            'cost_build_difference_afn': _difference(declared_material + extra, declared_total),
            'output_value_afn': string4(transfer_value) if complete_transfer and transferred_liters == output_liters else None,
            'output_header_difference_afn': _difference(transfer_value, declared_total)
            if complete_transfer and transferred_liters == output_liters else None,
            'output_quantity': string4(transferred_liters), 'declared_output_quantity': string4(output_liters),
            'output_unit': 'liter', 'event_refs': _event_refs(inputs + transfers),
            'issues': sorted(issues),
        })

    runs = PackingRun.objects.all()
    if scope.end_date is not None:
        runs = runs.filter(created_at__lte=scope.end_date)
    for run in runs:
        movements = by_source[('packingrun', run.pk)]
        tank = movements['tank_to_packing']
        components = movements['packing_component_consumption']
        outputs = movements['packing_to_finished_stock']
        batch_outputs = [event for event in outputs if event['event_model'] == 'packingrunoutput']
        component_value = sum((Decimal(event['value_afn']) for event in components), ZERO)
        output_value = sum((Decimal(event['value_afn']) for event in outputs), ZERO)
        tank_value = sum((Decimal(event['value_afn']) for event in tank), ZERO)
        returned = Decimal(run.returned_cost_afn)
        declared_liquid = Decimal(run.liquid_cost_afn)
        declared_packaging = Decimal(run.packaging_cost_afn)
        declared_total = Decimal(run.total_cost_afn)
        issues = {'packing_effective_date_not_recorded'}
        if not tank:
            issues.add('tank_consumption_missing')
        if not batch_outputs:
            issues.add('packing_output_batch_missing')
        if _mismatch(tank_value, declared_liquid):
            issues.add('liquid_cost_mismatch')
        if _mismatch(component_value, declared_packaging):
            issues.add('packaging_cost_mismatch')
        if _mismatch(declared_liquid + declared_packaging + returned, declared_total):
            issues.add('packing_total_mismatch')
        if batch_outputs and _mismatch(output_value, declared_total):
            issues.add('packing_output_value_mismatch')
        rows.append({
            'source_model': 'packingrun', 'source_id': run.pk,
            'source_number': run.packing_number, 'source_status': 'recorded',
            'input_count': len(tank) + len(components), 'output_count': len(outputs),
            'input_value_afn': string4(tank_value + component_value),
            'extra_expense_afn': string4(returned),
            'declared_material_afn': string4(declared_liquid + declared_packaging),
            'declared_total_afn': string4(declared_total),
            'input_header_difference_afn': _difference(tank_value + component_value,
                                                       declared_liquid + declared_packaging),
            'cost_build_difference_afn': _difference(declared_liquid + declared_packaging + returned, declared_total),
            'output_value_afn': string4(output_value) if batch_outputs else None,
            'output_header_difference_afn': _difference(output_value, declared_total) if batch_outputs else None,
            'output_quantity': string4(sum((Decimal(event['quantity']) for event in outputs), ZERO)),
            'declared_output_quantity': None, 'output_unit': 'piece',
            'event_refs': _event_refs(tank + components + outputs),
            'issues': sorted(issues),
        })
    rows.sort(key=lambda row: (row['source_model'], row['source_id']))
    return {
        'meta': {**scope.metadata(), 'report': 'inventory_transformation_bridge',
                 'source': 'production_packing_inventory_events', 'currency_id': 1},
        'status': 'comparison_only', 'rows': rows,
        'limitations': [
            'Production material cost, capitalized extra expense and tank transfer value are compared by source; no new revenue or expense is inferred.',
            'Packing liquid, packaging components, returned-bottle cost and finished outputs are compared by run.',
            'Packing piece quantities span bottles, cartons and plastics and cannot be compared with bottle_count as one unit.',
            'Production transfer and packing events use created_at because no separate effective date is saved; historical cutoff is unverified.',
            'A process without a complete transfer has null output comparison; a packing run without batch output rows also has null output comparison even if a header fallback movement exists.',
            'This is a source-value check, not a certified stock balance or reconciliation of capitalized extra expense with cash/GL.',
        ],
    }
