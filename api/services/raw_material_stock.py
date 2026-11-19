"""Received-purchase effects on the current moving-average raw stock pool."""
from decimal import Decimal
from django.db import transaction
from api.models.data.raw_materials import RawMaterial, RawMaterialStock
from api.services.weighted_average import d, receive_raw_stock, raw_stock_unit_cost

@transaction.atomic
def reconcile_raw_material_stock(purchase, *, previous_status, previous_items, save_stock):
    previous = {}
    current = {}
    if previous_status == 'received':
        for row in previous_items:
            material_id, quantity, pieces = row[:3]
            # Old callers can omit cost only for unchanged-price quantity corrections.
            if len(row) > 3:
                value = d(row[3])
            else:
                item = purchase.items.filter(raw_material_id=material_id).first()
                value = d(quantity) * d(item.price_per_unit_base if item else 0)
            old = previous.setdefault(material_id, [Decimal('0'), 0, Decimal('0')])
            old[0] += d(quantity); old[1] += int(pieces or 0) if d(quantity) > 0 else 0; old[2] += value
    if purchase.status == 'received':
        for item in purchase.items.all():
            row = current.setdefault(item.raw_material_id, [Decimal('0'), 0, Decimal('0')])
            row[0] += d(item.quantity); row[1] += int(item.piece_count or 0) if item.quantity > 0 else 0
            row[2] += d(item.quantity) * d(item.price_per_unit_base)
    for material_id in sorted(previous.keys() | current.keys()):
        RawMaterial.all_objects.select_for_update().get(pk=material_id)
        stock, _ = RawMaterialStock.objects.select_for_update().get_or_create(raw_material_id=material_id)
        old = previous.get(material_id, [Decimal('0'), 0, Decimal('0')])
        new = current.get(material_id, [Decimal('0'), 0, Decimal('0')])
        if old == new:
            continue
        if stock.quantity > 0 and stock.last_purchase_price <= 0:
            from rest_framework.exceptions import ValidationError
            cost = raw_stock_unit_cost(stock, recover=save_stock, exclude_purchase_id=purchase.pk)
            if cost <= 0 and not stock.zero_cost_allowed:
                raise ValidationError('Record the actual cost of existing stock before receiving another purchase.')
            stock.last_purchase_price=cost
        if purchase.status == 'received':
            received_date = purchase.purchase_date.date()
            stock.last_purchase_date = max(filter(None, [stock.last_purchase_date, received_date]))
        if purchase.is_free and purchase.status == 'received' and stock.quantity == 0:
            stock.zero_cost_allowed = True
        receive_raw_stock(stock, new[0]-old[0], new[2]-old[2], pieces=new[1]-old[1], save=save_stock)

@transaction.atomic
def update_raw_material_stock_on_purchase(item, purchase, *, save_stock):
    if purchase.status != 'received': return
    RawMaterial.all_objects.select_for_update().get(pk=item.raw_material_id)
    stock, _ = RawMaterialStock.objects.select_for_update().get_or_create(raw_material=item.raw_material)
    stock.last_purchase_date = purchase.purchase_date.date()
    receive_raw_stock(stock, item.quantity, d(item.quantity)*d(item.price_per_unit_base), pieces=item.piece_count, save=save_stock)

@transaction.atomic
def revert_raw_material_stock_from_purchase(item, purchase, *, save_stock):
    stock = RawMaterialStock.objects.select_for_update().get(raw_material=item.raw_material)
    receive_raw_stock(stock, -item.quantity, -d(item.quantity)*d(item.price_per_unit_base), pieces=-item.piece_count, save=save_stock)

@transaction.atomic
def update_raw_material_stock_on_item_change(item, purchase, *, old_quantity, old_piece_count=0, old_price_per_unit_base=None, save_stock):
    if purchase.status != 'received': return
    if old_price_per_unit_base is None:
        old_price_per_unit_base = item.price_per_unit_base
    stock = RawMaterialStock.objects.select_for_update().get(raw_material=item.raw_material)
    receive_raw_stock(stock, d(item.quantity)-d(old_quantity), d(item.quantity)*d(item.price_per_unit_base)-d(old_quantity)*d(old_price_per_unit_base), pieces=item.piece_count-old_piece_count, save=save_stock)
