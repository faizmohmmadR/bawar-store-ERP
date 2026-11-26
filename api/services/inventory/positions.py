"""Warehouse stock positions: one logical row per product × warehouse."""
from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from api.services.inventory.display import packaging_breakdown
from api.services.uom.conversion import d, quantize


def aggregate_balance_positions(queryset):
    """
    Collapse lot-level InventoryBalance rows into product×warehouse positions.

    Returns a list of dicts ready for API serialization (sorted by product name).
    """
    balances = list(
        queryset.select_related('product', 'product__base_uom', 'warehouse')
        .prefetch_related('product__packagings')
    )
    if not balances:
        return []

    grouped = defaultdict(list)
    for balance in balances:
        grouped[(balance.product_id, balance.warehouse_id)].append(balance)

    positions = []
    for (product_id, warehouse_id), rows in grouped.items():
        product = rows[0].product
        warehouse = rows[0].warehouse
        on_hand = sum((d(r.quantity_on_hand) for r in rows), Decimal('0'))
        reserved = sum((d(r.quantity_reserved) for r in rows), Decimal('0'))
        value_sum = sum(
            (d(r.quantity_on_hand) * d(r.average_cost) for r in rows),
            Decimal('0'),
        )
        avg_cost = quantize(value_sum / on_hand) if on_hand > 0 else Decimal('0')
        packs = [
            p for p in product.packagings.all()
            if getattr(p, 'deleted_at', None) is None
        ]
        positions.append({
            'id': max(r.id for r in rows),
            'product': product_id,
            'warehouse': warehouse_id,
            'lot': None,
            'lot_count': len(rows),
            'quantity_on_hand': on_hand,
            'quantity_reserved': reserved,
            'quantity_available': on_hand - reserved,
            'average_cost': avg_cost,
            'product_obj': product,
            'warehouse_obj': warehouse,
            'packaging_breakdown': packaging_breakdown(on_hand, packs),
        })

    positions.sort(key=lambda p: (p['product_obj'].name or '').lower())
    return positions


def serialize_position(position, request=None):
    from api.serializers.data.products import serialize_product

    return {
        'id': position['id'],
        'product': position['product'],
        'warehouse': position['warehouse'],
        'lot': None,
        'lot_count': position['lot_count'],
        'quantity_on_hand': str(position['quantity_on_hand']),
        'quantity_reserved': str(position['quantity_reserved']),
        'quantity_available': str(position['quantity_available']),
        'average_cost': str(position['average_cost']),
        'warehouse_name': position['warehouse_obj'].name,
        'product_details': serialize_product(position['product_obj'], request),
        'packaging_breakdown': [
            {
                'packaging_id': row['packaging_id'],
                'name': row['name'],
                'qty_in_base': str(row['qty_in_base']),
                'count': str(row['count']),
            }
            for row in position['packaging_breakdown']
        ],
    }
