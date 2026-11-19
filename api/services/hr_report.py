"""Section report for HR — headcount, period payroll cash, attendance, OT/deductions."""
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Count, Sum

from api.models.data.attendance import Attendance
from api.models.data.employee import Employee
from api.models.data.employee_pay_entries import EmployeeAbsenceEntry, EmployeeOvertimeEntry
from api.services.financial_reports import _d, _float, _period_advances, _period_payroll, _sum_base
from api.utils.date_filters import apply_date_range

ZERO = Decimal('0')
CENT = Decimal('0.01')


def _money(value):
    return _float(_d(value).quantize(CENT, rounding=ROUND_HALF_UP))


def _qty(value):
    return _float(_d(value))


def get_hr_report(start_date=None, end_date=None):
    active_qs = Employee.objects.filter(is_active=True)
    inactive_count = Employee.objects.filter(is_active=False).count()
    active_count = active_qs.count()

    salary_qs = _period_payroll(start_date, end_date)
    advance_qs = _period_advances(start_date, end_date)
    salary_paid = _sum_base(salary_qs, 'amount_base')
    advances_paid = _sum_base(advance_qs, 'amount_base')
    salary_cash = _sum_base(salary_qs.exclude(payment_method='goods'), 'amount_base')
    salary_goods = _sum_base(salary_qs.filter(payment_method='goods'), 'amount_base')

    overtime_qs = apply_date_range(
        EmployeeOvertimeEntry.objects.all(),
        'work_date', start_date, end_date,
    )
    absence_qs = apply_date_range(
        EmployeeAbsenceEntry.objects.all(),
        'absence_date', start_date, end_date,
    )
    overtime_total = overtime_qs.aggregate(total=Sum('amount'))['total'] or ZERO
    overtime_hours = overtime_qs.aggregate(total=Sum('hours'))['total'] or ZERO
    absence_days = absence_qs.filter(
        entry_type=EmployeeAbsenceEntry.TYPE_ABSENCE,
    ).aggregate(total=Sum('days'))['total'] or ZERO
    absence_deductions = absence_qs.filter(
        entry_type=EmployeeAbsenceEntry.TYPE_ABSENCE,
    ).aggregate(total=Sum('amount'))['total'] or ZERO
    food_deductions = absence_qs.filter(
        entry_type=EmployeeAbsenceEntry.TYPE_FOOD,
    ).aggregate(total=Sum('amount'))['total'] or ZERO
    deductions_total = _d(absence_deductions) + _d(food_deductions)

    attendance_qs = apply_date_range(
        Attendance.objects.all(),
        'date', start_date, end_date,
    )
    status_counts = {
        row['status']: int(row['count'] or 0)
        for row in attendance_qs.values('status').annotate(count=Count('id'))
    }
    status_order = [choice[0] for choice in Attendance._meta.get_field('status').choices]
    attendance_by_status = [
        {'status': status, 'count': status_counts[status]}
        for status in status_order
        if status_counts.get(status)
    ]
    for status, count in status_counts.items():
        if status not in status_order:
            attendance_by_status.append({'status': status, 'count': count})

    # Payments by method (AFN)
    by_method = []
    method_buckets = defaultdict(lambda: {'count': 0, 'amount_afn': ZERO})
    for row in salary_qs.values('payment_method').annotate(
        count=Count('id'),
        amount=Sum('amount_base'),
    ):
        method = row['payment_method'] or 'cash'
        method_buckets[method]['count'] += int(row['count'] or 0)
        method_buckets[method]['amount_afn'] += _d(row['amount'])
    for row in advance_qs.values('payment_method').annotate(
        count=Count('id'),
        amount=Sum('amount_base'),
    ):
        method = row['payment_method'] or 'cash'
        method_buckets[method]['count'] += int(row['count'] or 0)
        method_buckets[method]['amount_afn'] += _d(row['amount'])
    for method, bucket in sorted(method_buckets.items(), key=lambda item: -item[1]['amount_afn']):
        by_method.append({
            'payment_method': method,
            'count': bucket['count'],
            'amount_afn': _money(bucket['amount_afn']),
        })

    # Per-employee activity in period (employees with any payroll/OT/absence)
    employee_buckets = {}

    def _emp_bucket(employee_id, full_name=''):
        bucket = employee_buckets.get(employee_id)
        if bucket is None:
            bucket = {
                'employee_id': employee_id,
                'full_name': full_name or f'#{employee_id}',
                'salary_paid_afn': ZERO,
                'advances_paid_afn': ZERO,
                'overtime_afn': ZERO,
                'deductions_afn': ZERO,
                'absence_days': ZERO,
                'payment_count': 0,
            }
            employee_buckets[employee_id] = bucket
        return bucket

    for pay in salary_qs.select_related('employee').iterator(chunk_size=200):
        bucket = _emp_bucket(pay.employee_id, getattr(pay.employee, 'full_name', ''))
        bucket['salary_paid_afn'] += _d(pay.amount_base)
        bucket['payment_count'] += 1
    for pay in advance_qs.select_related('employee').iterator(chunk_size=200):
        bucket = _emp_bucket(pay.employee_id, getattr(pay.employee, 'full_name', ''))
        bucket['advances_paid_afn'] += _d(pay.amount_base)
        bucket['payment_count'] += 1
    for row in overtime_qs.select_related('employee').iterator(chunk_size=200):
        bucket = _emp_bucket(row.employee_id, getattr(row.employee, 'full_name', ''))
        bucket['overtime_afn'] += _d(row.amount)
    for row in absence_qs.select_related('employee').iterator(chunk_size=200):
        bucket = _emp_bucket(row.employee_id, getattr(row.employee, 'full_name', ''))
        bucket['deductions_afn'] += _d(row.amount)
        if row.entry_type == EmployeeAbsenceEntry.TYPE_ABSENCE:
            bucket['absence_days'] += _d(row.days)

    employees = []
    for bucket in employee_buckets.values():
        total_paid = bucket['salary_paid_afn'] + bucket['advances_paid_afn']
        employees.append({
            'employee_id': bucket['employee_id'],
            'full_name': bucket['full_name'],
            'salary_paid_afn': _money(bucket['salary_paid_afn']),
            'advances_paid_afn': _money(bucket['advances_paid_afn']),
            'total_paid_afn': _money(total_paid),
            'overtime_afn': _money(bucket['overtime_afn']),
            'deductions_afn': _money(bucket['deductions_afn']),
            'absence_days': _qty(bucket['absence_days']),
            'payment_count': bucket['payment_count'],
        })
    employees.sort(key=lambda row: (-row['total_paid_afn'], -row['overtime_afn'], row['full_name']))
    employees = employees[:50]

    present = int(status_counts.get('present') or 0)
    absent = int(status_counts.get('absent') or 0)
    leave = int(status_counts.get('leave') or 0)
    late = int(status_counts.get('late') or 0)
    holiday = int(status_counts.get('holiday') or 0)

    return {
        'report_type': 'hr',
        'currency': 'AFN',
        'currency_symbol': '؋',
        'kpis': {
            'active_headcount': active_count,
            'inactive_headcount': inactive_count,
            'salary_paid_afn': _money(salary_paid),
            'salary_cash_afn': _money(salary_cash),
            'salary_goods_afn': _money(salary_goods),
            'advances_paid_afn': _money(advances_paid),
            'payroll_total_afn': _money(_d(salary_paid) + _d(advances_paid)),
            'salary_payment_count': salary_qs.count(),
            'advance_payment_count': advance_qs.count(),
            'overtime_afn': _money(overtime_total),
            'overtime_hours': _qty(overtime_hours),
            'overtime_count': overtime_qs.count(),
            'deductions_afn': _money(deductions_total),
            'absence_days': _qty(absence_days),
            'food_deductions_afn': _money(food_deductions),
            'attendance_present': present,
            'attendance_absent': absent,
            'attendance_leave': leave,
            'attendance_late': late,
            'attendance_holiday': holiday,
            'attendance_records': attendance_qs.count(),
        },
        'attendance_by_status': attendance_by_status,
        'payments_by_method': by_method,
        'employees': employees,
        'notes': [
            'Salary and advances use payment_date in the selected period (AFN amount_base).',
            'Overtime uses work_date; absences/food use absence_date.',
            'Attendance counts are day records in the period.',
            'Headcount is current active/inactive employees (not period-limited).',
            'Employee table lists staff with payroll or OT/deduction activity in the period.',
        ],
    }
