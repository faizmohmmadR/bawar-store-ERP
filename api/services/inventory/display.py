"""Packaging-equivalent stock display helpers."""
from __future__ import annotations

from decimal import Decimal

from api.services.uom.conversion import d, quantize


def packaging_breakdown(base_quantity, packagings):
    """
    Break a base quantity into largest packagings first.

    packagings: iterable of ProductPackaging ordered by qty_in_base DESC.
    Returns list of {packaging_id, name, qty_in_base, count}.
    """
    remaining = d(base_quantity)
    rows = []
    ordered = sorted(
        [p for p in packagings if d(p.qty_in_base) > 0 and p.for_stock and p.is_active],
        key=lambda p: d(p.qty_in_base),
        reverse=True,
    )
    for pkg in ordered:
        factor = d(pkg.qty_in_base)
        if factor <= 0:
            continue
        count = int(remaining // factor)
        if count:
            rows.append({
                'packaging_id': pkg.id,
                'name': pkg.name,
                'qty_in_base': factor,
                'count': count,
            })
            remaining = remaining - (Decimal(count) * factor)
    remaining = quantize(remaining)
    if remaining:
        rows.append({
            'packaging_id': None,
            'name': 'remainder',
            'qty_in_base': Decimal('1'),
            'count': remaining,
        })
    return rows
