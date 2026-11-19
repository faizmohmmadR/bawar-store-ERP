"""Contract accrual and payroll balances, expressed in one employee currency."""
from calendar import monthrange
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db.models import Sum
from django.utils import timezone

from api.models.data.currency import BASE_CURRENCY_ID, get_currency
from api.utils.currency import convert_currency

PAYROLL_MONTH_KEYS = (
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
)


def _entry_period_filter(*, month=None, year=None, period_calendar='gregorian'):
    filters = {}
    if month:
        filters['month'] = month
    if year:
        filters['year'] = int(year)
    if month or year:
        filters['period_calendar'] = period_calendar
    return filters


def employee_period_entry_totals(employee, *, month=None, year=None, period_calendar='gregorian'):
    """Sum day-level overtime and absence/food deductions for a payroll period."""
    from api.models.data.employee_pay_entries import EmployeeAbsenceEntry

    filters = _entry_period_filter(month=month, year=year, period_calendar=period_calendar)
    ot_qs = employee.overtime_entries.filter(**filters) if filters else employee.overtime_entries.all()
    abs_qs = employee.absence_entries.filter(**filters) if filters else employee.absence_entries.all()
    overtime = ot_qs.aggregate(total=Sum('amount'))['total'] or Decimal('0')
    absence_deductions = (
        abs_qs.filter(entry_type=EmployeeAbsenceEntry.TYPE_ABSENCE)
        .aggregate(total=Sum('amount'))['total'] or Decimal('0')
    )
    food_deductions = (
        abs_qs.filter(entry_type=EmployeeAbsenceEntry.TYPE_FOOD)
        .aggregate(total=Sum('amount'))['total'] or Decimal('0')
    )
    deductions = abs_qs.aggregate(total=Sum('amount'))['total'] or Decimal('0')
    absence_days = (
        abs_qs.filter(entry_type=EmployeeAbsenceEntry.TYPE_ABSENCE)
        .aggregate(total=Sum('days'))['total'] or Decimal('0')
    )
    return {
        'overtime': Decimal(str(overtime)),
        'absence_deductions': Decimal(str(absence_deductions)),
        'food_deductions': Decimal(str(food_deductions)),
        'deductions': Decimal(str(deductions)),
        'absence_days': Decimal(str(absence_days)),
        'overtime_count': ot_qs.count(),
        'absence_count': abs_qs.filter(entry_type=EmployeeAbsenceEntry.TYPE_ABSENCE).count(),
        'food_count': abs_qs.filter(entry_type=EmployeeAbsenceEntry.TYPE_FOOD).count(),
    }


def completed_contract_months(start, end):
    if not start or end < start:
        return 0
    months = (end.year - start.year) * 12 + end.month - start.month
    anniversary_day = min(start.day, monthrange(end.year, end.month)[1])
    return max(0, months - (end.day < anniversary_day))


def employee_payroll_summary(employee, *, month=None, year=None, target_currency_id=None, today=None, period_calendar='gregorian'):
    report_timezone = ZoneInfo(getattr(settings, 'REPORT_TIME_ZONE', settings.TIME_ZONE))
    today = today or timezone.localdate(timezone=report_timezone)
    currency_id = target_currency_id or employee.currency or BASE_CURRENCY_ID
    source_currency = employee.currency or BASE_CURRENCY_ID
    salary = Decimal(str(convert_currency(employee.salary, source_currency, currency_id, timezone.now())))
    salary_type = employee.salary_type or 'monthly'
    start = employee.contract_start_date
    end = employee.contract_end_date or today
    elapsed_days = max(0, (end - start).days + 1) if start else None
    elapsed_months = completed_contract_months(start, end)
    salary_paid = advance_paid = Decimal('0')
    lifetime_paid = Decimal('0')
    bonuses = Decimal('0')
    period_filter = bool(month or year)
    # Period UI uses period OT/deductions; lifetime payable always uses lifetime entries.
    entries = employee_period_entry_totals(
        employee, month=month, year=year, period_calendar=period_calendar,
    )
    lifetime_entries = (
        entries if not period_filter
        else employee_period_entry_totals(employee)
    )
    overtime = entries['overtime']
    deductions = entries['deductions']
    lifetime_overtime = lifetime_entries['overtime']
    lifetime_deductions = lifetime_entries['deductions']

    for payroll in employee.payrolls.all():
        payment_day = timezone.localdate(payroll.payment_date, timezone=report_timezone)
        # Product-sale settlements already happened — never treat as "future".
        is_goods = (
            getattr(payroll, 'payment_method', None) == 'goods'
            or bool(getattr(payroll, 'source_sale_id', None))
        )
        is_future = payment_day > today and not is_goods

        def converted(value):
            # Respect the payroll's saved historical AFN rate for native→AFN.
            value = Decimal(str(value or 0))
            if payroll.currency == currency_id:
                return value
            if currency_id == BASE_CURRENCY_ID:
                return value * payroll.exchange_rate
            return Decimal(str(convert_currency(value, payroll.currency, currency_id, payroll.payment_date)))

        paid = converted(payroll.amount)
        is_salary = payroll.payroll_type == 'salary'
        in_contract = start is None or payment_day >= start or is_goods
        matches_calendar = not period_filter or payroll.period_calendar == period_calendar
        in_period = (
            in_contract
            and matches_calendar
            and (not month or payroll.month == month)
            and (not year or payroll.year == int(year))
        )

        # Period balance includes every payment posted to that period (even if
        # payment_date is slightly ahead of today due to timezone / form time).
        if in_period:
            if is_salary:
                salary_paid += paid
                if period_filter:
                    bonuses += converted(payroll.bonus)
            else:
                advance_paid += paid

        if in_contract and not is_future:
            lifetime_paid += paid
            if is_salary and not period_filter:
                bonuses += converted(payroll.bonus)

    daily_rate = (
        salary / Decimal('30') if salary_type == 'monthly'
        else salary if salary_type == 'daily' else None
    )
    accrued = (
        (daily_rate * elapsed_days).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        if daily_rate is not None and elapsed_days is not None else None
    )
    # Period net = base entitlement + overtime entries − absence/food deductions.
    # Payments (salary + advances) reduce the remaining balance.
    if salary_type == 'monthly':
        net_salary = (salary + overtime - deductions).quantize(Decimal('0.01'))
    elif salary_type == 'daily':
        period_days = None
        if month and year:
            try:
                month_num = PAYROLL_MONTH_KEYS.index(month) + 1
            except ValueError:
                month_num = None
            if month_num is not None:
                year_i = int(year)
                days_in_month = monthrange(year_i, month_num)[1]
                period_start = date(year_i, month_num, 1)
                period_end = date(year_i, month_num, days_in_month)
                if start:
                    period_start = max(period_start, start)
                if end:
                    period_end = min(period_end, end)
                period_days = (
                    max(0, (period_end - period_start).days + 1)
                    if period_end >= period_start else 0
                )
        if period_days is not None:
            earned = salary * Decimal(period_days)
            net_salary = (earned + overtime - deductions).quantize(Decimal('0.01'))
        elif accrued is not None and not period_filter:
            net_salary = (accrued + overtime - deductions).quantize(Decimal('0.01'))
        else:
            net_salary = (overtime - deductions).quantize(Decimal('0.01'))
    else:
        net_salary = (overtime - deductions).quantize(Decimal('0.01'))

    total_payable = (
        (accrued + lifetime_overtime - lifetime_deductions).quantize(Decimal('0.01'))
        if accrued is not None else None
    )
    total_paid = salary_paid + advance_paid
    if salary_type == 'monthly':
        period_balance = (net_salary - total_paid).quantize(Decimal('0.01'))
        salary_remaining = (net_salary - salary_paid).quantize(Decimal('0.01'))
    else:
        period_balance = (net_salary - total_paid).quantize(Decimal('0.01'))
        salary_remaining = Decimal('0')
    currency = get_currency(currency_id)
    return {
        'salary': float(salary), 'salary_type': salary_type,
        'monthly_salary': float(salary),
        'paid_salary': float(salary_paid), 'paid_advance': float(advance_paid),
        'total_paid': float(total_paid),
        'salary_remaining': float(salary_remaining),
        'total_remaining': float(period_balance),
        'balance': float(period_balance),
        'net_salary': float(net_salary),
        'elapsed_months': elapsed_months,
        'elapsed_days': elapsed_days,
        'daily_rate': float(daily_rate) if daily_rate is not None else None,
        'accrued_salary': float(accrued) if accrued is not None else None,
        'total_payable': float(total_payable) if total_payable is not None else None,
        'lifetime_paid': float(lifetime_paid),
        'lifetime_remaining': float(total_payable - lifetime_paid) if total_payable is not None else None,
        'total_bonus': float(bonuses),
        'total_overtime': float(overtime),
        'total_absence_deductions': float(entries['absence_deductions']),
        'total_food_deductions': float(entries['food_deductions']),
        'total_deductions': float(deductions),
        'absence_days': float(entries['absence_days']),
        'overtime_count': entries['overtime_count'],
        'absence_count': entries['absence_count'],
        'food_count': entries['food_count'],
        'contract_start_date': start.isoformat() if start else None,
        'accrual_through': end.isoformat(),
        'accrual_available': accrued is not None,
        'currency': {'id': currency_id, 'code': currency['code'], 'symbol': currency['symbol'], 'name': currency['name']} if currency else None,
        'month': month, 'year': int(year) if year else None, 'period_calendar': period_calendar,
    }


def employee_yearly_payroll_summary(
    employee, *, year, target_currency_id=None, today=None, period_calendar='gregorian',
):
    """Per-month salary / paid / balance for one payroll year, plus year totals."""
    year = int(year)
    months = []
    total_salary = total_paid = total_balance = Decimal('0')
    total_bonus = total_overtime = total_deductions = Decimal('0')
    currency = None
    salary_type = employee.salary_type or 'monthly'

    for month in PAYROLL_MONTH_KEYS:
        summary = employee_payroll_summary(
            employee,
            month=month,
            year=year,
            target_currency_id=target_currency_id,
            today=today,
            period_calendar=period_calendar,
        )
        currency = currency or summary.get('currency')
        salary = Decimal(str(summary['salary'] if salary_type == 'monthly' else summary['paid_salary']))
        paid = Decimal(str(summary['total_paid']))
        balance = Decimal(str(summary['balance']))
        months.append({
            'month': month,
            'year': year,
            'salary': float(salary),
            'paid': float(paid),
            'paid_salary': float(summary['paid_salary']),
            'paid_advance': float(summary['paid_advance']),
            'balance': float(balance),
            'total_bonus': float(summary['total_bonus']),
            'total_overtime': float(summary['total_overtime']),
            'total_deductions': float(summary['total_deductions']),
        })
        total_salary += salary
        total_paid += paid
        total_balance += balance
        total_bonus += Decimal(str(summary['total_bonus']))
        total_overtime += Decimal(str(summary['total_overtime']))
        total_deductions += Decimal(str(summary['total_deductions']))

    return {
        'year': year,
        'period_calendar': period_calendar,
        'salary_type': salary_type,
        'currency': currency,
        'months': months,
        'totals': {
            'salary': float(total_salary),
            'paid': float(total_paid),
            'balance': float(total_balance),
            'total_bonus': float(total_bonus),
            'total_overtime': float(total_overtime),
            'total_deductions': float(total_deductions),
        },
    }
