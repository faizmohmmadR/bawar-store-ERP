"""Independent recognition/settlement checks; never invoke posting services.

Revenue recognition is checked separately from COGS. Payments are compared at
invoice carrying rates and payment rates, with explicit realized FX. A credit
application is not another cash receipt, nor is a supplier goods credit.
"""
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
from rest_framework.exceptions import ValidationError

from api.models.data.journal import JournalLine
from api.models.data.sales import Sales
from api.models.data.raw_materials import RawMaterialPurchase
from api.models.data.payment import Payment, GeneralPayment
from api.models.data.loan import Loan, LoanPayment
from api.utils.date_filters import apply_date_range

ZERO = Decimal('0')
METHODS = {'cash': '1000', 'bank': '1050', 'sarafi': '1060'}
CATEGORIES = {'1000': 'asset', '1050': 'asset', '1060': 'asset', '1200': 'asset',
              '1310': 'asset', '1320': 'asset', '2000': 'liability', '2100': 'liability',
              '2300': 'liability', '3000': 'equity', '4000': 'revenue', '4100': 'revenue', '5100': 'expense',
              '4300': 'revenue', '5350': 'expense'}


def q(value):
    return Decimal(value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def rate(source, currency):
    value = source.exchange_rate
    if value is None or value <= 0 or (currency == 1 and value != 1):
        raise ValueError('invalid_historical_rate')
    return value


def leg(code, cid, amount, fx, debit):
    value = q(amount)
    base = q(value * fx)
    return (code, cid, value if debit else ZERO, ZERO if debit else value,
            base if debit else ZERO, ZERO if debit else base, fx)


def settled_legs(code, monetary, cid, amount, carrying, settlement, received):
    expected = [leg(code, cid, amount, settlement, received),
                leg(monetary, cid, amount, carrying, not received)]
    # Positive gap needs a credit; negative gap needs a debit in AFN.
    gap = q(q(amount) * settlement) - q(q(amount) * carrying)
    gap = gap if received else -gap
    if gap:
        expected.append(leg('4300' if gap > 0 else '5350', 1, abs(gap), Decimal('1'), gap < 0))
    return expected


def compare(lines, expected, ignored_codes=()):
    errors, actual, wanted = [], defaultdict(lambda: [ZERO] * 4), defaultdict(lambda: [ZERO] * 4)
    rates = defaultdict(set)
    for code, cid, dr, cr, bd, bc, fx in expected:
        for i, value in enumerate((dr, cr, bd, bc)):
            wanted[(code, cid)][i] += value
        rates[(code, cid)].add(fx)
    for line in lines:
        code = line.gl_account.code
        if code in ignored_codes:
            continue
        key = (code, line.currency)
        if key not in wanted or line.gl_account.category != CATEGORIES.get(code) or line.gl_account.deleted_at:
            errors.append('unexpected_account_or_currency')
        if code in METHODS.values() and line.gl_account.currency not in (None, line.currency):
            errors.append('cash_account_currency_mismatch')
        if line.exchange_rate not in rates.get(key, set()) or line.needs_rate_review:
            errors.append('line_rate_mismatch')
        if line.base_debit is None or line.base_credit is None:
            errors.append('unknown_base_amount')
        for i, value in enumerate((line.debit, line.credit, line.base_debit, line.base_credit)):
            actual[key][i] += value or ZERO
    if dict(actual) != dict(wanted):
        errors.append('posting_amount_or_direction_mismatch')
    return errors


def reconcile_settlements(scope):
    if scope.account_id is not None:
        raise ValidationError({'account_id': 'Settlement reconciliation requires all posting sides.'})
    types = dict(ContentType.objects.filter(app_label='api').values_list('model', 'pk'))
    dates = {Sales: 'sale_date', Payment: 'payment_date', GeneralPayment: 'payment_date',
             Loan: 'loan_date', LoanPayment: 'payment_date'}
    selections = {}
    for model, date in dates.items():
        rows = apply_date_range(model.objects.all(), date, scope.start_date, scope.end_date)
        if scope.currency is not None:
            rows = rows.filter(**{'loan__currency' if model is LoanPayment else 'currency': scope.currency})
        selections[model] = rows
    journals = defaultdict(list)
    for model, rows in selections.items():
        if model is GeneralPayment:
            continue  # Receipt header owns allocations, not a second journal.
        ct = types.get(model._meta.model_name)
        if ct is None:
            continue
        lines = JournalLine.objects.filter(journal_entry__content_type_id=ct,
            journal_entry__object_id__in=rows.values('pk'), journal_entry__deleted_at__isnull=True)
        if scope.end_date:
            lines = lines.filter(journal_entry__entry_date__lte=scope.end_date)
        for line in lines.select_related('journal_entry', 'gl_account').iterator(chunk_size=1000):
            journals[(model, line.journal_entry.object_id)].append(line)
    # Resolve GFK targets in batches, including deleted records for diagnostics.
    payments = selections[Payment].select_related('general_payment', 'general_payment__source_sale')
    orders = {}
    for model in (Sales, RawMaterialPurchase, GeneralPayment):
        ct = types.get(model._meta.model_name)
        if ct is not None:
            ids = payments.filter(content_type_id=ct).values('object_id')
            orders.update({(ct, pk): obj for pk, obj in model.all_objects.filter(pk__in=ids).in_bulk().items()})
    finding_map, outcomes = {}, {}

    def record(model, source, errors, review=False):
        key = (model, source.pk)
        outcome = 'requires_review' if review else 'mismatched' if errors else 'matched'
        rank = {'matched': 0, 'requires_review': 1, 'mismatched': 2}
        previous = outcomes.get(key, 'matched')
        outcomes[key] = outcome if rank[outcome] >= rank[previous] else previous
        if errors or review:
            prior = finding_map.get(key, {}).get('errors', [])
            finding_map[key] = {'source_model': model._meta.model_name, 'source_id': source.pk,
                               'kind': 'requires_review' if outcomes[key] == 'requires_review' else 'settlement_mismatch',
                               'errors': sorted(set(prior + errors)),
                               'journal_ids': sorted({line.journal_entry_id for line in journals[key]})}

    for sale in selections[Sales].iterator(chunk_size=1000):
        lines = journals[(Sales, sale.pk)]
        if sale.status in ('draft', 'cancelled'):
            record(Sales, sale, ['unexpected_unposted_sale_journal'] if lines else [])
            continue
        if sale.is_free or sale.vendor_transaction == 'purchase_return':
            # Cost-only distribution and supplier-return valuation need inventory provenance.
            errors = ['cash_on_noncash_sale'] if any(line.gl_account.code in METHODS.values() for line in lines) else []
            if sale.is_free and sale.total_amount != 0:
                errors.append('free_sale_nonzero_amount')
            record(Sales, sale, errors + ['inventory_cost_review_required'], review=True)
            continue
        try:
            fx = rate(sale, sale.currency)
            if sale.total_amount <= 0:
                raise ValueError('invalid_sale_amount')
            debit = '5100' if sale.employee_id else '1320' if sale.vendor_id else '1200'
            expected = [leg(debit, sale.currency, sale.total_amount, fx, True),
                        leg('4000', sale.currency, sale.total_amount, fx, False)]
            errors = compare(lines, expected, ignored_codes=('5200', '1100', '5250', '2200'))
            if q(sale.total_amount_base) != q(sale.total_amount * fx):
                errors.append('source_base_amount_mismatch')
            if q(sale.total_amount * fx) != q(q(sale.total_amount) * fx):
                errors.append('source_ledger_rounding_difference')
            record(Sales, sale, errors)
        except ValueError as exc:
            record(Sales, sale, [str(exc)], review=True)

    for payment in payments.iterator(chunk_size=1000):
        errors, expected = [], []
        target = orders.get((payment.content_type_id, payment.object_id))
        try:
            if target is None or target.deleted_at is not None:
                raise ValueError('missing_or_deleted_payment_target')
            if payment.amount <= 0:
                raise ValueError('invalid_payment_amount')
            fx = rate(payment, payment.currency)
            if q(payment.amount_base) != q(payment.amount * fx):
                errors.append('payment_base_snapshot_mismatch')
            sale = payment.payment_type == 'sale'
            monetary, advance = ('1200', '2300') if sale else ('2000', '1320')
            header = payment.general_payment
            if payment.is_advance or payment.is_credit_application:
                if header is None or header.deleted_at is not None:
                    raise ValueError('missing_or_deleted_credit_header')
                if header.currency != payment.currency or header.payment_type != payment.payment_type:
                    errors.append('credit_header_currency_or_type_mismatch')
                if header.payment_date > payment.payment_date:
                    errors.append('application_before_credit_receipt')
                if payment.is_advance and payment.is_credit_application:
                    errors.append('conflicting_payment_flags')
            if payment.is_advance:
                if not isinstance(target, GeneralPayment) or header.pk != target.pk:
                    raise ValueError('invalid_advance_target')
                if header.source_sale_id:
                    origin = header.source_sale
                    if origin.deleted_at or origin.status in ('draft', 'cancelled') or origin.vendor_id != header.vendor_id:
                        errors.append('invalid_supplier_goods_credit')
                else:
                    cash = METHODS.get(payment.payment_method)
                    if cash is None:
                        raise ValueError('invalid_cash_method')
                    expected = [leg(cash, payment.currency, payment.amount, fx, sale),
                                leg(advance, payment.currency, payment.amount, fx, not sale)]
            else:
                if not isinstance(target, Sales if sale else RawMaterialPurchase):
                    raise ValueError('wrong_payment_target_type')
                if target.currency != payment.currency:
                    errors.append('payment_target_currency_mismatch')
                if sale and (target.status in ('draft', 'cancelled') or target.employee_id or target.vendor_id or target.is_free):
                    errors.append('invalid_customer_payment_target')
                if not sale and target.status != 'received':
                    # Existing direct prepayments lack AP recognition; do not certify them.
                    raise ValueError('unreceived_purchase_payment_requires_review')
                if payment.is_credit_application:
                    if (header.customer_id if sale else header.vendor_id) != (target.customer_id if sale else target.vendor_id):
                        errors.append('credit_application_party_mismatch')
                    cash = advance
                elif payment.payment_method == 'intermediary_credit':
                    raise ValueError('legacy_intermediary_credit_requires_review')
                else:
                    cash = METHODS.get(payment.payment_method)
                    if cash is None:
                        raise ValueError('invalid_cash_method')
                expected = settled_legs(cash, monetary, payment.currency, payment.amount,
                                        rate(target, payment.currency), fx, sale)
            errors += compare(journals[(Payment, payment.pk)], expected)
            record(Payment, payment, errors)
        except ValueError as exc:
            record(Payment, payment, errors + [str(exc)], review=True)

    # Gross-invoice cap only; net receivables after returns/refunds are not yet
    # certified. Retained advances are excluded until explicitly applied.
    for model, kind, date_field in ((Sales, 'sale', 'sale_date'), (RawMaterialPurchase, 'purchase', 'purchase_date')):
        ct = types.get(model._meta.model_name)
        if ct is None:
            continue
        selected = apply_date_range(model.objects.all(), date_field, scope.start_date, scope.end_date)
        invoices = model.objects.filter(
            Q(pk__in=selected.values('pk'))
            | Q(pk__in=payments.filter(content_type_id=ct).values('object_id'))
        )
        if scope.currency is not None:
            invoices = invoices.filter(currency=scope.currency)
        if scope.end_date:
            invoices = invoices.filter(**{f'{date_field}__lte': scope.end_date})
        invoice_payments = Payment.objects.filter(content_type_id=ct, object_id__in=invoices.values('pk'),
                                                  payment_type=kind, is_advance=False)
        if scope.end_date:
            invoice_payments = invoice_payments.filter(payment_date__lte=scope.end_date)
        paid = defaultdict(lambda: ZERO)
        for payment in invoice_payments.iterator(chunk_size=1000):
            paid[(payment.object_id, payment.currency)] += payment.amount
        for invoice in invoices.iterator(chunk_size=1000):
            if paid[(invoice.pk, invoice.currency)] > q(invoice.total_amount):
                record(model, invoice, ['invoice_overallocated'])

    # Receipt allocation checks use ALL allocations through cutoff, even if an
    # allocation predates the selected period; applying credit cannot create it.
    headers = GeneralPayment.objects.filter(
        Q(pk__in=selections[GeneralPayment].values('pk'))
        | Q(pk__in=payments.exclude(general_payment_id=None).values('general_payment_id'))
    )
    allocations = Payment.objects.filter(general_payment_id__in=headers.values('pk'))
    if scope.end_date:
        allocations = allocations.filter(payment_date__lte=scope.end_date)
    allocated = defaultdict(list)
    for payment in allocations.iterator(chunk_size=1000):
        allocated[payment.general_payment_id].append(payment)
    for header in headers.iterator(chunk_size=1000):
        rows, errors = allocated[header.pk], []
        receipts = sum((p.amount for p in rows if p.is_advance and not p.is_credit_application), ZERO)
        applications = sum((p.amount for p in rows if p.is_credit_application), ZERO)
        if any(p.currency != header.currency or p.payment_type != header.payment_type
               or p.amount <= 0 or p.is_advance == p.is_credit_application for p in rows):
            errors.append('invalid_receipt_allocation')
        if sum(p.is_advance and not p.is_credit_application for p in rows) != 1:
            errors.append('receipt_allocation_count_mismatch')
        if receipts != header.amount:
            errors.append('receipt_allocation_amount_mismatch')
        if applications > receipts:
            errors.append('credit_overapplied')
        record(GeneralPayment, header, errors)

    loan_rows = selections[Loan].select_related('source_payment')
    for loan in loan_rows.iterator(chunk_size=1000):
        try:
            expected, errors = [], []
            if loan.loan_type not in ('loan_in', 'loan_out') or loan.amount <= 0:
                raise ValueError('invalid_loan_principal_or_type')
            fx = rate(loan, loan.currency)
            receivable, payable = ('1200', '2000') if loan.loaner_type == 'customer' else ('1310', '2100')
            if loan.source_payment_id:
                errors = ['intermediary_principal_requires_review']
                if journals[(Loan, loan.pk)]:
                    errors.append('unexpected_intermediary_loan_posting')
                record(Loan, loan, errors, review=True)
                continue
            incoming = loan.loan_type == 'loan_in'
            cash = '3000' if loan.is_opening_balance else METHODS.get(loan.payment_method)
            if cash is None:
                raise ValueError('invalid_cash_method')
            expected = [leg(cash if incoming else receivable, loan.currency, loan.amount, fx, True),
                        leg(payable if incoming else cash, loan.currency, loan.amount, fx, False)]
            errors += compare(journals[(Loan, loan.pk)], expected)
            if q(loan.amount_base) != q(loan.amount * fx):
                errors.append('source_base_amount_mismatch')
            record(Loan, loan, errors)
        except ValueError as exc:
            record(Loan, loan, [str(exc)], review=True)
    for payment in selections[LoanPayment].select_related('loan').iterator(chunk_size=1000):
        try:
            loan = payment.loan
            # LoanPayment inherits its native currency from Loan; unlike trade
            # Payment it has no independent currency column.
            if loan.deleted_at or payment.amount <= 0:
                raise ValueError('invalid_loan_payment_target_or_amount')
            if payment.payment_date < loan.loan_date:
                raise ValueError('loan_payment_before_principal')
            cash = METHODS.get(payment.payment_method)
            if cash is None:
                raise ValueError('invalid_cash_method')
            received = loan.loan_type == 'loan_out'
            monetary = ('1200' if received else '2000') if loan.loaner_type == 'customer' else ('1310' if received else '2100')
            fx = rate(payment, loan.currency)
            expected = settled_legs(cash, monetary, loan.currency, payment.amount,
                                    rate(loan, loan.currency), fx, received)
            errors = compare(journals[(LoanPayment, payment.pk)], expected)
            if q(payment.amount_base) != q(payment.amount * fx):
                errors.append('payment_base_snapshot_mismatch')
            record(LoanPayment, payment, errors)
        except ValueError as exc:
            record(LoanPayment, payment, [str(exc)], review=True)
    # Principal is not a payment-date FX value. Include older loans referenced
    # by this period's repayments and exclude repayments after the cutoff.
    loans_to_check = Loan.objects.filter(
        Q(pk__in=selections[Loan].values('pk'))
        | Q(pk__in=selections[LoanPayment].values('loan_id'))
    )
    repayments = LoanPayment.objects.filter(loan_id__in=loans_to_check.values('pk'))
    if scope.end_date:
        repayments = repayments.filter(payment_date__lte=scope.end_date)
    paid = defaultdict(lambda: ZERO)
    for payment in repayments.iterator(chunk_size=1000):
        paid[payment.loan_id] += payment.amount
    for loan in loans_to_check.iterator(chunk_size=1000):
        if paid[loan.pk] > loan.amount:
            record(Loan, loan, ['principal_overpaid'])
    findings = list(finding_map.values())
    counts = {'checked': len(outcomes), **{name: sum(value == name for value in outcomes.values())
               for name in ('matched', 'mismatched', 'requires_review')}}
    return {
        'meta': {**scope.metadata(), 'report': 'settlement_reconciliation', 'source': 'documents_and_journal_lines'},
        'status': 'review_required' if findings else 'supported_components_matched',
        'counts': counts, 'findings': findings,
        'limitations': ['Sale revenue legs only: COGS, commissions and item totals are not certified.',
                        'Returns, invoice outstanding balances and intermediary-credit principal need separate reconciliation.',
                        'Current document state cannot reconstruct edits/deletions as of a historical cutoff.'],
    }
