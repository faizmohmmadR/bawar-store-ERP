from django.conf import settings
from django.db import models

from api.models.data.base import BaseModel

from api.models.data.currency import CURRENCY_CHOICES


class Employee(BaseModel):
    SALARY_TYPE_MONTHLY = 'monthly'
    SALARY_TYPE_DAILY = 'daily'
    SALARY_TYPE_OTHER = 'other'
    SALARY_TYPE_CHOICES = [
        (SALARY_TYPE_MONTHLY, 'Monthly'),
        (SALARY_TYPE_DAILY, 'Daily'),
        (SALARY_TYPE_OTHER, 'Other'),
    ]

    full_name = models.CharField(max_length=255, default='')
    email = models.EmailField(blank=True, null=True)
    address = models.CharField(max_length=255, blank=True, null=True)
    phone = models.CharField(max_length=50, default='')
    tazkira_number = models.CharField(max_length=100, blank=True, default='')
    tazkira_copy = models.FileField(upload_to='employee/tazkira_copies/', blank=True, null=True)
    salary = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text='Pay rate: monthly salary, daily rate, or agreed amount (see salary_type).',
    )
    salary_type = models.CharField(
        max_length=20,
        choices=SALARY_TYPE_CHOICES,
        default=SALARY_TYPE_MONTHLY,
        help_text='How this employee is paid: monthly, daily, or other (manual).',
    )
    currency = models.IntegerField(choices=CURRENCY_CHOICES, null=True, blank=True)

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employee_profile',
        help_text='Login account for this employee.',
    )
    contract_start_date = models.DateField(blank=True, null=True)
    contract_end_date = models.DateField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    notes = models.CharField(blank=True, null=True, max_length=200)
    date_joined = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.full_name

    @property
    def contract_duration_days(self):
        if not self.contract_start_date or not self.contract_end_date:
            return None
        return max((self.contract_end_date - self.contract_start_date).days, 0)

    @property
    def contract_duration_months(self):
        if not self.contract_start_date or not self.contract_end_date:
            return None
        start = self.contract_start_date
        end = self.contract_end_date
        months = (end.year - start.year) * 12 + (end.month - start.month)
        if end.day < start.day:
            months -= 1
        return max(months, 0)

    @property
    def contract_duration_years(self):
        months = self.contract_duration_months
        if months is None:
            return None
        return months // 12
