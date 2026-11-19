"""Loan principal, cash activity, and historical outstanding balances."""
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Q, Sum

from api.models.data.loan import Loan, LoanPayment
from api.utils.date_filters import apply_date_range, normalize_date_to

CENT = Decimal('0.01')


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
        principal = Decimal(loan.amount or 0)
        paid = max(Decimal(loan.report_paid or 0), Decimal('0'))
        remaining = max(principal - paid, Decimal('0'))
        remaining_base = (
            Decimal(loan.amount_base or 0) * remaining / principal
            if principal > 0 else Decimal('0')
        ).quantize(CENT, rounding=ROUND_HALF_UP)
        yield loan, paid, remaining, remaining_base


def get_loan_summary(start_date=None, end_date=None, *, currency=None):
    """Activity in the period, plus balances on all loans at period end.

    currency=None consolidates stored AFN values; an id selects native values.
    """
    loans = apply_date_range(Loan.objects.all(), 'loan_date', start_date, end_date)
    payments = apply_date_range(
        LoanPayment.objects.filter(loan__deleted_at__isnull=True),
        'payment_date', start_date, end_date,
    )
    balances = Loan.objects.all()
    if currency is not None:
        loans = loans.filter(currency=currency)
        payments = payments.filter(loan__currency=currency)
        balances = balances.filter(currency=currency)
    field = 'amount_base' if currency is None else 'amount'

    def total(qs):
        return float(qs.aggregate(total=Sum(field))['total'] or 0)

    cash_loans = loans.filter(is_opening_balance=False, source_payment__isnull=True)
    noncash = loans.filter(Q(is_opening_balance=True) | Q(source_payment__isnull=False))
    summary = {
        'loans_given': total(cash_loans.filter(loan_type='loan_out')),
        'loans_received': total(cash_loans.filter(loan_type='loan_in')),
        'principal_given': total(loans.filter(loan_type='loan_out')),
        'principal_received': total(loans.filter(loan_type='loan_in')),
        'noncash_given': total(noncash.filter(loan_type='loan_out')),
        'noncash_received': total(noncash.filter(loan_type='loan_in')),
        'loan_collections': total(payments.filter(loan__loan_type='loan_out')),
        'loan_repayments': total(payments.filter(loan__loan_type='loan_in')),
        'receivable_total': Decimal('0'),
        'receivable_paid': Decimal('0'),
        'loans_receivable': Decimal('0'),
        'payable_total': Decimal('0'),
        'payable_paid': Decimal('0'),
        'loans_payable': Decimal('0'),
    }
    for loan, paid, remaining, remaining_base in loan_balances_at(end_date, queryset=balances):
        principal_native = Decimal(loan.amount or 0)
        principal_base = Decimal(loan.amount_base or 0)
        if currency is None:
            principal_val = principal_base
            paid_val = (
                (principal_base * paid / principal_native).quantize(CENT, rounding=ROUND_HALF_UP)
                if principal_native > 0 else Decimal('0')
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
