"""Moving weighted-average inventory arithmetic; amounts are always AFN."""
from decimal import Decimal, ROUND_HALF_UP
from rest_framework.exceptions import ValidationError

SIX = Decimal('0.000001')
FOUR = Decimal('0.0001')

def d(value):
    return Decimal(str(value or 0))

def average(quantity, value):
    quantity, value = d(quantity), d(value)
    if quantity < 0 or value < -FOUR:
        raise ValidationError('This correction would make inventory quantity or value negative.')
    if not quantity:
        if abs(value) > FOUR:
            raise ValidationError('This correction leaves inventory value without stock. Reverse dependent movements first.')
        return Decimal('0')
    return (max(Decimal('0'), value) / quantity).quantize(SIX, rounding=ROUND_HALF_UP)

def receive_raw_stock(stock, quantity, value, *, pieces=0, save=True):
    """Receive/return at its saved cost and blend with remaining stock."""
    new_quantity = d(stock.quantity) + d(quantity)
    stock.last_purchase_price = average(new_quantity, d(stock.quantity) * d(stock.last_purchase_price) + d(value))
    if stock.last_purchase_price > 0:
        stock.zero_cost_allowed = False
    elif new_quantity > 0 and not stock.zero_cost_allowed:
        from api.models.data.raw_materials import RawMaterialPurchaseItem
        stock.zero_cost_allowed = RawMaterialPurchaseItem.objects.filter(raw_material_id=stock.raw_material_id,
            purchase__transaction_type='free', purchase__status='received', purchase__deleted_at__isnull=True).exists()
    stock.quantity = new_quantity.quantize(FOUR, rounding=ROUND_HALF_UP)
    stock.piece_count += int(pieces)
    if stock.piece_count < 0:
        raise ValidationError('This correction would make the package count negative.')
    if save:
        stock.save(update_fields=['quantity', 'piece_count', 'last_purchase_price', 'last_purchase_date', 'zero_cost_allowed', 'updated_at'])
    return stock


def raw_stock_unit_cost(stock, *, recover=False, exclude_purchase_id=None):
    """Recover an absent opening cost only when all received stock is still present."""
    cost=d(stock.last_purchase_price)
    if cost > 0 or stock.quantity <= 0 or stock.zero_cost_allowed:
        return cost
    from api.models.data.raw_materials import RawMaterialPurchaseItem
    items=RawMaterialPurchaseItem.objects.filter(raw_material_id=stock.raw_material_id,purchase__status='received',purchase__deleted_at__isnull=True,quantity__gt=0).select_related('purchase')
    if exclude_purchase_id is not None:
        items=items.exclude(purchase_id=exclude_purchase_id)
    items=list(items)
    quantity=sum((i.quantity for i in items),Decimal('0'))
    if quantity != stock.quantity or quantity <= 0:
        return cost
    prices=[d(i.price_per_unit_base) or d(i.price_per_unit)*d(i.purchase.exchange_rate) for i in items]
    if any(price <= 0 for price in prices):
        return cost
    cost=average(quantity,sum((i.quantity*price for i,price in zip(items,prices)),Decimal('0')))
    if recover:
        stock.last_purchase_price=cost
        stock.save(update_fields=['last_purchase_price','updated_at'])
    return cost


def raw_stock_sources(stock, quantity, pieces, unit_cost, *, piece_basis=False):
    """Allocate receipt identities automatically for audit, never receipt prices."""
    from api.services.packing import _raw_material_purchase_usage, _raw_material_purchase_lines
    usage=_raw_material_purchase_usage()
    remaining=d(pieces if piece_basis else quantity)
    remaining_pieces=int(pieces)
    sources=[]
    for item in _raw_material_purchase_lines(stock.raw_material, lock=True):
        used=usage.get(item.pk,{})
        available=max(Decimal('0'),d(item.piece_count)-d(used.get('piece_count')) if piece_basis else d(item.quantity)-d(used.get('quantity')))
        take=min(remaining,available)
        if take <= 0:continue
        assigned_pieces=int(take) if piece_basis else min(remaining_pieces,max(0,item.piece_count-int(used.get('piece_count',0))))
        weight=(d(quantity)*take/d(pieces)).quantize(FOUR,rounding=ROUND_HALF_UP) if piece_basis else take
        cost=(take*d(unit_cost)).quantize(FOUR,rounding=ROUND_HALF_UP)
        sources.append({'source':'stock','costing_method':'moving_weighted_average','purchase_item':item.pk,
            'purchase_invoice_number':item.purchase.invoice_number,'invoice_number':item.purchase.invoice_number,
            'supplier_bill_number':item.purchase.bill_number or '', 'purchase_date':item.purchase.purchase_date.isoformat(),
            'quantity':str(weight),'piece_count':assigned_pieces,'unit_cost_afn':str(unit_cost),
            'receipt_unit_cost_afn':str(item.price_per_unit_base),'total_cost_afn':str(cost)})
        remaining-=take; remaining_pieces-=assigned_pieces
        if remaining <= 0:break
    if remaining > 0 or remaining_pieces > 0:
        weight=d(quantity)-sum((d(row['quantity']) for row in sources),Decimal('0')) if piece_basis else remaining
        sources.append({'source':'stock','costing_method':'moving_weighted_average','quantity':str(weight),
            'piece_count':remaining_pieces,'unit_cost_afn':str(unit_cost),'total_cost_afn':str((remaining*d(unit_cost)).quantize(FOUR,rounding=ROUND_HALF_UP))})
    if sources:
        # Reconcile final-row rounding with the authoritative stock movement.
        sources[-1]['quantity']=str(d(quantity)-sum((d(row['quantity']) for row in sources[:-1]),Decimal('0')))
        total=(d(pieces if piece_basis else quantity)*d(unit_cost)).quantize(FOUR,rounding=ROUND_HALF_UP)
        sources[-1]['total_cost_afn']=str(total-sum((d(row['total_cost_afn']) for row in sources[:-1]),Decimal('0')))
    return sources
