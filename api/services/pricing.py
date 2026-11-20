"""Resolve selling/purchase list prices for a packaging."""
from __future__ import annotations

from django.utils import timezone

from api.models.data.product_packaging import ProductPrice
from api.services.uom.conversion import d


def resolve_price(product, packaging, *, price_type=ProductPrice.PRICE_RETAIL, currency=1, on_date=None):
    day = on_date or timezone.localdate()
    qs = ProductPrice.objects.filter(
        product=product,
        packaging=packaging,
        price_type=price_type,
        currency=currency,
        is_active=True,
    ).order_by('-effective_from', '-id')
    for price in qs:
        if price.effective_from and price.effective_from > day:
            continue
        if price.effective_to and price.effective_to < day:
            continue
        return d(price.amount)
    # Fallback: any active retail for packaging
    fallback = ProductPrice.objects.filter(
        product=product,
        packaging=packaging,
        is_active=True,
        currency=currency,
    ).order_by('-id').first()
    return d(fallback.amount) if fallback else None
