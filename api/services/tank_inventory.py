"""Storage-tank liquid ledger helpers.

Tank balance (liters) =
  production transfers (moved_to_storage)
  + liquid returned from damaged bottles
  − packing runs
  − tank-fill sales (confirmed / non-draft)
  − recorded tank leaks

Cost uses the same weighted AFN liquid value as packing.
"""
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Case, DecimalField, ExpressionWrapper, F, Sum, When
from rest_framework.exceptions import ValidationError

from api.models.data.packing import PackingRun
from api.models.data.raw_material_process import RawMaterialProcess
from api.models.data.sales import Sales, SalesItems
from api.models.data.stock_bottle_damage import StockBottleDamage
from api.models.data.storage_tank import ProductionStorageTransfer, StorageTank
from api.models.data.storage_tank_leak import StorageTankLeak

FOUR = Decimal('0.0001')
SIX = Decimal('0.000001')
ZERO = Decimal('0')

# Sale statuses that consume tank liquid (mirror stock-affecting sales).
TANK_SALE_ACTIVE_STATUSES = tuple(
    status for status, _ in Sales.ORDER_STATUS_CHOICES
    if status not in ('draft', 'cancelled')
)


def _d(value):
    return Decimal(str(value or 0))


def _q(value, places=FOUR):
    return _d(value).quantize(places, rounding=ROUND_HALF_UP)


def tank_fill_sales_q(*, storage_tank_id=None, exclude_sale_item_id=None):
    """Queryset of sale lines that currently consume tank liters."""
    qs = SalesItems.objects.filter(
        sale_source=SalesItems.SOURCE_TANK,
        deleted_at__isnull=True,
        sales__deleted_at__isnull=True,
        sales__status__in=TANK_SALE_ACTIVE_STATUSES,
    )
    if storage_tank_id is not None:
        qs = qs.filter(storage_tank_id=storage_tank_id)
    if exclude_sale_item_id is not None:
        qs = qs.exclude(pk=exclude_sale_item_id)
    return qs


def tank_sold_totals(*, storage_tank_id, exclude_sale_item_id=None, lock=False):
    """
    Net tank liters consumed by sales after returns.

    sold_liters = sum(sale qty) − sum(return qty on those sale lines)
    """
    from api.models.data.returns import ReturnItems

    qs = tank_fill_sales_q(
        storage_tank_id=storage_tank_id,
        exclude_sale_item_id=exclude_sale_item_id,
    )
    if lock:
        qs = qs.select_for_update()
    totals = qs.aggregate(
        liters=Sum('liter_amount'),
        kilograms=Sum('kilogram_amount'),
        liquid_value=Sum(ExpressionWrapper(
            Case(
                When(unit='kg', then=F('quantity') * F('unit_cost')),
                default=F('liter_amount') * F('unit_cost'),
                output_field=DecimalField(max_digits=24, decimal_places=8),
            ),
            output_field=DecimalField(max_digits=24, decimal_places=8),
        )),
    )
    sold_liters = _q(totals['liters'])
    sold_kilograms = _q(totals['kilograms'])
    sold_value = _q(totals['liquid_value'])

    return_qs = ReturnItems.objects.filter(
        sales_item__sale_source=SalesItems.SOURCE_TANK,
        sales_item__storage_tank_id=storage_tank_id,
        sales_item__deleted_at__isnull=True,
        sales_item__sales__deleted_at__isnull=True,
        sales_item__sales__status__in=TANK_SALE_ACTIVE_STATUSES,
        deleted_at__isnull=True,
        return_order__deleted_at__isnull=True,
    )
    if exclude_sale_item_id is not None:
        return_qs = return_qs.exclude(sales_item_id=exclude_sale_item_id)
    returned = return_qs.aggregate(
        liters=Sum('liter_amount'),
        kilograms=Sum('quantity_kg'),
        liquid_value=Sum(ExpressionWrapper(
            Case(
                When(
                    sales_item__unit='kg',
                    then=F('quantity_kg') * F('sales_item__unit_cost'),
                ),
                default=F('liter_amount') * F('sales_item__unit_cost'),
                output_field=DecimalField(max_digits=24, decimal_places=8),
            ),
            output_field=DecimalField(max_digits=24, decimal_places=8),
        )),
    )
    returned_liters = _q(returned['liters'])
    returned_kilograms = _q(returned['kilograms'])
    returned_value = _q(returned['liquid_value'])
    return (
        max(ZERO, sold_liters - returned_liters),
        max(ZERO, sold_value - returned_value),
        max(ZERO, sold_kilograms - returned_kilograms),
    )


def get_tank_liquid_totals(
    storage_tank,
    *,
    lock=False,
    exclude_packing_run_id=None,
    exclude_sale_item_id=None,
    exclude_leak_id=None,
):
    """Return (liters_remaining, liquid_cost_remaining, unit_cost_per_liter)."""
    tank_id = storage_tank.pk if isinstance(storage_tank, StorageTank) else storage_tank

    transfers = ProductionStorageTransfer.objects.filter(
        storage_tank_id=tank_id,
        deleted_at__isnull=True,
        production__deleted_at__isnull=True,
        production__status=RawMaterialProcess.STATUS_MOVED_TO_STORAGE,
    )
    if lock:
        transfers = transfers.select_for_update()
    incoming = transfers.aggregate(
        liters=Sum('quantity_liters'),
        cost=Sum(ExpressionWrapper(
            F('quantity_liters') * F('production__cost_per_liter_afn'),
            output_field=DecimalField(max_digits=24, decimal_places=8),
        )),
    )

    packed_runs = PackingRun.objects.filter(
        storage_tank_id=tank_id,
        deleted_at__isnull=True,
    )
    if exclude_packing_run_id is not None:
        packed_runs = packed_runs.exclude(pk=exclude_packing_run_id)
    if lock:
        packed_runs = packed_runs.select_for_update()
    packed = packed_runs.aggregate(
        liters=Sum('quantity_liters'),
        cost=Sum('liquid_cost_afn'),
    )

    sold_liters, sold_cost, _ = tank_sold_totals(
        storage_tank_id=tank_id,
        exclude_sale_item_id=exclude_sale_item_id,
        lock=lock,
    )

    returned_qs = StockBottleDamage.objects.filter(
        storage_tank_id=tank_id,
        deleted_at__isnull=True,
        remaining_liquid_liters__gt=0,
    )
    if lock:
        returned_qs = returned_qs.select_for_update()
    returned = returned_qs.aggregate(
        liters=Sum('remaining_liquid_liters'),
        cost=Sum('returned_liquid_cost_afn'),
        kilograms=Sum('remaining_liquid_kg'),
    )

    leak_qs = StorageTankLeak.objects.filter(
        storage_tank_id=tank_id,
        deleted_at__isnull=True,
    )
    if exclude_leak_id is not None:
        leak_qs = leak_qs.exclude(pk=exclude_leak_id)
    if lock:
        leak_qs = leak_qs.select_for_update()
    leaked = leak_qs.aggregate(
        liters=Sum('quantity_liters'),
        cost=Sum('total_cost_afn'),
    )

    liters_remaining = _q(
        _d(incoming['liters'])
        + _d(returned['liters'])
        - _d(packed['liters'])
        - sold_liters
        - _d(leaked['liters'])
    )
    liquid_cost_remaining = _q(
        _d(incoming['cost'])
        + _d(returned['cost'])
        - _d(packed['cost'])
        - sold_cost
        - _d(leaked['cost'])
    )
    if liters_remaining < 0 or liquid_cost_remaining < 0:
        raise ValidationError({
            'storage_tank': 'Stored liquid balances are inconsistent. Review tank movements.'
        })
    unit_cost = (
        _q(liquid_cost_remaining / liters_remaining, SIX)
        if liters_remaining > 0
        else ZERO
    )
    return liters_remaining, liquid_cost_remaining, unit_cost


def validate_tank_fill_quantity(storage_tank, quantity_liters, *, exclude_sale_item_id=None):
    liters = _q(quantity_liters)
    if liters <= 0:
        raise ValidationError({'quantity': 'Liters to sell must be greater than zero.'})
    available, _, unit_cost = get_tank_liquid_totals(
        storage_tank,
        lock=True,
        exclude_sale_item_id=exclude_sale_item_id,
    )
    if liters > available:
        name = getattr(storage_tank, 'name', 'Tank')
        raise ValidationError({
            'quantity': f'{name} contains only {_q(available)} liters available to fill.'
        })
    return liters, unit_cost


def get_tank_density(
    storage_tank,
    *,
    exclude_sale_item_id=None,
    exclude_packing_run_id=None,
):
    """Return current kg/L from the tank's active inventory ledger."""
    from api.models.data.returns import ReturnItems

    tank_id = storage_tank.pk if isinstance(storage_tank, StorageTank) else storage_tank
    incoming = ProductionStorageTransfer.objects.filter(
        storage_tank_id=tank_id,
        deleted_at__isnull=True,
        production__deleted_at__isnull=True,
        production__status=RawMaterialProcess.STATUS_MOVED_TO_STORAGE,
    ).aggregate(
        liters=Sum('quantity_liters'),
        kilograms=Sum('quantity_kg'),
    )
    packed = PackingRun.objects.filter(
        storage_tank_id=tank_id,
        deleted_at__isnull=True,
    )
    if exclude_packing_run_id is not None:
        packed = packed.exclude(pk=exclude_packing_run_id)
    packed_totals = packed.aggregate(
        liters=Sum('quantity_liters'),
        kilograms=Sum('quantity_kg'),
    )
    sold = tank_fill_sales_q(
        storage_tank_id=tank_id,
        exclude_sale_item_id=exclude_sale_item_id,
    ).aggregate(
        liters=Sum('liter_amount'),
        kilograms=Sum('kilogram_amount'),
    )
    return_qs = ReturnItems.objects.filter(
        sales_item__sale_source=SalesItems.SOURCE_TANK,
        sales_item__storage_tank_id=tank_id,
        sales_item__deleted_at__isnull=True,
        sales_item__sales__deleted_at__isnull=True,
        sales_item__sales__status__in=TANK_SALE_ACTIVE_STATUSES,
        deleted_at__isnull=True,
        return_order__deleted_at__isnull=True,
    )
    if exclude_sale_item_id is not None:
        return_qs = return_qs.exclude(sales_item_id=exclude_sale_item_id)
    returned = return_qs.aggregate(
        liters=Sum('liter_amount'),
        kilograms=Sum('quantity_kg'),
    )
    bottle_returns = StockBottleDamage.objects.filter(
        storage_tank_id=tank_id,
        deleted_at__isnull=True,
    ).aggregate(
        liters=Sum('remaining_liquid_liters'),
        kilograms=Sum('remaining_liquid_kg'),
    )
    leaked = StorageTankLeak.objects.filter(
        storage_tank_id=tank_id,
        deleted_at__isnull=True,
    ).aggregate(
        liters=Sum('quantity_liters'),
        kilograms=Sum('quantity_kg'),
    )
    liters = _q(
        _d(incoming['liters']) - _d(packed_totals['liters'])
        - _d(sold['liters'])
        + _d(returned['liters'])
        + _d(bottle_returns['liters'])
        - _d(leaked['liters'])
    )
    kilograms = _q(
        _d(incoming['kilograms']) - _d(packed_totals['kilograms'])
        - _d(sold['kilograms'])
        + _d(returned['kilograms'])
        + _d(bottle_returns['kilograms'])
        - _d(leaked['kilograms'])
    )
    if liters > 0 and kilograms > 0:
        return _q(kilograms / liters, SIX)
    tank = storage_tank if isinstance(storage_tank, StorageTank) else StorageTank.objects.select_related('product').get(pk=tank_id)
    if tank.product_id and _d(tank.product.density_kg_per_liter) > 0:
        return _d(tank.product.density_kg_per_liter)
    tank_density = _d(getattr(tank, 'density_kg_per_liter', 0) or 0)
    if tank_density > 0:
        return tank_density
    return Decimal('1')


def tank_product_label(storage_tank):
    """Human-readable product label for a tank-fill sale line."""
    names = list(ProductionStorageTransfer.objects.filter(
        storage_tank=storage_tank,
        deleted_at__isnull=True,
        production__deleted_at__isnull=True,
        production__status=RawMaterialProcess.STATUS_MOVED_TO_STORAGE,
    ).values_list('production__product_name', flat=True).distinct())
    cleaned = sorted({(name or '').strip() for name in names if name and str(name).strip()})
    if len(cleaned) == 1:
        return f'{cleaned[0]} (bulk fill)'
    if cleaned:
        return f'{storage_tank.name} (bulk fill)'
    return f'{storage_tank.name} (bulk fill)'


def get_tank_mass_quantity(storage_tank, *, exclude_packing_run_id=None, exclude_leak_id=None):
    """Mass balance directly from kg movements, without rounded density conversion."""
    tank_id = storage_tank.pk
    incoming = ProductionStorageTransfer.objects.filter(
        storage_tank_id=tank_id, deleted_at__isnull=True,
        production__deleted_at__isnull=True,
        production__status=RawMaterialProcess.STATUS_MOVED_TO_STORAGE,
    ).aggregate(total=Sum(Case(
        When(quantity_kg__gt=0, then=F('quantity_kg')),
        default=ExpressionWrapper(F('quantity_liters') * F('production__density_kg_per_liter'), output_field=DecimalField(max_digits=24, decimal_places=8)),
        output_field=DecimalField(max_digits=24, decimal_places=8),
    )))['total']
    packed_qs = PackingRun.objects.filter(storage_tank_id=tank_id, deleted_at__isnull=True)
    if exclude_packing_run_id is not None:
        packed_qs = packed_qs.exclude(pk=exclude_packing_run_id)
    packed = packed_qs.aggregate(total=Sum('quantity_kg'))['total']
    _, _, sold = tank_sold_totals(storage_tank_id=tank_id)
    bottle_kg = StockBottleDamage.objects.filter(
        storage_tank_id=tank_id,
        deleted_at__isnull=True,
    ).aggregate(total=Sum('remaining_liquid_kg'))['total']
    leak_qs = StorageTankLeak.objects.filter(
        storage_tank_id=tank_id,
        deleted_at__isnull=True,
    )
    if exclude_leak_id is not None:
        leak_qs = leak_qs.exclude(pk=exclude_leak_id)
    leaked_kg = leak_qs.aggregate(total=Sum('quantity_kg'))['total']
    return _q(_d(incoming) + _d(bottle_kg) - _d(packed) - sold - _d(leaked_kg))
