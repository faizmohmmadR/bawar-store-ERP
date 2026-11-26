"""Loan principal, cash activity, and historical outstanding balances."""
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Q, Sum

from api.models.data.currency import BASE_CURRENCY_ID
from api.models.data.loan import Loan, LoanPayment
from api.utils.date_filters import apply_date_range, normalize_date_to

CENT = Decimal('0.01')
ZERO = Decimal('0')


def _d(value):
    return Decimal(str(value or 0))


def _loan_amount_afn(loan):
    """AFN principal for a loan — fall back to native when amount_base is missing."""
    base = _d(getattr(loan, 'amount_base', 0))
    native = _d(loan.amount)
    if base > 0:
        return base
    if int(getattr(loan, 'currency', BASE_CURRENCY_ID) or BASE_CURRENCY_ID) == BASE_CURRENCY_ID:
        return native
    rate = _d(getattr(loan, 'exchange_rate', 1) or 1) or Decimal('1')
    return (native * rate).quantize(CENT, rounding=ROUND_HALF_UP)


def _payment_amount_afn(payment):
    base = _d(getattr(payment, 'amount_base', 0))
    native = _d(payment.amount)
    if base > 0:
        return base
    loan = getattr(payment, 'loan', None)
    currency = getattr(loan, 'currency', None) if loan is not None else getattr(payment, 'currency', BASE_CURRENCY_ID)
    if int(currency or BASE_CURRENCY_ID) == BASE_CURRENCY_ID:
        return native
    rate = _d(getattr(payment, 'exchange_rate', None) or getattr(loan, 'exchange_rate', 1) or 1) or Decimal('1')
    return (native * rate).quantize(CENT, rounding=ROUND_HALF_UP)


def loan_balances_at(end_date=None, *, queryset=None):
    """Native principal remaining at cutoff, valued at the loan's booked AFN rate.

    Repayment-date FX affects cash/realized FX, not principal extinguished.
    Opening and intermediary loans are included; deleted loans/payments are not.
    """
    end_date = normalize_date_to(end_date)
    qs = Loan.objects.all() if queryset is None else queryset
    qs = apply_date_range(qs, 'loan_date', None, end_date)
    payment_filter = Q(payments__deleted_at__isnull=True)
    if end_date is not None:
        payment_filter &= Q(payments__payment_date__lte=end_date)
    qs = qs.select_related('customer', 'vendor').annotate(
        report_paid=Sum('payments__amount', filter=payment_filter),
    )
    for loan in qs:
        principal = max(_d(loan.amount), ZERO)
        paid = max(_d(loan.report_paid), ZERO)
        remaining = max(principal - paid, ZERO)
        principal_base = _loan_amount_afn(loan)
        remaining_base = (
            (principal_base * remaining / principal).quantize(CENT, rounding=ROUND_HALF_UP)
            if principal > 0 else ZERO
        )
        yield loan, paid, remaining, remaining_base


def get_loan_summary(start_date=None, end_date=None, *, currency=None):
    """Activity in the period, plus balances on all loans at period end.

    currency=None consolidates AFN values; an id selects native values.
    """
    loans = apply_date_range(Loan.objects.all(), 'loan_date', start_date, end_date)
    payments = apply_date_range(
        LoanPayment.objects.filter(loan__deleted_at__isnull=True).select_related('loan'),
        'payment_date', start_date, end_date,
    )
    balances = Loan.objects.all()
    if currency is not None:
        loans = loans.filter(currency=currency)
        payments = payments.filter(loan__currency=currency)
        balances = balances.filter(currency=currency)

    def total_native(qs):
        return float(qs.aggregate(total=Sum('amount'))['total'] or 0)

    def total_afn_loans(qs):
        return float(sum((_loan_amount_afn(loan) for loan in qs.iterator()), ZERO))

    def total_afn_payments(qs):
        return float(sum((_payment_amount_afn(pay) for pay in qs.iterator()), ZERO))

    cash_loans = loans.filter(is_opening_balance=False, source_payment__isnull=True)
    noncash = loans.filter(Q(is_opening_balance=True) | Q(source_payment__isnull=False))
    if currency is None:
        summary = {
            'loans_given': total_afn_loans(cash_loans.filter(loan_type='loan_out')),
            'loans_received': total_afn_loans(cash_loans.filter(loan_type='loan_in')),
            'principal_given': total_afn_loans(loans.filter(loan_type='loan_out')),
            'principal_received': total_afn_loans(loans.filter(loan_type='loan_in')),
            'noncash_given': total_afn_loans(noncash.filter(loan_type='loan_out')),
            'noncash_received': total_afn_loans(noncash.filter(loan_type='loan_in')),
            'loan_collections': total_afn_payments(payments.filter(loan__loan_type='loan_out')),
            'loan_repayments': total_afn_payments(payments.filter(loan__loan_type='loan_in')),
        }
    else:
        summary = {
            'loans_given': total_native(cash_loans.filter(loan_type='loan_out')),
            'loans_received': total_native(cash_loans.filter(loan_type='loan_in')),
            'principal_given': total_native(loans.filter(loan_type='loan_out')),
            'principal_received': total_native(loans.filter(loan_type='loan_in')),
            'noncash_given': total_native(noncash.filter(loan_type='loan_out')),
            'noncash_received': total_native(noncash.filter(loan_type='loan_in')),
            'loan_collections': total_native(payments.filter(loan__loan_type='loan_out')),
            'loan_repayments': total_native(payments.filter(loan__loan_type='loan_in')),
        }
    summary.update({
        'receivable_total': Decimal('0'),
        'receivable_paid': Decimal('0'),
        'loans_receivable': Decimal('0'),
        'payable_total': Decimal('0'),
        'payable_paid': Decimal('0'),
        'loans_payable': Decimal('0'),
    })
    for loan, paid, remaining, remaining_base in loan_balances_at(end_date, queryset=balances):
        principal_native = max(_d(loan.amount), ZERO)
        principal_base = _loan_amount_afn(loan)
        if currency is None:
            principal_val = principal_base
            paid_val = (
                (principal_base * paid / principal_native).quantize(CENT, rounding=ROUND_HALF_UP)
                if principal_native > 0 else ZERO
            )
            remaining_val = remaining_base
        else:
            principal_val = principal_native
            paid_val = paid
            remaining_val = remaining
        if loan.loan_type == 'loan_out':
            summary['receivable_total'] += principal_val
            summary['receivable_paid'] += paid_val
            summary['loans_receivable'] += remaining_val
        else:
            summary['payable_total'] += principal_val
            summary['payable_paid'] += paid_val
            summary['loans_payable'] += remaining_val
    for key in (
        'receivable_total', 'receivable_paid', 'loans_receivable',
        'payable_total', 'payable_paid', 'loans_payable',
    ):
        summary[key] = float(summary[key])
    return summary
