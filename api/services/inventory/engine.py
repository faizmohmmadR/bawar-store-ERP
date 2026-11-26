"""
Central inventory engine.

All stock changes go through post_movement / helpers here.
"""
from __future__ import annotations

from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from api.services.costing.avco import receive_average, remove_average
from api.services.uom.conversion import d, packaging_to_base, quantize, snapshot_factor


def get_default_warehouse():
    from api.models.data.warehouse import Warehouse
    wh = Warehouse.objects.filter(is_default=True, is_active=True).first()
    if wh:
        return wh
    wh = Warehouse.objects.filter(is_active=True).order_by('id').first()
    if wh:
        return wh
    return Warehouse.objects.create(code='MAIN', name='Main Warehouse', is_default=True)


def _lock_balance(product_id, warehouse_id, lot_id=None):
    from api.models.data.inventory_ledger import InventoryBalance
    qs = InventoryBalance.objects.select_for_update()
    balance = qs.filter(
        product_id=product_id,
        warehouse_id=warehouse_id,
        lot_id=lot_id,
    ).first()
    if balance is None:
        balance = InventoryBalance.objects.create(
            product_id=product_id,
            warehouse_id=warehouse_id,
            lot_id=lot_id,
            quantity_on_hand=0,
            quantity_reserved=0,
            average_cost=0,
        )
        balance = InventoryBalance.objects.select_for_update().get(pk=balance.pk)
    return balance


def _warehouse_on_hand(product_id, warehouse_id):
    """Total sellable base qty across lot + non-lot balances."""
    from api.models.data.inventory_ledger import InventoryBalance
    total = InventoryBalance.objects.filter(
        product_id=product_id,
        warehouse_id=warehouse_id,
    ).aggregate(total=Sum('quantity_on_hand'))['total']
    return d(total)


def _warehouse_average_cost(product_id, warehouse_id, product=None):
    """Quantity-weighted AVCO across warehouse balances; fall back to product."""
    from api.models.data.inventory_ledger import InventoryBalance
    rows = list(
        InventoryBalance.objects.filter(
            product_id=product_id,
            warehouse_id=warehouse_id,
            quantity_on_hand__gt=0,
        ).values_list('quantity_on_hand', 'average_cost')
    )
    qty = sum((d(q) for q, _ in rows), Decimal('0'))
    if qty > 0:
        value = sum((d(q) * d(c) for q, c in rows), Decimal('0'))
        return quantize(value / qty)
    if product is not None:
        return d(getattr(product, 'average_cost', 0) or 0)
    return Decimal('0')


def _issue_balances(product_id, warehouse_id):
    """
    Lock balances for outbound issue in FEFO order (nearest expiry first),
    then undated lots, then non-lot stock.
    """
    from api.models.data.inventory_ledger import InventoryBalance
    return list(
        InventoryBalance.objects.select_for_update()
        .filter(
            product_id=product_id,
            warehouse_id=warehouse_id,
            quantity_on_hand__gt=0,
        )
        .select_related('lot')
        .order_by(
            F('lot__expiry_date').asc(nulls_last=True),
            F('lot_id').asc(nulls_last=True),
            'id',
        )
    )


def _sync_stock_mirror(product, warehouse, balance=None):
    """Keep legacy Stock good-row in sync for older UI paths (sum of all lots)."""
    from api.models.data.stock import Stock

    on_hand = _warehouse_on_hand(product.id, warehouse.id)
    avg_cost = _warehouse_average_cost(product.id, warehouse.id, product=product)
    if balance is not None and on_hand <= 0:
        # Preserve last known cost when stock hits zero.
        avg_cost = d(balance.average_cost) or avg_cost or d(product.average_cost)

    stock, _ = Stock.objects.get_or_create(
        product=product,
        warehouse=warehouse,
        condition=Stock.CONDITION_GOOD,
        defaults={'piece_amount': 0, 'buy_price': 0},
    )
    from api.models.data.currency import BASE_CURRENCY_ID

    Stock.objects.filter(pk=stock.pk).update(
        piece_amount=on_hand,
        buy_price=avg_cost,
        currency=BASE_CURRENCY_ID,
    )
    product.average_cost = avg_cost
    product.save(update_fields=['average_cost', 'updated_at'])


@transaction.atomic
def post_movement(
    *,
    product,
    warehouse,
    movement_type: str,
    base_quantity,
    packaging=None,
    transaction_quantity=None,
    conversion_factor=None,
    unit_cost=None,
    lot=None,
    source=None,
    user=None,
    notes=None,
    occurred_at=None,
    update_avco: bool = True,
):
    """
    Post an immutable stock movement and update InventoryBalance.

    base_quantity is signed: positive increases on-hand, negative decreases.
    """
    from api.models.data.inventory_ledger import StockMovement

    if product is None:
        raise ValidationError('Product is required.')
    if not getattr(product, 'track_inventory', True):
        return None
    if warehouse is None:
        warehouse = get_default_warehouse()

    base_qty = quantize(d(base_quantity))
    if base_qty == 0 and movement_type != StockMovement.TYPE_PACKAGE_OPEN:
        return None

    factor = d(conversion_factor) if conversion_factor is not None else (
        snapshot_factor(packaging) if packaging is not None else Decimal('1')
    )
    txn_qty = (
        quantize(d(transaction_quantity))
        if transaction_quantity is not None
        else (quantize(base_qty / factor) if factor else base_qty)
    )

    balance = _lock_balance(product.id, warehouse.id, getattr(lot, 'id', None))
    new_on_hand = d(balance.quantity_on_hand) + base_qty

    if (
        base_qty < 0
        and new_on_hand < 0
        and not getattr(product, 'allow_negative_stock', False)
    ):
        raise ValidationError(
            f'Insufficient stock for {product.name}: '
            f'on hand {balance.quantity_on_hand}, requested {abs(base_qty)}.'
        )

    cost = d(unit_cost) if unit_cost is not None else d(balance.average_cost or product.average_cost)

    if update_avco and base_qty > 0 and movement_type in {
        StockMovement.TYPE_PURCHASE_RECEIPT,
        StockMovement.TYPE_CUSTOMER_RETURN,
        StockMovement.TYPE_TRANSFER_IN,
        StockMovement.TYPE_ADJUSTMENT_IN,
        StockMovement.TYPE_OPENING,
    }:
        incoming_value = base_qty * cost
        _, new_cost = receive_average(
            balance.quantity_on_hand, balance.average_cost, base_qty, incoming_value,
        )
        balance.average_cost = new_cost
        cost = new_cost
    elif update_avco and base_qty < 0 and movement_type in {
        StockMovement.TYPE_SUPPLIER_RETURN,
    }:
        remove_qty = abs(base_qty)
        remove_value = remove_qty * cost
        _, new_cost = remove_average(
            balance.quantity_on_hand, balance.average_cost, remove_qty, remove_value,
        )
        balance.average_cost = new_cost

    balance.quantity_on_hand = quantize(new_on_hand)
    balance.save(update_fields=['quantity_on_hand', 'average_cost', 'updated_at'])
    _sync_stock_mirror(product, warehouse, balance)

    ct = oid = None
    if source is not None and getattr(source, 'pk', None):
        ct = ContentType.objects.get_for_model(source, for_concrete_model=False)
        oid = source.pk

    movement = StockMovement.objects.create(
        product=product,
        warehouse=warehouse,
        lot=lot,
        movement_type=movement_type,
        base_quantity=base_qty,
        packaging=packaging,
        transaction_quantity=txn_qty,
        conversion_factor=factor,
        unit_cost=cost,
        occurred_at=occurred_at or timezone.now(),
        user=user,
        notes=notes,
        content_type=ct,
        object_id=oid,
    )

    # Keep low/out-of-stock notifications in sync after every real stock change.
    if base_qty != 0:
        try:
            from api.services.notifications import sync_balance_stock_alert
            sync_balance_stock_alert(balance, product=product, warehouse=warehouse)
        except Exception:
            # Stock posting must never fail because of notification side-effects.
            pass

    return movement


def receive_purchase_item(item, *, user=None):
    """Receive one purchase line into inventory."""
    from api.models.data.inventory_ledger import StockMovement
    from api.models.data.inventory_ledger import InventoryLot

    purchase = item.purchase
    product = item.product
    warehouse = purchase.warehouse
    packaging = item.packaging
    base_qty = packaging_to_base(
        item.quantity,
        packaging,
        measured_base=item.measured_base_quantity,
        places=getattr(product, 'quantity_decimal_places', 6) or 6,
    )
    # Unit cost in AFN per base unit
    unit_cost = Decimal('0')
    if base_qty > 0:
        unit_cost = quantize(d(item.total_price_base) / base_qty)

    # Lots only when the operator enters lot/expiry (or batch tracking requires it).
    # Otherwise receive into the warehouse pool so stock stays one row per product.
    lot = None
    lot_number = (item.lot_number or '').strip() if item.lot_number else ''
    has_lot_identity = bool(
        lot_number or item.expiry_date or item.manufacturing_date
    )
    if (product.track_batch or product.track_expiry) and has_lot_identity:
        lot_number = lot_number or f'P{purchase.invoice_number}-{item.pk}'
        lot, created = InventoryLot.objects.get_or_create(
            product=product,
            warehouse=warehouse,
            lot_number=lot_number,
            defaults={
                'manufacturing_date': item.manufacturing_date,
                'expiry_date': item.expiry_date,
                'quantity_received': base_qty,
                'quantity_remaining': base_qty,
                'unit_cost': unit_cost,
                'vendor': purchase.vendor,
            },
        )
        if not created:
            InventoryLot.objects.filter(pk=lot.pk).update(
                quantity_remaining=d(lot.quantity_remaining) + base_qty,
                quantity_received=d(lot.quantity_received) + base_qty,
            )
            lot.refresh_from_db()

    return post_movement(
        product=product,
        warehouse=warehouse,
        movement_type=StockMovement.TYPE_PURCHASE_RECEIPT,
        base_quantity=base_qty,
        packaging=packaging,
        transaction_quantity=item.quantity,
        conversion_factor=item.conversion_factor or snapshot_factor(packaging),
        unit_cost=unit_cost,
        lot=lot,
        source=item,
        user=user,
        occurred_at=purchase.purchase_date,
    )


def reverse_purchase_item(item, *, user=None):
    """
    Void stock that was received for a purchase line (idempotent).

    Posts supplier_return movements for any net remaining receipt qty.
    Raises if stock was already sold and on-hand is insufficient.
    """
    from collections import defaultdict

    from django.contrib.contenttypes.models import ContentType
    from django.db.models import F

    from api.models.data.inventory_ledger import InventoryLot, StockMovement

    product = item.product
    if product is None or not getattr(product, 'track_inventory', True):
        return []

    purchase = item.purchase
    warehouse = purchase.warehouse or get_default_warehouse()
    ct = ContentType.objects.get_for_model(item, for_concrete_model=False)
    related = StockMovement.objects.filter(
        content_type=ct,
        object_id=item.pk,
        movement_type__in=[
            StockMovement.TYPE_PURCHASE_RECEIPT,
            StockMovement.TYPE_SUPPLIER_RETURN,
        ],
    )
    by_lot = defaultdict(lambda: {'qty': Decimal('0'), 'value': Decimal('0')})
    packaging = item.packaging
    factor = item.conversion_factor or snapshot_factor(packaging)
    for mov in related:
        qty = d(mov.base_quantity)
        by_lot[mov.lot_id]['qty'] += qty
        by_lot[mov.lot_id]['value'] += qty * d(mov.unit_cost)

    movements = []
    for lot_id, data in by_lot.items():
        net_qty = quantize(data['qty'])
        if net_qty <= 0:
            continue
        unit_cost = quantize(data['value'] / net_qty) if net_qty else Decimal('0')
        lot = InventoryLot.objects.filter(pk=lot_id).first() if lot_id else None
        txn_qty = quantize(net_qty / factor) if factor else net_qty
        movement = post_movement(
            product=product,
            warehouse=warehouse,
            movement_type=StockMovement.TYPE_SUPPLIER_RETURN,
            base_quantity=-net_qty,
            packaging=packaging,
            transaction_quantity=-txn_qty,
            conversion_factor=factor,
            unit_cost=unit_cost,
            lot=lot,
            source=item,
            user=user,
            occurred_at=timezone.now(),
            update_avco=True,
            notes=f'Void purchase {purchase.invoice_number}',
        )
        if lot_id:
            InventoryLot.objects.filter(pk=lot_id).update(
                quantity_remaining=F('quantity_remaining') - net_qty,
            )
        if movement is not None:
            movements.append(movement)
    return movements


def reverse_purchase_receipts(purchase, *, user=None):
    """Reverse all received stock for a purchase (used on soft-delete / void)."""
    from api.models.data.purchases import PurchaseItem

    items = PurchaseItem.all_objects.filter(
        purchase_id=purchase.pk, deleted_at__isnull=True,
    ).select_related('product', 'packaging', 'purchase', 'purchase__warehouse')
    reversed_movements = []
    for item in items:
        reversed_movements.extend(reverse_purchase_item(item, user=user))
    return reversed_movements


def reverse_sale_item(item, *, user=None):
    """
    Restore stock that was delivered for a sale line (idempotent).

    Posts customer_return movements for any net remaining delivery qty so
    soft-deleting a sale puts inventory back before linked purchases can void.
    """
    from collections import defaultdict

    from django.contrib.contenttypes.models import ContentType
    from django.db.models import F

    from api.models.data.inventory_ledger import InventoryLot, StockMovement

    product = item.product
    if product is None or not getattr(product, 'track_inventory', True):
        return []

    sale = item.sales
    warehouse = sale.warehouse or get_default_warehouse()
    ct = ContentType.objects.get_for_model(item, for_concrete_model=False)
    related = StockMovement.objects.filter(
        content_type=ct,
        object_id=item.pk,
        movement_type__in=[
            StockMovement.TYPE_SALES_DELIVERY,
            StockMovement.TYPE_CUSTOMER_RETURN,
        ],
    )
    by_lot = defaultdict(lambda: {'qty': Decimal('0'), 'value': Decimal('0')})
    packaging = item.packaging
    factor = item.conversion_factor or snapshot_factor(packaging)
    for mov in related:
        qty = d(mov.base_quantity)
        by_lot[mov.lot_id]['qty'] += qty
        by_lot[mov.lot_id]['value'] += qty * d(mov.unit_cost)

    movements = []
    for lot_id, data in by_lot.items():
        # Deliveries are negative; net < 0 means stock still needs restoring.
        net_qty = quantize(data['qty'])
        if net_qty >= 0:
            continue
        restore_qty = -net_qty
        # value was qty * cost with negative qty → flip sign for positive restore cost
        unit_cost = (
            quantize((-data['value']) / restore_qty) if restore_qty else Decimal('0')
        )
        lot = InventoryLot.objects.filter(pk=lot_id).first() if lot_id else None
        txn_qty = quantize(restore_qty / factor) if factor else restore_qty
        movement = post_movement(
            product=product,
            warehouse=warehouse,
            movement_type=StockMovement.TYPE_CUSTOMER_RETURN,
            base_quantity=restore_qty,
            packaging=packaging,
            transaction_quantity=txn_qty,
            conversion_factor=factor,
            unit_cost=unit_cost,
            lot=lot,
            source=item,
            user=user,
            occurred_at=timezone.now(),
            update_avco=True,
            notes=f'Void sale {sale.invoice_number}',
        )
        if lot_id:
            InventoryLot.objects.filter(pk=lot_id).update(
                quantity_remaining=F('quantity_remaining') + restore_qty,
            )
        if movement is not None:
            movements.append(movement)
    return movements


def reverse_sale_deliveries(sale, *, user=None):
    """Reverse all stock deliveries for a sale (used on soft-delete / void)."""
    from api.models.data.sales import SalesItems

    items = SalesItems.all_objects.filter(
        sales_id=sale.pk, deleted_at__isnull=True,
    ).select_related('product', 'packaging', 'sales', 'sales__warehouse')
    reversed_movements = []
    for item in items:
        reversed_movements.extend(reverse_sale_item(item, user=user))
    return reversed_movements


def deliver_sale_item(item, *, user=None, warehouse=None):
    """Deliver one sale line from inventory (FEFO across lot balances)."""
    from api.models.data.inventory_ledger import InventoryLot, StockMovement

    product = item.product
    packaging = item.packaging
    wh = warehouse or item.sales.warehouse or get_default_warehouse()
    base_qty = d(item.base_quantity)
    if base_qty <= 0:
        base_qty = packaging_to_base(item.quantity, packaging)
    needed = abs(base_qty)
    if needed <= 0:
        return None

    on_hand = _warehouse_on_hand(product.id, wh.id)
    if (
        needed > on_hand
        and not getattr(product, 'allow_negative_stock', False)
        and getattr(product, 'track_inventory', True)
    ):
        raise ValidationError(
            f'Insufficient stock for {product.name}: '
            f'on hand {on_hand}, requested {needed}.'
        )

    unit_cost = _warehouse_average_cost(product.id, wh.id, product=product)
    item.unit_cost = unit_cost
    item.cost_is_known = True
    type(item).objects.filter(pk=item.pk).update(
        unit_cost=unit_cost, cost_is_known=True,
    )

    factor = item.conversion_factor or snapshot_factor(packaging)
    remaining = needed
    last_movement = None
    balances = _issue_balances(product.id, wh.id)

    # Prefer lot rows first; if still short and negatives allowed, fall through
    # to a null-lot balance via post_movement.
    for balance in balances:
        if remaining <= 0:
            break
        take = min(d(balance.quantity_on_hand), remaining)
        if take <= 0:
            continue
        # Scale transaction qty proportionally for multi-lot splits.
        txn_share = quantize(take / needed * d(item.quantity)) if needed else take
        last_movement = post_movement(
            product=product,
            warehouse=wh,
            movement_type=StockMovement.TYPE_SALES_DELIVERY,
            base_quantity=-take,
            packaging=packaging,
            transaction_quantity=-abs(txn_share),
            conversion_factor=factor,
            unit_cost=unit_cost,
            lot=balance.lot,
            source=item,
            user=user,
            occurred_at=item.sales.sale_date,
            update_avco=False,
        )
        if balance.lot_id:
            InventoryLot.objects.filter(pk=balance.lot_id).update(
                quantity_remaining=F('quantity_remaining') - take,
            )
        remaining -= take

    if remaining > 0:
        if not getattr(product, 'allow_negative_stock', False):
            raise ValidationError(
                f'Insufficient stock for {product.name}: '
                f'on hand {on_hand}, requested {needed}.'
            )
        last_movement = post_movement(
            product=product,
            warehouse=wh,
            movement_type=StockMovement.TYPE_SALES_DELIVERY,
            base_quantity=-remaining,
            packaging=packaging,
            transaction_quantity=-abs(
                quantize(remaining / needed * d(item.quantity)) if needed else remaining
            ),
            conversion_factor=factor,
            unit_cost=unit_cost,
            source=item,
            user=user,
            occurred_at=item.sales.sale_date,
            update_avco=False,
        )

    return last_movement


def restore_return_item(item, *, user=None, sellable=True):
    """Restore customer return quantity to sellable stock when allowed."""
    from api.models.data.inventory_ledger import StockMovement

    if not sellable:
        return None
    sale_item = item.sales_item
    product = sale_item.product
    packaging = sale_item.packaging
    wh = sale_item.sales.warehouse or get_default_warehouse()
    base_qty = d(item.base_quantity) or packaging_to_base(item.quantity, packaging)
    return post_movement(
        product=product,
        warehouse=wh,
        movement_type=StockMovement.TYPE_CUSTOMER_RETURN,
        base_quantity=abs(base_qty),
        packaging=packaging,
        transaction_quantity=abs(d(item.quantity)),
        conversion_factor=item.conversion_factor or sale_item.conversion_factor,
        unit_cost=sale_item.unit_cost or product.average_cost,
        source=item,
        user=user,
        occurred_at=item.return_order.return_date,
    )


def transfer_stock(*, product, from_warehouse, to_warehouse, packaging, quantity, user=None, notes=None):
    from api.models.data.inventory_ledger import StockMovement

    if from_warehouse.id == to_warehouse.id:
        raise ValidationError('Source and destination warehouses must differ.')
    base_qty = packaging_to_base(quantity, packaging)
    factor = snapshot_factor(packaging)
    balance = _lock_balance(product.id, from_warehouse.id)
    out = post_movement(
        product=product,
        warehouse=from_warehouse,
        movement_type=StockMovement.TYPE_TRANSFER_OUT,
        base_quantity=-abs(base_qty),
        packaging=packaging,
        transaction_quantity=-abs(d(quantity)),
        conversion_factor=factor,
        unit_cost=balance.average_cost,
        user=user,
        notes=notes,
        update_avco=False,
    )
    post_movement(
        product=product,
        warehouse=to_warehouse,
        movement_type=StockMovement.TYPE_TRANSFER_IN,
        base_quantity=abs(base_qty),
        packaging=packaging,
        transaction_quantity=abs(d(quantity)),
        conversion_factor=factor,
        unit_cost=balance.average_cost,
        user=user,
        notes=notes,
    )
    return out


def adjust_stock(*, product, warehouse, base_quantity_delta, user=None, reason=None, movement_type=None):
    from api.models.data.inventory_ledger import StockMovement

    delta = d(base_quantity_delta)
    if delta == 0:
        return None
    mtype = movement_type or (
        StockMovement.TYPE_ADJUSTMENT_IN if delta > 0 else StockMovement.TYPE_ADJUSTMENT_OUT
    )
    balance = _lock_balance(product.id, warehouse.id)
    return post_movement(
        product=product,
        warehouse=warehouse,
        movement_type=mtype,
        base_quantity=delta,
        transaction_quantity=delta,
        conversion_factor=Decimal('1'),
        unit_cost=balance.average_cost,
        user=user,
        notes=reason,
        update_avco=delta > 0,
    )


def open_package(*, product, warehouse, packaging, quantity=1, user=None):
    """
    Open N packages into base units for physical tracking.
    Canonical on-hand base qty is unchanged.
    """
    from api.models.data.inventory_ledger import InventoryPackageBalance, StockMovement

    factor = snapshot_factor(packaging)
    qty = d(quantity)
    if qty <= 0:
        raise ValidationError('Quantity must be positive.')
    base_pack, _ = InventoryPackageBalance.objects.get_or_create(
        product=product,
        warehouse=warehouse,
        packaging=packaging,
        is_opened=False,
        defaults={'quantity': 0},
    )
    loose, _ = InventoryPackageBalance.objects.get_or_create(
        product=product,
        warehouse=warehouse,
        packaging=product.packagings.filter(is_base=True).first() or packaging,
        is_opened=True,
        defaults={'quantity': 0},
    )
    base_pack = InventoryPackageBalance.objects.select_for_update().get(pk=base_pack.pk)
    if d(base_pack.quantity) < qty:
        raise ValidationError('Not enough unopened packages to open.')
    base_pack.quantity = d(base_pack.quantity) - qty
    base_pack.save(update_fields=['quantity', 'updated_at'])
    loose = InventoryPackageBalance.objects.select_for_update().get(pk=loose.pk)
    loose.quantity = d(loose.quantity) + (qty * factor)
    loose.save(update_fields=['quantity', 'updated_at'])
    return StockMovement.objects.create(
        product=product,
        warehouse=warehouse,
        movement_type=StockMovement.TYPE_PACKAGE_OPEN,
        base_quantity=0,
        packaging=packaging,
        transaction_quantity=qty,
        conversion_factor=factor,
        unit_cost=0,
        user=user,
        notes=f'Opened {qty} × {packaging.name}',
        occurred_at=timezone.now(),
    )
