"""Full filled-package costs; separate from nonduplicated inventory allocation."""
from decimal import Decimal, ROUND_HALF_UP

from api.services.cost_currency import usd_amount

SIX = Decimal('0.000001')
ZERO = Decimal('0')


def full_unit_costs(total_cost, bottle_count, carton_count=0, plastic_count=0, *, section='combined', rate=None):
    total = Decimal(str(total_cost or 0))
    result = {'section': section, 'total_cost_afn': str(total)}
    for kind, count in [('bottle', bottle_count), ('carton', carton_count), ('plastic', plastic_count)]:
        count = Decimal(str(count or 0))
        cost = (total / count).quantize(SIX, rounding=ROUND_HALF_UP) if count > 0 else None
        result[kind + '_count'] = str(count)
        result['cost_per_' + kind + '_afn'] = str(cost) if cost is not None else None
        result['cost_per_' + kind + '_usd'] = usd_amount(cost, rate)
    return result


def packing_full_cost_sections(run):
    components = list(run.components.all())
    returned_cartons = [c for c in components if c.component_type == 'returned_carton']
    returned_carton_cost = sum((c.total_cost_afn for c in returned_cartons), ZERO)
    cartons = sum((c.quantity_pieces for c in components if c.component_type == 'carton'), ZERO)
    plastics = sum((c.quantity_pieces for c in components if c.component_type == 'plastic'), ZERO)
    if run.storage_tank_id and (returned_cartons or any(o.component_type == 'returned_bottle' for o in run.outputs.all())):
        return [
            full_unit_costs(run.total_cost_afn - run.returned_cost_afn - returned_carton_cost,
                run.bottle_count - run.returned_bottle_count, cartons, plastics, section='new', rate=run.usd_to_afn_rate),
            full_unit_costs(run.returned_cost_afn + returned_carton_cost, run.returned_bottle_count,
                sum((c.quantity_pieces for c in returned_cartons), ZERO), section='returned', rate=run.usd_to_afn_rate),
        ]
    return [full_unit_costs(run.total_cost_afn, run.bottle_count,
        cartons + sum((c.quantity_pieces for c in returned_cartons), ZERO), plastics,
        section='returned' if not run.storage_tank_id else 'combined', rate=run.usd_to_afn_rate)]
