"""
Seed demo employees (monthly / daily / other) and sample payrolls
using the same serializers/payloads as the UI forms.
"""
from datetime import datetime
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from api.models.data.currency import BASE_CURRENCY_ID
from api.models.data.employee import Employee
from api.models.data.payroll import Payroll
from api.serializers.data.employee import EmployeeSerializer
from api.serializers.data.payroll import PayrollSerializer
from api.views.data.employee import EmployeeViewSet

DEMO_TAG = '[salary-demo]'
PAYMENT_WHEN = timezone.make_aware(datetime(2026, 10, 12, 10, 0, 0))


class Command(BaseCommand):
    help = 'Insert monthly/daily/other employees + payrolls like the UI and verify amounts'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Delete previous demo employees/payrolls tagged with [salary-demo] first',
        )

    def handle(self, *args, **options):
        if options['reset']:
            deleted_p, _ = Payroll.objects.filter(notes__contains=DEMO_TAG).delete()
            deleted_e, _ = Employee.objects.filter(notes__contains=DEMO_TAG).delete()
            self.stdout.write(f'Removed demo payrolls={deleted_p} employees={deleted_e}')

        cases = []
        summary_view = EmployeeViewSet()

        # --- Monthly ---
        monthly = self._create_employee(
            {
                'full_name': f'{DEMO_TAG} Monthly Staff',
                'phone': '0700888001',
                'salary': '20000.00',
                'salary_type': 'monthly',
                'currency': BASE_CURRENCY_ID,
                'is_active': True,
                'notes': DEMO_TAG,
            }
        )
        monthly_pay = self._create_payroll(
            {
                'employee': monthly.id,
                'payroll_type': 'salary',
                'salary_type': 'monthly',
                'month': 'october',
                'year': 2026,
                'amount': '12000.00',
                'net_salary': '12000.00',
                'basic_salary': '20000.00',
                'working_days': 30,
                'currency': BASE_CURRENCY_ID,
                'payment_method': 'cash',
                'payment_date': PAYMENT_WHEN,
                'manual_net': True,
                'notes': f'{DEMO_TAG} partial monthly salary',
            }
        )
        monthly_summary = summary_view._summary_for_employee(
            monthly, month='october', year=2026
        )
        cases.append(
            (
                'monthly',
                monthly_pay.amount == Decimal('12000.00')
                and float(monthly_summary['salary_remaining']) == 8000.0,
                f"paid={monthly_pay.amount} remaining={monthly_summary['salary_remaining']}",
            )
        )

        # --- Daily ---
        daily = self._create_employee(
            {
                'full_name': f'{DEMO_TAG} Daily Worker',
                'phone': '0700888002',
                'salary': '500.00',
                'salary_type': 'daily',
                'currency': BASE_CURRENCY_ID,
                'is_active': True,
                'notes': DEMO_TAG,
            }
        )
        daily_pay = self._create_payroll(
            {
                'employee': daily.id,
                'payroll_type': 'salary',
                'salary_type': 'daily',
                'month': 'october',
                'year': 2026,
                'amount': '1.00',  # wrong preview — server must recalc 500*12
                'net_salary': '1.00',
                'basic_salary': '500.00',
                'working_days': 12,
                'currency': BASE_CURRENCY_ID,
                'payment_method': 'cash',
                'payment_date': PAYMENT_WHEN,
                'manual_net': False,
                'notes': f'{DEMO_TAG} 12 days worked',
            }
        )
        daily_summary = summary_view._summary_for_employee(daily)
        cases.append(
            (
                'daily',
                daily_pay.amount == Decimal('6000.00')
                and float(daily_summary['total_remaining']) == 0.0,
                f"amount={daily_pay.amount} remaining={daily_summary['total_remaining']}",
            )
        )

        # --- Other ---
        other = self._create_employee(
            {
                'full_name': f'{DEMO_TAG} Contract Other',
                'phone': '0700888003',
                'salary': '1500.00',
                'salary_type': 'other',
                'currency': BASE_CURRENCY_ID,
                'is_active': True,
                'notes': DEMO_TAG,
            }
        )
        other_pay = self._create_payroll(
            {
                'employee': other.id,
                'payroll_type': 'salary',
                'salary_type': 'other',
                'month': 'october',
                'year': 2026,
                'amount': '750.00',
                'net_salary': '750.00',
                'basic_salary': '1500.00',
                'currency': BASE_CURRENCY_ID,
                'payment_method': 'bank',
                'payment_date': PAYMENT_WHEN,
                'manual_net': True,
                'notes': f'{DEMO_TAG} agreed amount',
            }
        )
        other_summary = summary_view._summary_for_employee(other)
        cases.append(
            (
                'other',
                other_pay.amount == Decimal('750.00')
                and float(other_summary['total_remaining']) == 0.0,
                f"amount={other_pay.amount} remaining={other_summary['total_remaining']}",
            )
        )

        # --- Monthly advance ---
        advance_pay = self._create_payroll(
            {
                'employee': monthly.id,
                'payroll_type': 'advance',
                'salary_type': 'monthly',
                'month': 'october',
                'year': 2026,
                'amount': '2000.00',
                'net_salary': '2000.00',
                'basic_salary': '20000.00',
                'currency': BASE_CURRENCY_ID,
                'payment_method': 'cash',
                'payment_date': PAYMENT_WHEN,
                'manual_net': True,
                'notes': f'{DEMO_TAG} advance',
            }
        )
        after_advance = summary_view._summary_for_employee(
            monthly, month='october', year=2026
        )
        cases.append(
            (
                'monthly+advance',
                advance_pay.amount == Decimal('2000.00')
                and float(after_advance['paid_advance']) == 2000.0
                and float(after_advance['total_remaining']) == 6000.0,
                (
                    f"advance={advance_pay.amount} "
                    f"paid_advance={after_advance['paid_advance']} "
                    f"total_remaining={after_advance['total_remaining']}"
                ),
            )
        )

        self.stdout.write('')
        self.stdout.write(self.style.NOTICE('Seeded demo employees (visible in Employees / Payroll UI):'))
        self.stdout.write(f'  • id={monthly.id} Monthly Staff — AFN 20,000/month')
        self.stdout.write(f'  • id={daily.id} Daily Worker — AFN 500/day × 12 days = 6,000')
        self.stdout.write(f'  • id={other.id} Contract Other — agreed AFN 750')
        self.stdout.write('')
        ok = True
        for name, passed, detail in cases:
            style = self.style.SUCCESS if passed else self.style.ERROR
            mark = 'PASS' if passed else 'FAIL'
            self.stdout.write(style(f'  [{mark}] {name}: {detail}'))
            ok = ok and passed

        if not ok:
            raise SystemExit(1)
        self.stdout.write(self.style.SUCCESS('\nAll salary-type demo cases passed.'))

    def _create_employee(self, payload):
        ser = EmployeeSerializer(data=payload)
        if not ser.is_valid():
            raise SystemExit(f'Employee invalid: {ser.errors}')
        return ser.save()

    def _create_payroll(self, payload):
        ser = PayrollSerializer(data=payload)
        if not ser.is_valid():
            raise SystemExit(f'Payroll invalid: {ser.errors}')
        return ser.save()
