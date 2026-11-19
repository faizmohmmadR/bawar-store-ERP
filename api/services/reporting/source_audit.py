"""Read-only coverage checks. Never repost sources or repair historical journals.

Coverage is deliberately distinct from amount reconciliation: a journal may
exist and still have incorrect accounts, amounts or historical rates.
"""
from collections import Counter, defaultdict
from dataclasses import dataclass
from decimal import Decimal

from django.apps import apps
from django.contrib.contenttypes.models import ContentType
from rest_framework.exceptions import ValidationError

from api.models.data.journal import JournalEntry
from api.utils.date_filters import apply_date_range


@dataclass(frozen=True)
class SourceRule:
    model: str
    date: str
    amount: str | None = None
    policy: str = 'positive'


RULES = (
    SourceRule('sales', 'sale_date', 'total_amount', 'sale'),
    SourceRule('rawmaterialpurchase', 'purchase_date', 'total_amount', 'purchase'),
    SourceRule('return', 'return_date', 'total_amount'),
    SourceRule('expense', 'expense_date', 'amount'),
    SourceRule('withdrawal', 'withdrawal_date', 'amount'),
    SourceRule('payroll', 'payment_date', 'amount', 'payroll'),
    SourceRule('payment', 'payment_date', 'amount', 'payment'),
    SourceRule('loan', 'loan_date', 'amount', 'loan'),
    SourceRule('loanpayment', 'payment_date', 'amount'),
    SourceRule('salesmancommissionpayment', 'payment_date', 'amount'),
    SourceRule('currencyexchange', 'exchange_date', 'from_amount', 'posted'),
    SourceRule('fxrevaluation', 'as_of_date', None, 'revaluation'),
    SourceRule('storagetankleak', 'recorded_at', 'total_cost_afn'),
    SourceRule('packingrun', 'created_at', None, 'internal'),
    SourceRule('stocktransfer', 'created_at', None, 'internal'),
    SourceRule('damagedmaterialrecord', 'record_date', None, 'informational'),
    SourceRule('rawmaterialprocess', 'process_date', None, 'review'),
    SourceRule('stockbottledamage', 'recorded_at', None, 'review'),
    SourceRule('inventorybatch', 'created_at', None, 'review'),
    SourceRule('stockadjustment', 'adjustment_date', None, 'review'),
    SourceRule('equipment', 'acquired_date', None, 'review'),
    SourceRule('equipmentdepreciation', 'created_at', None, 'review'),
    SourceRule('stock', 'created_at', None, 'review'),
)


def expectation(rule, source):
    """Return required/forbidden/review, without inventing historical costs."""
    if source.deleted_at is not None:
        return 'forbidden', 'deleted_source'
    if rule.policy in ('internal', 'informational'):
        return 'forbidden', rule.policy
    if rule.policy == 'review':
        return 'review', 'historical_cost_or_posting_rule_needs_review'
    if rule.policy in ('sale', 'purchase'):
        eligible = source.status not in ('draft', 'cancelled') if rule.policy == 'sale' else source.status == 'received'
        if not eligible:
            return 'forbidden', 'unposted_status'
        if source.is_free:
            # Free sales can require distribution-cost lines. Free purchases
            # have no invoice value. Neither requires invented zero-cost GL.
            return ('review', 'free_distribution_cost') if rule.policy == 'sale' else ('forbidden', 'free_purchase')
    if rule.policy == 'payroll' and (source.payment_method == 'goods' or source.source_sale_id):
        return 'forbidden', 'goods_settled_on_sale'
    if rule.policy == 'loan' and source.source_payment_id:
        return 'forbidden', 'liability_posted_on_payment'
    if rule.policy == 'payment':
        if source.general_payment_id and source.general_payment.deleted_at is not None:
            return 'forbidden', 'deleted_payment_header'
        if source.is_advance or source.is_credit_application:
            if not source.general_payment_id:
                return 'review', 'credit_payment_without_header'
            if source.is_advance and source.general_payment.source_sale_id:
                return 'forbidden', 'supplier_credit_posted_on_sale'
    if rule.policy in ('posted', 'revaluation'):
        if source.status != 'posted':
            return 'forbidden', 'unposted_status'
        if rule.policy == 'revaluation':
            return 'review', 'zero_revaluation_may_have_no_journal'
    if rule.amount and Decimal(getattr(source, rule.amount) or 0) > 0:
        return 'required', 'positive_postable_document'
    return 'review', 'zero_value_requires_cost_review'


def source_coverage(scope):
    if scope.account_id is not None or scope.currency is not None:
        raise ValidationError({'filters': 'Source coverage supports date filters only; account/currency filters could hide missing journals.'})
    # Reading ContentType directly avoids get_for_model creating rows on GET.
    content_types = {ct.model: ct for ct in ContentType.objects.filter(app_label='api')}
    rules = {rule.model: rule for rule in RULES}
    findings, summaries = [], []
    seen_sources = set()
    journals_by_source = defaultdict(list)
    # Include pre-period journals so a correctly linked source is not falsely
    # marked missing just because its journal has the wrong effective date.
    journals = JournalEntry.objects.select_related('content_type').all()
    if scope.end_date:
        journals = journals.filter(entry_date__lte=scope.end_date)
    for entry in journals.iterator(chunk_size=1000):
        journals_by_source[(entry.content_type_id, entry.object_id)].append(entry)

    def issue(kind, model=None, source_id=None, journal_ids=(), reason=None):
        findings.append({'kind': kind, 'source_model': model, 'source_id': source_id,
                         'journal_ids': list(journal_ids), 'reason': reason})

    for rule in RULES:
        model = apps.get_model('api', rule.model)
        sources = apply_date_range(model.all_objects.all(), rule.date, scope.start_date, scope.end_date)
        if rule.model == 'payment':
            sources = sources.select_related('general_payment')
        counts = Counter()
        ct = content_types.get(rule.model)
        for source in sources.iterator(chunk_size=1000):
            key = (ct.pk if ct else None, source.pk)
            seen_sources.add(key)
            entries = journals_by_source.get(key, []) if ct else []
            policy, reason = expectation(rule, source)
            counts['source_count'] += 1
            counts[policy] += 1
            counts['with_journal' if entries else 'without_journal'] += 1
            ids = [entry.pk for entry in entries]
            if policy == 'required' and not entries:
                issue('missing_journal', rule.model, source.pk, reason=reason)
            elif policy == 'forbidden' and entries:
                issue('unexpected_journal', rule.model, source.pk, ids, reason)
            elif policy == 'review':
                issue('source_requires_review', rule.model, source.pk, ids, reason)
            # Main sale, commission and equipment depreciation can legitimately
            # share a source. Repeated references (including multiple blanks)
            # need review; distinct references are not assumed duplicates.
            refs = defaultdict(list)
            for entry in entries:
                refs[entry.reference_number or ''].append(entry.pk)
                actual = getattr(source, rule.date)
                actual_day = actual.astimezone(scope_timezone()).date() if hasattr(actual, 'hour') else actual
                if entry.entry_date.astimezone(scope_timezone()).date() != actual_day and policy == 'required':
                    issue('source_journal_date_mismatch', rule.model, source.pk, [entry.pk])
            for reference, duplicates in refs.items():
                if len(duplicates) > 1:
                    issue('possible_duplicate_journal', rule.model, source.pk, duplicates,
                          None if reference else 'multiple_unreferenced_journals')
        summaries.append({'source_model': rule.model, **{key: counts[key] for key in (
            'source_count', 'required', 'forbidden', 'review', 'with_journal', 'without_journal',
        )}})

    # Inspect links in the journal-period too, independently of source dates.
    # Grouped resolution keeps this bounded by model count rather than journal count.
    unresolved = defaultdict(list)
    for key, entries in journals_by_source.items():
        if key in seen_sources:
            continue
        in_period = [entry for entry in entries if not scope.start_date or entry.entry_date >= scope.start_date]
        if not in_period:
            continue
        ct_id, object_id = key
        entry = in_period[0]
        if not ct_id or object_id is None:
            for row in in_period:
                if row.is_auto and not row.is_closing_entry:
                    issue('automatic_journal_without_source', journal_ids=[row.pk])
            continue
        ct = entry.content_type
        model = ct.model_class()
        if model is None:
            issue('unresolvable_source_model', ct.model, object_id, [row.pk for row in in_period])
            continue
        unresolved[model].append((object_id, in_period))
    for model, groups in unresolved.items():
        manager = getattr(model, 'all_objects', model._default_manager)
        sources = manager.in_bulk([key for key, _ in groups])
        for pk, entries in groups:
            source = sources.get(pk)
            ids = [entry.pk for entry in entries]
            if source is None:
                issue('missing_source', model._meta.model_name, pk, ids)
            elif getattr(source, 'deleted_at', None) is not None:
                issue('deleted_source', model._meta.model_name, pk, ids)
            elif model._meta.app_label != 'api' or model._meta.model_name not in rules:
                issue('unsupported_source_rule', model._meta.model_name, pk, ids)
            else:
                rule = rules[model._meta.model_name]
                policy, reason = expectation(rule, source)
                if policy == 'forbidden':
                    issue('unexpected_journal', rule.model, pk, ids, reason)
                actual = getattr(source, rule.date)
                actual_day = actual.astimezone(scope_timezone()).date() if hasattr(actual, 'hour') else actual
                if scope.end_date and actual_day > scope.end_date.astimezone(scope_timezone()).date():
                    issue('source_after_cutoff', rule.model, pk, ids)
    return {
        'meta': {**scope.metadata(), 'report': 'source_coverage', 'source': 'documents_and_journal_links'},
        'status': 'review_required' if findings else 'coverage_checks_passed',
        'summaries': summaries, 'finding_count': len(findings),
        'counts_by_kind': dict(Counter(row['kind'] for row in findings)), 'findings': findings,
        'limitations': [
            'Presence of a journal does not certify its amounts or accounts.',
            'Current source state is used; deleted/edited history cannot be reconstructed.',
            'Review policies do not assert that a journal is missing.',
        ],
    }


def scope_timezone():
    from api.services.report_period import get_report_timezone
    return get_report_timezone()
