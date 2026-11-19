"""Day-level overtime and deduction ledgers that feed period pay totals."""
from decimal import Decimal

from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel
from api.models.data.currency import CURRENCY_CHOICES
from api.models.data.employee import Employee


class EmployeeOvertimeEntry(BaseModel):
    """One overtime work day with a money amount toward net salary."""

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='overtime_entries',
    )
    work_date = models.DateField(default=timezone.localdate)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    hours = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    month = models.CharField(max_length=20)
    year = models.PositiveIntegerField()
    period_calendar = models.CharField(
        max_length=12,
        default='gregorian',
        choices=[
            ('gregorian', 'Gregorian'),
            ('jalali', 'Afghanistan Solar Hijri'),
            ('hijri', 'Lunar Hijri'),
        ],
    )
    currency = models.IntegerField(choices=CURRENCY_CHOICES)

    class Meta:
        ordering = ['-work_date', '-id']

    def __str__(self):
        return f'{self.employee_id} OT {self.work_date} {self.amount}'


class EmployeeAbsenceEntry(BaseModel):
    """Absence (days) or food deduction (manual amount) against net salary."""

    TYPE_ABSENCE = 'absence'
    TYPE_FOOD = 'food'
    TYPE_CHOICES = (
        (TYPE_ABSENCE, 'Absence'),
        (TYPE_FOOD, 'Food deduction'),
    )

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='absence_entries',
    )
    entry_type = models.CharField(
        max_length=16,
        choices=TYPE_CHOICES,
        default=TYPE_ABSENCE,
        help_text='Absence uses days; food uses a manual amount.',
    )
    absence_date = models.DateField(default=timezone.localdate)
    days = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('1'))
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True, default='')
    month = models.CharField(max_length=20)
    year = models.PositiveIntegerField()
    period_calendar = models.CharField(
        max_length=12,
        default='gregorian',
        choices=[
            ('gregorian', 'Gregorian'),
            ('jalali', 'Afghanistan Solar Hijri'),
            ('hijri', 'Lunar Hijri'),
        ],
    )
    currency = models.IntegerField(choices=CURRENCY_CHOICES)

    class Meta:
        ordering = ['-absence_date', '-id']

    def __str__(self):
        if self.entry_type == self.TYPE_FOOD:
            return f'{self.employee_id} food {self.absence_date} {self.amount}'
        return f'{self.employee_id} absent {self.absence_date} {self.days}d'

    @staticmethod
    def deduction_amount_for(employee, days):
        """Monthly: salary/30 × days. Daily: rate × days. Other: 0 (manual)."""
        days = Decimal(str(days or 0))
        if days <= 0:
            return Decimal('0')
        salary = Decimal(str(employee.salary or 0))
        salary_type = employee.salary_type or Employee.SALARY_TYPE_MONTHLY
        if salary_type == Employee.SALARY_TYPE_DAILY:
            return (salary * days).quantize(Decimal('0.01'))
        if salary_type == Employee.SALARY_TYPE_MONTHLY:
            return (salary / Decimal('30') * days).quantize(Decimal('0.01'))
        return Decimal('0')

    def recalculate_amount(self):
        if not self.employee_id:
            return
        if self.entry_type == self.TYPE_FOOD:
            return
        auto = self.deduction_amount_for(self.employee, self.days)
        # "other" salary type stays manual; keep posted amount when auto is 0.
        if auto > 0 or (self.employee.salary_type or '') != Employee.SALARY_TYPE_OTHER:
            self.amount = auto

    def save(self, *args, **kwargs):
        if self.employee_id:
            if not self.currency:
                self.currency = self.employee.currency or 1
            if self.entry_type == self.TYPE_FOOD:
                self.days = Decimal('0')
            self.recalculate_amount()
        super().save(*args, **kwargs)
