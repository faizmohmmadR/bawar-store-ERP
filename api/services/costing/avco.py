"""Weighted average (AVCO) costing in product base UOM."""
from __future__ import annotations

from decimal import Decimal

from api.services.uom.conversion import d, quantize


def receive_average(old_qty, old_cost, incoming_qty, incoming_value) -> tuple[Decimal, Decimal]:
    """
    Update moving average after a receipt.

    Returns (new_qty, new_unit_cost).
    incoming_value is total AFN cost of the incoming qty.
    """
    qty = d(old_qty)
    cost = d(old_cost)
    add_qty = d(incoming_qty)
    add_value = d(incoming_value)
    if add_qty <= 0:
        return quantize(qty), quantize(cost)
    new_qty = qty + add_qty
    if new_qty <= 0:
        return Decimal('0'), Decimal('0')
    old_value = qty * cost
    new_cost = (old_value + add_value) / new_qty
    return quantize(new_qty), quantize(new_cost)


def remove_average(old_qty, old_cost, remove_qty, remove_value) -> tuple[Decimal, Decimal]:
    """
    Update moving average after reversing a receipt (supplier return / void).

    Returns (new_qty, new_unit_cost).
    """
    qty = d(old_qty)
    cost = d(old_cost)
    rem_qty = d(remove_qty)
    rem_value = d(remove_value)
    if rem_qty <= 0:
        return quantize(qty), quantize(cost)
    new_qty = qty - rem_qty
    if new_qty <= 0:
        return Decimal('0'), Decimal('0')
    old_value = qty * cost
    new_cost = (old_value - rem_value) / new_qty
    if new_cost < 0:
        new_cost = Decimal('0')
    return quantize(new_qty), quantize(new_cost)


def cogs_for_delivery(base_qty, unit_cost) -> Decimal:
    return quantize(d(base_qty) * d(unit_cost), 6)
