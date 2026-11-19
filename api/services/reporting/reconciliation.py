"""Independent expected postings for simple documents; never repairs the GL."""
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from django.contrib.contenttypes.models import ContentType
from rest_framework.exceptions import ValidationError

from api.models.data.expenses import Expense
from api.models.data.withdrawal import Withdrawal
from api.models.data.journal import JournalLine
from api.models.data.raw_materials import RawMaterialPurchase
from api.models.data.payroll import Payroll
from api.models.data.payment import Payment
from api.models.data.returns import Return
from api.models.data.sales import Sales
from api.utils.date_filters import apply_date_range
from .contracts import money

ZERO = Decimal('0')
CENT = Decimal('0.01')
METHOD_CODES = {'cash': '1000', 'bank': '1050', 'sarafi': '1060'}
SUPPORTED = ['expense', 'withdrawal', 'rawmaterialpurchase', 'payroll']


def _goods_errors(source, own_lines, sale_lines, returns, return_lines, has_payment, scope):
    errors = []
    sale = source.source_sale
    if own_lines:
        errors.append('unexpected_payroll_posting')
    if source.payment_method != 'goods' or sale is None:
        return errors + ['invalid_goods_sale_link']
    if (source.amount <= 0 or source.exchange_rate is None or source.exchange_rate <= 0
            or (source.currency == 1 and source.exchange_rate != 1)):
        errors.append('invalid_goods_source_amount_or_rate')
    elif source.amount_base != (source.amount * source.exchange_rate).quantize(CENT, rounding=ROUND_HALF_UP):
        errors.append('source_base_amount_mismatch')
    if (sale.deleted_at is not None or sale.status in ('draft', 'cancelled') or sale.is_free
            or sale.employee_id != source.employee_id or sale.customer_id or sale.vendor_id):
        errors.append('invalid_goods_sale_link')
    if scope.end_date and sale.sale_date > scope.end_date:
        errors.append('goods_sale_after_cutoff')
    returned = sum((row.total_amount for row in returns), ZERO)
    expected_settlement = sale.total_amount - returned
    expected_base = (expected_settlement * sale.exchange_rate).quantize(CENT, rounding=ROUND_HALF_UP)
    if (source.currency != sale.currency or source.exchange_rate != sale.exchange_rate
            or source.amount != expected_settlement.quantize(CENT, rounding=ROUND_HALF_UP)
            or source.amount_base != expected_base
            or source.net_salary != source.amount or source.net_salary_base != source.amount_base
            or source.payroll_type != 'salary'):
        errors.append('goods_settlement_snapshot_mismatch')
    if (sale.paid_amount.quantize(CENT, rounding=ROUND_HALF_UP) != expected_settlement.quantize(CENT, rounding=ROUND_HALF_UP)
            or sale.paid_amount_base.quantize(CENT, rounding=ROUND_HALF_UP) != expected_base):
        errors.append('goods_sale_not_fully_settled')
    if has_payment:
        errors.append('unexpected_goods_sale_payment')
    if not sale_lines:
        errors.append('missing_goods_sale_posting')
    wage, revenue = [ZERO] * 4, [ZERO] * 4
    for line in sale_lines:
        code = line.gl_account.code
        if code in METHOD_CODES.values():
            errors.append('cash_movement_on_goods_sale')
        if code not in ('5100', '4000'):
            # COGS/inventory and commission are checked by their own rules.
            if code not in ('5200', '1100', '5250', '2200'):
                errors.append('unexpected_goods_sale_account')
            continue
        if line.gl_account.category != ('expense' if code == '5100' else 'revenue') or line.gl_account.deleted_at:
            errors.append('unexpected_account')
        if line.currency != source.currency or line.exchange_rate != source.exchange_rate or line.needs_rate_review:
            errors.append('goods_line_currency_or_rate_mismatch')
        if line.base_debit is None or line.base_credit is None:
            errors.append('unknown_base_amount')
        target = wage if code == '5100' else revenue
        for index, value in enumerate((line.debit, line.credit, line.base_debit, line.base_credit)):
            target[index] += value or ZERO
    sale_amount = sale.total_amount.quantize(CENT, rounding=ROUND_HALF_UP)
    sale_base = sale.total_amount_base.quantize(CENT, rounding=ROUND_HALF_UP)
    if wage != [sale_amount, ZERO, sale_base, ZERO] or revenue != [ZERO, sale_amount, ZERO, sale_base]:
        errors.append('goods_wage_revenue_mismatch')
    for returned_doc in returns:
        lines = return_lines[returned_doc.pk]
        expected_amount = returned_doc.total_amount.quantize(CENT, rounding=ROUND_HALF_UP)
        expected_base = returned_doc.total_amount_base.quantize(CENT, rounding=ROUND_HALF_UP)
        buckets = defaultdict(lambda: [ZERO] * 4)
        if (returned_doc.currency != sale.currency or returned_doc.refund_amount != ZERO
                or returned_doc.exchange_rate is None or returned_doc.exchange_rate <= ZERO):
            errors.append('invalid_employee_goods_return')
        if expected_base != (expected_amount * returned_doc.exchange_rate).quantize(CENT, rounding=ROUND_HALF_UP):
            errors.append('employee_return_base_amount_mismatch')
        for line in lines:
            code = line.gl_account.code
            if code in METHOD_CODES.values() or code == '1200':
                errors.append('cash_or_receivable_on_employee_goods_return')
            if code not in ('4100', '5100', '5200', '1100'):
                errors.append('unexpected_employee_goods_return_account')
            if code in ('4100', '5100'):
                if line.currency != returned_doc.currency or line.exchange_rate != returned_doc.exchange_rate or line.needs_rate_review:
                    errors.append('employee_return_line_currency_or_rate_mismatch')
                for index, value in enumerate((line.debit, line.credit, line.base_debit, line.base_credit)):
                    buckets[code][index] += value or ZERO
        if not lines:
            errors.append('missing_employee_goods_return_posting')
        if (buckets['4100'] != [expected_amount, ZERO, expected_base, ZERO]
                or buckets['5100'] != [ZERO, expected_amount, ZERO, expected_base]):
            errors.append('employee_goods_return_posting_mismatch')
    return errors


def reconcile_documents(scope):
    if scope.account_id is not None:
        raise ValidationError({'account_id': 'Document reconciliation must inspect all sides of a posting.'})
    findings, counts = [], {'checked': 0, 'matched': 0, 'mismatched': 0, 'requires_review': 0}
    types = dict(ContentType.objects.filter(app_label='api', model__in=SUPPORTED + ['sales', 'return']).values_list('model', 'pk'))
    specs = (
        (Expense, 'expense_date', 'amount', 'amount_base', '5000', 'expense'),
        (Withdrawal, 'withdrawal_date', 'amount', 'amount_base', '3100', 'equity'),
        (RawMaterialPurchase, 'purchase_date', 'total_amount', 'total_amount_base', '1100', 'asset'),
        (Payroll, 'payment_date', 'amount', 'amount_base', '5100', 'expense'),
    )
    for model, date, amount_field, base_field, debit_code, debit_category in specs:
        sources = apply_date_range(model.objects.all(), date, scope.start_date, scope.end_date)
        if scope.currency is not None:
            sources = sources.filter(currency=scope.currency)
        if model is Withdrawal:
            sources = sources.select_related('gl_account')
        if model is Payroll:
            sources = sources.select_related('source_sale')
        ct = types.get(model._meta.model_name)
        lines = JournalLine.objects.filter(
            journal_entry__content_type_id=ct,
            journal_entry__object_id__in=sources.values('pk'),
            journal_entry__deleted_at__isnull=True,
        ).select_related('gl_account', 'journal_entry') if ct else JournalLine.objects.none()
        if scope.end_date:
            lines = lines.filter(journal_entry__entry_date__lte=scope.end_date)
        grouped = defaultdict(list)
        for line in lines.iterator(chunk_size=1000):
            grouped[line.journal_entry.object_id].append(line)
        sale_grouped, return_grouped, goods_returns, goods_payments = defaultdict(list), defaultdict(list), defaultdict(list), set()
        if model is Payroll and types.get('sales'):
            sale_ids = sources.exclude(source_sale_id=None).values('source_sale_id')
            sale_lines = JournalLine.objects.filter(
                journal_entry__content_type_id=types['sales'], journal_entry__object_id__in=sale_ids,
                journal_entry__deleted_at__isnull=True,
            ).select_related('gl_account', 'journal_entry')
            payments = Payment.objects.filter(content_type_id=types['sales'], object_id__in=sale_ids)
            if scope.end_date:
                sale_lines = sale_lines.filter(journal_entry__entry_date__lte=scope.end_date)
                payments = payments.filter(payment_date__lte=scope.end_date)
            for line in sale_lines.iterator(chunk_size=1000):
                sale_grouped[line.journal_entry.object_id].append(line)
            return_docs = Return.objects.filter(sales_id__in=sale_ids)
            if scope.end_date:
                return_docs = return_docs.filter(return_date__lte=scope.end_date)
            if types.get('return'):
                return_journal_lines = JournalLine.objects.filter(
                    journal_entry__content_type_id=types['return'],
                    journal_entry__object_id__in=return_docs.values('pk'),
                    journal_entry__deleted_at__isnull=True,
                ).select_related('gl_account', 'journal_entry')
                if scope.end_date:
                    return_journal_lines = return_journal_lines.filter(journal_entry__entry_date__lte=scope.end_date)
                for line in return_journal_lines.iterator(chunk_size=1000):
                    return_grouped[line.journal_entry.object_id].append(line)
            for returned_doc in return_docs.iterator(chunk_size=1000):
                goods_returns[returned_doc.sales_id].append(returned_doc)
            goods_payments = set(payments.values_list('object_id', flat=True))
        for source in sources.iterator(chunk_size=1000):
            counts['checked'] += 1
            errors = []
            raw_amount = Decimal(getattr(source, amount_field))
            amount = raw_amount.quantize(CENT, rounding=ROUND_HALF_UP)
            rate = source.exchange_rate
            actual = grouped[source.pk]
            goods = model is Payroll and (source.payment_method == 'goods' or source.source_sale_id)
            no_posting = model is RawMaterialPurchase and (source.status != 'received' or source.is_free or amount == 0)
            credit_code = '2000' if model is RawMaterialPurchase else METHOD_CODES.get(source.payment_method)
            credit_category = 'liability' if model is RawMaterialPurchase else 'asset'
            expected_debit = '1300' if model is Payroll and source.payroll_type == 'advance' else debit_code
            expected_category = 'asset' if expected_debit == '1300' else debit_category
            if goods or no_posting:
                if goods:
                    returns = goods_returns[source.source_sale_id]
                    errors += _goods_errors(source, actual, sale_grouped[source.source_sale_id], returns,
                                            return_grouped, source.source_sale_id in goods_payments, scope)
                elif actual:
                    errors.append('unexpected_purchase_posting')
                if no_posting and source.is_free and source.total_amount != 0:
                    errors.append('free_purchase_nonzero_amount')
                counts['mismatched' if errors else 'matched'] += 1
                if errors:
                    findings.append({'source_model': model._meta.model_name, 'source_id': source.pk,
                                     'kind': 'posting_mismatch', 'errors': sorted(set(errors))})
                continue
            if model is Payroll and (source.net_salary != source.amount or source.net_salary_base != source.amount_base):
                errors.append('payroll_amount_net_mismatch')
            credit_id = source.gl_account_id if model is Withdrawal else None
            if model is Withdrawal and (
                source.gl_account.code != credit_code
                or source.gl_account.currency not in (None, source.currency)
                or source.gl_account.category != 'asset'
                or source.gl_account.deleted_at is not None
            ):
                errors.append('invalid_source_cash_account')
            if amount <= 0 or rate is None or rate <= 0 or (source.currency == 1 and rate != 1) or credit_code is None:
                counts['requires_review'] += 1
                findings.append({'source_model': model._meta.model_name, 'source_id': source.pk, 'kind': 'invalid_source', 'errors': ['Source amount, rate or payment method is invalid.']})
                continue
            base = (amount * rate).quantize(CENT, rounding=ROUND_HALF_UP)
            source_base = (raw_amount * rate).quantize(CENT, rounding=ROUND_HALF_UP)
            if Decimal(getattr(source, base_field)).quantize(CENT, rounding=ROUND_HALF_UP) != source_base:
                errors.append('source_base_amount_mismatch')
            if source_base != base:
                errors.append('source_ledger_rounding_difference')
            if not actual:
                errors.append('missing_posting')
            totals = defaultdict(lambda: [ZERO, ZERO, ZERO, ZERO])
            for line in actual:
                is_debit_role = line.gl_account.code == expected_debit and line.gl_account.category == expected_category
                is_credit_role = (
                    line.gl_account_id == credit_id if credit_id is not None
                    else line.gl_account.code == credit_code and (model is RawMaterialPurchase or line.gl_account.currency in (None, source.currency))
                ) and line.gl_account.category == credit_category
                role = 'debit' if is_debit_role else 'credit' if is_credit_role else 'unexpected'
                if role == 'unexpected' or line.gl_account.deleted_at is not None:
                    errors.append('unexpected_account')
                if line.currency != source.currency:
                    errors.append('line_currency_mismatch')
                if line.exchange_rate != rate or line.needs_rate_review:
                    errors.append('line_rate_mismatch')
                if line.base_debit is None or line.base_credit is None:
                    errors.append('unknown_base_amount')
                for index, value in enumerate((line.debit, line.credit, line.base_debit, line.base_credit)):
                    totals[role][index] += value or ZERO
            expected = {'debit': [amount, ZERO, base, ZERO], 'credit': [ZERO, amount, ZERO, base]}
            for role, values in expected.items():
                if totals[role] != values:
                    errors.append(f'{role}_amount_mismatch')
            if errors:
                counts['mismatched'] += 1
                findings.append({
                    'source_model': model._meta.model_name, 'source_id': source.pk,
                    'kind': 'posting_mismatch', 'errors': sorted(set(errors)),
                    'journal_ids': sorted({line.journal_entry_id for line in actual}),
                    'expected_amount': money(amount), 'expected_base_amount': money(base),
                })
            else:
                counts['matched'] += 1
    return {
        'meta': {**scope.metadata(), 'report': 'document_reconciliation', 'source': 'documents_and_journal_lines'},
        'status': 'review_required' if findings else 'supported_documents_matched',
        'supported_models': SUPPORTED, 'counts': counts, 'findings': findings,
        'limitations': ['Expenses, withdrawals, purchase recognition and payroll settlements are covered; purchase payment allocation is not.',
                        'Goods payroll checks the linked wage/revenue legs and employee-goods returns; it does not certify sale COGS or commission.',
                        'Payroll accrual/entitlement is not certified by settlement reconciliation.',
                        'Matching recorded documents does not certify missing business events or historical edits.'],
    }
