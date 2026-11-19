from decimal import Decimal

from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel

from api.models.data.currency import CURRENCY_CHOICES
from api.models.data.employee import Employee


class Payroll(BaseModel):
    PAYROLL_TYPE_SALARY = 'salary'
    PAYROLL_TYPE_ADVANCE = 'advance'
    PAYROLL_TYPE_CHOICES = [
        (PAYROLL_TYPE_SALARY, 'Salary'),
        (PAYROLL_TYPE_ADVANCE, 'Advance'),
    ]

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='payrolls',
    )

    payroll_type = models.CharField(
        max_length=20,
        choices=PAYROLL_TYPE_CHOICES,
        default=PAYROLL_TYPE_SALARY,
    )
    # Snapshot of employee pay basis at payroll time
    salary_type = models.CharField(
        max_length=20,
        choices=Employee.SALARY_TYPE_CHOICES,
        default=Employee.SALARY_TYPE_MONTHLY,
        help_text='Copied from employee on create: monthly, daily, or other.',
    )
    month = models.CharField(max_length=20)
    period_calendar = models.CharField(
        max_length=12, default='gregorian',
        choices=[('gregorian', 'Gregorian'), ('jalali', 'Afghanistan Solar Hijri'), ('hijri', 'Lunar Hijri')],
    )
    year = models.PositiveIntegerField()
    # Payable amount (same as net_salary for salary runs)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_base = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    basic_salary = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text='Monthly salary, daily rate, or base amount depending on salary_type.',
    )
    basic_salary_base = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    bonus = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    bonus_base = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    overtime = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    overtime_base = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    salary_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Explicit payment before adjustments; null preserves legacy manual nets.
    gross_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    # Monthly: calendar working days in period. Daily: days worked this run.
    working_days = models.PositiveIntegerField(default=30)
    deduction_days = models.PositiveIntegerField(default=0)
    deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    deductions_base = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_salary_base = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=1)
    currency = models.IntegerField(choices=CURRENCY_CHOICES)
    PAYMENT_CASH = 'cash'
    PAYMENT_BANK = 'bank'
    PAYMENT_SARAFI = 'sarafi'
    PAYMENT_GOODS = 'goods'
    PAYMENT_METHOD_CHOICES = [
        (PAYMENT_CASH, 'Cash'),
        (PAYMENT_BANK, 'Bank'),
        (PAYMENT_SARAFI, 'Sarafi'),
        (PAYMENT_GOODS, 'Goods (sale settlement)'),
    ]
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default=PAYMENT_CASH,
        help_text='Cash book credited when payroll is posted; goods skips cash (sale settles wages).',
    )
    payment_date = models.DateTimeField(default=timezone.now)
    reference_number = models.CharField(max_length=100, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    # When True, save() will not overwrite net_salary / amount from formula
    manual_net = models.BooleanField(default=False)
    # Sale of products to this employee — amount counts as paid salary (no cash).
    source_sale = models.OneToOneField(
        'api.Sales',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='salary_settlement',
        help_text='When set, this payroll is the salary settlement for that employee product sale.',
    )

    class Meta:
        # Settlement payments: many salary/advance rows per employee+period are allowed
        # (partial pays, overpays). Period balance = net − sum(payments).
        constraints = []

    def recalculate_amounts(self):
        """Derive deductions, net_salary, and payable amount from salary_type."""
        working_days = int(self.working_days or 0)
        deduction_days = int(self.deduction_days or 0)
        basic = Decimal(str(self.basic_salary or 0))
        bonus = Decimal(str(self.bonus or 0))
        overtime = Decimal(str(self.overtime or 0))
        salary_deduction = Decimal(str(self.salary_deduction or 0))
        salary_type = self.salary_type or Employee.SALARY_TYPE_MONTHLY

        # Advances and manual / "other" nets: amount/net_salary are source of truth
        if (
            self.payroll_type == self.PAYROLL_TYPE_ADVANCE
            or self.manual_net
            or salary_type == Employee.SALARY_TYPE_OTHER
        ):
            payable = Decimal(str(self.net_salary or self.amount or 0))
            if self.amount and not self.net_salary:
                payable = Decimal(str(self.amount))
            absence_deduction = Decimal('0')
            if salary_type == Employee.SALARY_TYPE_MONTHLY and working_days > 0 and self.gross_amount is not None:
                absence_deduction = (basic * Decimal(deduction_days) / Decimal(working_days)).quantize(Decimal('0.01'))
            total_deduction = salary_deduction + absence_deduction
            if self.payroll_type != self.PAYROLL_TYPE_ADVANCE and self.gross_amount is not None:
                payable = (Decimal(str(self.gross_amount)) + bonus + overtime - total_deduction).quantize(Decimal('0.01'))
            self.deductions = total_deduction if self.payroll_type != self.PAYROLL_TYPE_ADVANCE else Decimal('0')
            self.net_salary = payable
            self.amount = payable
            return

        if salary_type == Employee.SALARY_TYPE_DAILY:
            # basic_salary is the daily rate; working_days = days worked
            days = max(working_days - deduction_days, 0)
            if deduction_days > 0 and working_days > 0:
                self.deductions = (basic * Decimal(deduction_days)).quantize(Decimal('0.01'))
            else:
                self.deductions = Decimal('0')
            earned = basic * Decimal(days)
            self.deductions += salary_deduction
            self.net_salary = (earned + bonus + overtime - salary_deduction).quantize(Decimal('0.01'))
            self.amount = self.net_salary
            return

        # Monthly (default): basic is monthly salary prorated by days
        if working_days > 0 and deduction_days > 0:
            daily = basic / Decimal(working_days)
            self.deductions = (daily * Decimal(deduction_days)).quantize(Decimal('0.01'))
        else:
            self.deductions = Decimal('0')

        if working_days > 0:
            effective_days = max(working_days - deduction_days, 0)
            daily = basic / Decimal(working_days)
            earned = daily * Decimal(effective_days)
            self.net_salary = (earned + bonus + overtime - salary_deduction).quantize(Decimal('0.01'))
        else:
            self.net_salary = (bonus + overtime - salary_deduction).quantize(Decimal('0.01'))

        self.deductions += salary_deduction
        self.amount = self.net_salary

    def save(self, *args, **kwargs):
        if self.employee_id:
            employee = self.employee
            # On create, always snapshot the employee's current pay basis.
            if self._state.adding:
                self.salary_type = (
                    getattr(employee, 'salary_type', None)
                    or Employee.SALARY_TYPE_MONTHLY
                )
            if self.basic_salary in (None, 0, Decimal('0')):
                emp_salary = getattr(employee, 'salary', None)
                if emp_salary:
                    self.basic_salary = emp_salary
            if not self.currency:
                emp_currency = getattr(employee, 'currency', None)
                if emp_currency:
                    self.currency = emp_currency
        if not self.salary_type:
            self.salary_type = Employee.SALARY_TYPE_MONTHLY
        self.recalculate_amounts()
        # Recalculation can change amount/net after serializer base snapshots;
        # always refresh *_base so ops reports that sum amount_base stay correct.
        from api.services.currency_conversion import populate_base_amounts
        populate_base_amounts(
            self,
            amount_fields=(
                'amount', 'basic_salary', 'bonus', 'overtime', 'deductions', 'net_salary',
            ),
            currency=self.currency,
            at_datetime=self.payment_date,
            raise_if_missing=False,
        )
        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"{self.employee.full_name} - {self.get_payroll_type_display()} "
            f"- {self.month} {self.year}"
        )
