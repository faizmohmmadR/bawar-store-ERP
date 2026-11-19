"""Read-only party positions from explicit document links, never descriptions."""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from rest_framework.exceptions import ValidationError

from api.models.data.loan import Loan, LoanPayment
from api.models.data.journal import JournalEntry, JournalLine
from .invoices import customer_invoice_balances, string4
from .vendors import vendor_invoice_balances
from .customer_advances import customer_advance_balances

ZERO = Decimal('0')
PARTY_CODES = ('1200', '2000', '1310', '2100', '1320', '2300')


def party_loan_balances(scope):
    if scope.account_id is not None:
        raise ValidationError({'account_id': 'Loan positions require whole source documents.'})
    loans = Loan.objects.select_related('customer', 'vendor', 'source_payment')
    if scope.currency is not None:
        loans = loans.filter(currency=scope.currency)
    if scope.end_date:
        loans = loans.filter(loan_date__lte=scope.end_date)
    payments = LoanPayment.objects.filter(loan_id__in=loans.values('pk'))
    if scope.end_date:
        payments = payments.filter(payment_date__lte=scope.end_date)
    grouped = defaultdict(list)
    for payment in payments.iterator(chunk_size=1000):
        grouped[payment.loan_id].append(payment)
    rows, parties = [], {}
    for loan in loans.iterator(chunk_size=1000):
        errors = []
        person = loan.customer if loan.loaner_type == 'customer' else loan.vendor
        valid_party = (loan.loaner_type in ('customer', 'vendor') and person is not None
                       and not (loan.customer_id and loan.vendor_id))
        if not valid_party:
            errors.append('invalid_loan_party')
        if loan.loan_type not in ('loan_in', 'loan_out') or loan.amount <= 0:
            errors.append('invalid_loan_type_or_amount')
        if loan.source_payment_id:
            if loan.source_payment.deleted_at:
                errors.append('deleted_intermediary_payment')
            errors.append('intermediary_principal_requires_reconciliation')
        rows_paid = grouped[loan.pk]
        if any(payment.amount <= 0 for payment in rows_paid):
            errors.append('invalid_repayment_amount')
        if any(payment.payment_date < loan.loan_date for payment in rows_paid):
            errors.append('repayment_before_loan')
        paid = sum((payment.amount for payment in rows_paid), ZERO)
        closing = loan.amount - paid
        if closing < 0:
            errors.append('principal_overpaid')
        initial_cutoff = scope.start_date - timedelta(microseconds=1) if scope.start_date else None
        opening = (loan.amount - sum((payment.amount for payment in rows_paid if payment.payment_date <= initial_cutoff), ZERO)
                   if initial_cutoff and loan.loan_date <= initial_cutoff else ZERO)
        direction = Decimal('1') if loan.loan_type == 'loan_out' else Decimal('-1')
        can_attribute = valid_party and loan.loan_type in ('loan_in', 'loan_out') and loan.amount > 0
        row = dict(loan_id=loan.pk, party_type=loan.loaner_type, party_id=person.pk if person else None, can_attribute=can_attribute,
            currency_id=loan.currency, loan_type=loan.loan_type,
            origin='intermediary' if loan.source_payment_id else 'opening' if loan.is_opening_balance else 'money',
            funding_method=loan.payment_method if not loan.source_payment_id and not loan.is_opening_balance else None,
            principal=string4(loan.amount), repaid=string4(paid), opening_balance=string4(opening),
            period_change=string4(closing - opening), closing_balance=string4(closing),
            payment_ids=[payment.pk for payment in rows_paid], issues=errors)
        rows.append(row)
        if can_attribute:
            p = parties.setdefault((loan.loaner_type, person.pk, loan.currency), dict(
                party_type=loan.loaner_type, party_id=person.pk, party_name=person.name,
                currency_id=loan.currency, opening=ZERO, closing=ZERO,
                loan_out=ZERO, loan_in=ZERO, issue_count=0))
            p['opening'] += direction * opening
            p['closing'] += direction * closing
            p['loan_out' if loan.loan_type == 'loan_out' else 'loan_in'] += closing
            p['issue_count'] += len(errors)
    return dict(meta={**scope.metadata(), 'report': 'party_loan_balances', 'source': 'loans_and_repayments', 'amount_scale': 4},
        status='unverified_loan_positions', rows=rows,
        parties=[dict(party_type=p['party_type'], party_id=p['party_id'], party_name=p['party_name'], currency_id=p['currency_id'],
            opening_balance=string4(p['opening']), closing_balance=string4(p['closing']),
            period_change=string4(p['closing'] - p['opening']), loan_out_remaining=string4(p['loan_out']),
            loan_in_remaining=string4(p['loan_in']), issue_count=p['issue_count']) for p in parties.values()],
        limitations=['Native principal only; repayment FX and GL carrying values require separate reconciliation.',
                    'Negative principal remains visible with an overpayment issue; it is not silently clamped.',
                    'Opening/intermediary principal is not a new cash receipt; current edits/deletions are not reconstructed.'])


def party_position_overview(scope):
    if scope.account_id is not None:
        raise ValidationError({'account_id': 'Party overview uses linked documents, not GL filtering.'})
    customer = customer_invoice_balances(scope)
    vendor = vendor_invoice_balances(scope)
    loans = party_loan_balances(scope)
    advances = customer_advance_balances(scope)
    positions = {}

    def add(kind, pk, name, cid, component, opening, closing, issues):
        p = positions.setdefault((kind, pk, cid), dict(party_type=kind, party_id=pk, party_name=name,
            currency_id=cid, opening=ZERO, closing=ZERO, issue_count=0, components=[]))
        opening, closing = Decimal(opening), Decimal(closing)
        p['opening'] += opening
        p['closing'] += closing
        p['issue_count'] += issues
        p['components'].append(dict(kind=component, opening_balance=string4(opening), closing_balance=string4(closing)))

    for p in customer['parties']:
        add('customer', p['customer_id'], p['customer_name'], p['currency_id'], 'customer_invoices',
            p['opening_balance'], p['closing_balance'], p['issue_count'])
    for p in vendor['parties']:
        add('vendor', p['vendor_id'], p['vendor_name'], p['currency_id'], 'supplier_invoices_and_credit',
            -Decimal(p['opening_balance']), -Decimal(p['closing_balance']), p['issue_count'])
    for p in loans['parties']:
        add(p['party_type'], p['party_id'], p['party_name'], p['currency_id'], 'loan_principal',
            p['opening_balance'], p['closing_balance'], p['issue_count'])
    for p in advances['parties']:
        add('customer', p['customer_id'], p['customer_name'], p['currency_id'], 'unused_customer_credit',
            -Decimal(p['opening_balance']), -Decimal(p['closing_balance']), p['issue_count'])
    # JournalLine has no party FK. Do not infer identity from a name, code or
    # free-text description; expose the outstanding attribution work instead.
    manual_lines = JournalLine.objects.filter(gl_account__code__in=PARTY_CODES)
    if scope.currency is not None:
        manual_lines = manual_lines.filter(currency=scope.currency)
    manual = JournalEntry.objects.filter(is_auto=False, pk__in=manual_lines.values('journal_entry_id'))
    if scope.end_date:
        manual = manual.filter(entry_date__lte=scope.end_date)
    rows = [dict(party_type=p['party_type'], party_id=p['party_id'], party_name=p['party_name'], currency_id=p['currency_id'],
        opening_balance=string4(p['opening']), closing_balance=string4(p['closing']),
        period_change=string4(p['closing'] - p['opening']), components=p['components'], issue_count=p['issue_count']) for p in positions.values()]
    return dict(meta={**scope.metadata(), 'report': 'party_position_overview', 'source': 'linked_trade_documents_and_loans',
                      'amount_scale': 4, 'sign_convention': 'positive_receivable_negative_payable'},
        status='unverified_party_positions', rows=rows,
        manual_party_account_journals_not_reconciled=manual.distinct().count(),
        unattributed_loan_count=sum(not row['can_attribute'] for row in loans['rows']),
        unlinked_customer_advance_count=advances['unlinked_advance_count'],
        limitations=['Not a certified full party GL statement; manual adjustments are not attributed automatically.',
                    'Unused customer and supplier credit is included; employee balances are excluded.',
                    'Customer/vendor identities remain distinct even when numeric IDs or names match.',
                    'Combined signs are for comparison, not an automatic legal/accounting offset or new journal.'])
