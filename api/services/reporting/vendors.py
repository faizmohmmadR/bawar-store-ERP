"""Vendor invoice balances."""
from api.models.data.purchases import Purchase


def vendor_invoice_balances(**kwargs):
    rows = []
    for p in Purchase.objects.exclude(status__in=['draft', 'cancelled']).select_related('vendor'):
        rows.append({
            'vendor': getattr(p.vendor, 'name', None),
            'invoice': p.invoice_number,
            'total': p.total_amount,
            'paid': p.paid_amount,
            'balance': (p.total_amount or 0) - (p.paid_amount or 0),
        })
    return {'rows': rows}
