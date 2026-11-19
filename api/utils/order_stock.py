"""Shared helpers for when orders should move inventory."""

from api.services.accounting import SKIP_JOURNAL_STATUSES


def order_affects_stock(status):
    """Inventory moves only for non-draft, non-cancelled orders."""
    return not (status and status in SKIP_JOURNAL_STATUSES)


def return_affects_stock(return_order):
    """Returns restore stock only when the original sale reduced stock."""
    return order_affects_stock(return_order.sales.status)
