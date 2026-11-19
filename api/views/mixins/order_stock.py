from api.utils.order_stock import order_affects_stock


class OrderStockViewMixin:
    """Status-aware stock transitions for purchase/sales orders."""

    def _order_affects_stock(self, order):
        return order_affects_stock(getattr(order, 'status', None))

    def _apply_status_stock_transition(self, order, old_status, items, *, apply_item, revert_item):
        """Apply or revert stock for all lines when status crosses draft/cancelled."""
        old_affects = order_affects_stock(old_status)
        new_affects = self._order_affects_stock(order)
        if not old_affects and new_affects:
            for item in items:
                apply_item(item, order)
        elif old_affects and not new_affects:
            for item in items:
                revert_item(item, order)
