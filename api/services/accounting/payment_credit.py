"""Cash advances and later non-cash applications to trade bills."""
from decimal import Decimal

from api.services.accounting.coa import ensure_accounting_ready, get_gl_for_role, get_payment_asset_account
from api.services.accounting.posting import replace_journal_for_source
from api.services.accounting.totals import sync_order_paid_amount
from api.services.accounting.fx import annotate_settlement_lines, carrying_rate, MONETARY_PAYABLE, MONETARY_RECEIVABLE


def sync_credit_payment_journal(payment):
    receipt = payment.general_payment
    if not receipt:
        return
    if receipt.source_sale_id and payment.is_advance:
        # The goods document already funds supplier credit; no cash moved.
        return
    cid = payment.currency
    if not ensure_accounting_ready(currency_id=cid):
        return
    sale = payment.payment_type == 'sale'
    advance_gl = get_gl_for_role('customer_advance' if sale else 'supplier_advance', currency_id=cid)
    if payment.is_advance:
        cash = get_payment_asset_account(payment.payment_method, currency_id=cid)
        debit, credit = (cash, advance_gl) if sale else (advance_gl, cash)
        lines = [
            {'gl_account': debit, 'debit': payment.amount, 'credit': Decimal('0'), 'currency': cid,
             'exchange_rate': payment.exchange_rate, 'description': 'Customer deposit' if sale else 'Supplier prepayment'},
            {'gl_account': credit, 'debit': Decimal('0'), 'credit': payment.amount, 'currency': cid,
             'exchange_rate': payment.exchange_rate, 'description': 'Retained advance'},
        ]
    else:
        order = payment.content_object
        sync_order_paid_amount(order)
        lines = annotate_settlement_lines(
            currency_id=cid, native_amount=payment.amount, cash_gl=advance_gl,
            monetary_gl=get_gl_for_role('accounts_receivable' if sale else 'accounts_payable', currency_id=cid),
            monetary_kind=MONETARY_RECEIVABLE if sale else MONETARY_PAYABLE,
            carrying_rate_value=carrying_rate(order, cid), settlement_rate_value=payment.exchange_rate,
            cash_is_debit=sale, cash_description='Apply retained credit', monetary_description='Settle bill using retained credit',
        )
    replace_journal_for_source(payment, entry_date=payment.payment_date,
        reference_number=payment.reference_number or f'GPAY-{receipt.pk}',
        description='Advance payment' if payment.is_advance else 'Apply advance to bill', lines=lines)
