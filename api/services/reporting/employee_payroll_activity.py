"""Read-only employee pay events and guarded monthly balance estimates."""
from collections import defaultdict
from datetime import datetime, time
from decimal import Decimal

from rest_framework.exceptions import ValidationError

from api.models.data.currency import CURRENCY_DEFINITIONS
from api.models.data.employee_pay_entries import EmployeeAbsenceEntry, EmployeeOvertimeEntry
from api.models.data.payroll import Payroll
from api.services.report_period import get_report_timezone
from .contracts import money

ZERO = Decimal('0')


def _day_in_scope(day, scope):
    # Day entries have no time of day. Include them if their business day
    # overlaps the requested interval, including ISO-datetime cutoffs.
    tz = get_report_timezone()
    beginning = datetime.combine(day, time.min, tzinfo=tz)
    ending = datetime.combine(day, time.max, tzinfo=tz)
    return ((scope.start_date is None or ending >= scope.start_date)
            and (scope.end_date is None or beginning <= scope.end_date))


def employee_payroll_activity(scope):
    if scope.account_id is not None:
        raise ValidationError({'account_id': 'Employee payroll activity is grouped by employee and pay period, not GL account.'})

    events = []
    overtime = EmployeeOvertimeEntry.objects.select_related('employee')
    deductions = EmployeeAbsenceEntry.objects.select_related('employee')
    payments = Payroll.objects.select_related('employee', 'source_sale')
    if scope.currency is not None:
        overtime = overtime.filter(currency=scope.currency)
        deductions = deductions.filter(currency=scope.currency)
        payments = payments.filter(currency=scope.currency)
    report_tz = get_report_timezone()
    if scope.start_date:
        start_day = scope.start_date.astimezone(report_tz).date()
        overtime = overtime.filter(work_date__gte=start_day)
        deductions = deductions.filter(absence_date__gte=start_day)
        payments = payments.filter(payment_date__gte=scope.start_date)
    if scope.end_date:
        end_day = scope.end_date.astimezone(report_tz).date()
        overtime = overtime.filter(work_date__lte=end_day)
        deductions = deductions.filter(absence_date__lte=end_day)
        payments = payments.filter(payment_date__lte=scope.end_date)

    def base(source, date, kind, amount, *, issues=None):
        return dict(event_model=source._meta.model_name, event_id=source.pk,
                    effective_at=date, employee_id=source.employee_id,
                    employee_name=source.employee.full_name, currency_id=source.currency,
                    period_calendar=source.period_calendar, year=source.year, month=source.month,
                    kind=kind, amount=money(amount), issues=issues or [])

    for entry in overtime.iterator(chunk_size=1000):
        if _day_in_scope(entry.work_date, scope):
            events.append({**base(entry, entry.work_date.isoformat(), 'overtime', entry.amount),
                           'hours': money(entry.hours) if entry.hours is not None else None})
    for entry in deductions.iterator(chunk_size=1000):
        if not _day_in_scope(entry.absence_date, scope):
            continue
        kind = 'food_deduction' if entry.entry_type == EmployeeAbsenceEntry.TYPE_FOOD else 'absence_deduction'
        issues = []
        if kind == 'absence_deduction' and entry.days > ZERO and entry.amount == ZERO:
            issues.append('absence_amount_zero_review')
        events.append({**base(entry, entry.absence_date.isoformat(), kind, entry.amount, issues=issues),
                       'days': money(entry.days) if kind == 'absence_deduction' else None})
    for payment in payments.iterator(chunk_size=1000):
        goods = payment.payment_method == Payroll.PAYMENT_GOODS or bool(payment.source_sale_id)
        kind = ('salary_goods' if goods else 'salary_payment') if payment.payroll_type == Payroll.PAYROLL_TYPE_SALARY else ('advance_goods' if goods else 'advance_payment')
        issues = []
        if goods and (payment.payment_method != Payroll.PAYMENT_GOODS or not payment.source_sale_id
                      or payment.source_sale.deleted_at is not None):
            issues.append('goods_sale_link_requires_review')
        if goods and payment.payroll_type != Payroll.PAYROLL_TYPE_SALARY:
            issues.append('goods_advance_requires_review')
        events.append({**base(payment, payment.payment_date.isoformat(), kind, payment.amount, issues=issues),
                       'payment_method': payment.payment_method, 'source_sale_id': payment.source_sale_id,
                       'pay_rate_snapshot': money(payment.basic_salary),
                       'salary_type_snapshot': payment.salary_type,
                       'payment_line_overtime': money(payment.overtime),
                       'payment_line_deductions': money(payment.deductions),
                       'payment_line_bonus': money(payment.bonus),
                       'payment_gross_snapshot': money(payment.gross_amount) if payment.gross_amount is not None else None})

    events.sort(key=lambda row: (row['effective_at'], row['event_model'], row['event_id']))
    groups = defaultdict(lambda: {'overtime': ZERO, 'absence': ZERO, 'food': ZERO,
                                  'absence_days': ZERO, 'salary_cash': ZERO, 'salary_goods': ZERO,
                                  'advances': ZERO, 'advance_goods': ZERO,
                                  'pay_rates': set(), 'salary_types': set(),
                                  'line_overtime': set(), 'line_deductions': set(),
                                  'line_bonus': set(), 'gross_snapshots': set(),
                                  'event_count': 0, 'review_count': 0})
    for event in events:
        key = (event['employee_id'], event['employee_name'], event['currency_id'],
               event['period_calendar'], event['year'], event['month'])
        group = groups[key]
        amount = Decimal(event['amount'])
        kind = event['kind']
        if kind == 'overtime':
            group['overtime'] += amount
        elif kind == 'absence_deduction':
            group['absence'] += amount
            group['absence_days'] += Decimal(event['days'])
        elif kind == 'food_deduction':
            group['food'] += amount
        elif kind == 'salary_goods':
            group['salary_goods'] += amount
        elif kind == 'salary_payment':
            group['salary_cash'] += amount
        elif kind == 'advance_goods':
            group['advance_goods'] += amount
        else:
            group['advances'] += amount
        if kind in ('salary_goods', 'salary_payment'):
            group['pay_rates'].add(event['pay_rate_snapshot'])
            group['salary_types'].add(event['salary_type_snapshot'])
            for field, target in (('payment_line_overtime', 'line_overtime'),
                                  ('payment_line_deductions', 'line_deductions'),
                                  ('payment_line_bonus', 'line_bonus')):
                if Decimal(event[field]) != ZERO:
                    group[target].add(event[field])
            if event['payment_gross_snapshot'] is not None:
                group['gross_snapshots'].add(event['payment_gross_snapshot'])
        group['event_count'] += 1
        group['review_count'] += bool(event['issues'])

    currencies_by_period = defaultdict(set)
    for employee_id, _, currency_id, calendar, year, month in groups:
        currencies_by_period[(employee_id, calendar, year, month)].add(currency_id)
    rows = []
    for key, group in sorted(groups.items(), key=lambda item: (item[0][0], item[0][3], item[0][4], item[0][5], item[0][2])):
        rates, salary_types = group['pay_rates'], group['salary_types']
        rate = Decimal(next(iter(rates))) if len(rates) == 1 else None
        adjustments = group['overtime'] - group['absence'] - group['food']
        settled = group['salary_cash'] + group['salary_goods'] + group['advances'] + group['advance_goods']
        balance_issues = []
        if scope.start_date or scope.end_date:
            balance_issues.append('partial_event_date_filter')
        if scope.currency is not None:
            balance_issues.append('currency_filter_may_hide_other_entries')
        if len(currencies_by_period[(key[0], key[3], key[4], key[5])]) > 1:
            balance_issues.append('multiple_currencies_in_pay_period')
        if rate is None or rate <= ZERO or len(salary_types) != 1:
            balance_issues.append('monthly_salary_snapshot_missing_or_conflicting')
        elif next(iter(salary_types)) != 'monthly':
            balance_issues.append('daily_or_manual_entitlement_not_supported')
        if group['review_count']:
            balance_issues.append('source_event_requires_review')
        if group['line_bonus']:
            balance_issues.append('payment_bonus_has_no_independent_entitlement')
        if group['line_overtime'] != set() and group['line_overtime'] != {money(group['overtime'])}:
            balance_issues.append('payment_overtime_differs_from_day_entries')
        if group['line_deductions'] != set() and group['line_deductions'] != {money(group['absence'] + group['food'])}:
            balance_issues.append('payment_deductions_differ_from_day_entries')
        if rate is not None and any(Decimal(gross) != rate for gross in group['gross_snapshots']):
            balance_issues.append('manual_gross_differs_from_salary_snapshot')
        estimated_net = rate + adjustments if not balance_issues else None
        rows.append(dict(employee_id=key[0], employee_name=key[1], currency_id=key[2],
            currency_code=CURRENCY_DEFINITIONS.get(key[2], {}).get('code'),
            period_calendar=key[3], year=key[4], month=key[5],
            overtime=money(group['overtime']), absence_deductions=money(group['absence']),
            food_deductions=money(group['food']), total_deductions=money(group['absence'] + group['food']),
            absence_days=money(group['absence_days']),
            net_adjustments=money(adjustments),
            salary_paid_money=money(group['salary_cash']), salary_paid_goods=money(group['salary_goods']),
            advances_paid_money=money(group['advances']), advances_paid_goods=money(group['advance_goods']),
            total_settled=money(settled),
            pay_rate_snapshot=next(iter(rates)) if len(rates) == 1 else None,
            salary_type_snapshot=next(iter(salary_types)) if len(salary_types) == 1 else None,
            pay_rate_conflict=len(rates) > 1 or len(salary_types) > 1,
            estimated_monthly_net=money(estimated_net),
            estimated_remaining=money(estimated_net - settled) if estimated_net is not None else None,
            balance_review_reasons=balance_issues,
            event_count=group['event_count'], review_count=group['review_count']))
    return dict(meta={**scope.metadata(), 'report': 'employee_payroll_activity',
                      'source': 'employee_pay_entries_and_payroll'},
                status='recorded_payroll_activity_unverified', rows=rows, events=events,
                limitations=[
                    'Day-level overtime, absence and food are distinct from payment-line memo fields; payment-line adjustments are not added twice.',
                    'Goods settlements are salary paid in products and are excluded from money-paid totals.',
                    'Monthly net and remaining are estimates only when one consistent pay-rate snapshot exists, payment-line adjustments agree with day entries, and the event-date range is unrestricted.',
                    'Historical period entitlement and opening/closing salary payable are not certified; a dated salary-rate and accrual ledger is still required.',
                    'Date filters select event dates, while month/year/calendar identify the assigned payroll period; partial-period totals may result.',
                    'Currencies are kept separate; no current exchange rate is applied to historical employee entries.',
                ])
