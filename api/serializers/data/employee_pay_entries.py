from decimal import Decimal

from rest_framework import serializers

from api.models.data.employee import Employee
from api.models.data.employee_pay_entries import EmployeeAbsenceEntry, EmployeeOvertimeEntry
from api.serializers.data.base import DataRootSerializer


PERIOD_CALENDARS = ('gregorian', 'jalali', 'hijri')


class EmployeeOvertimeEntrySerializer(DataRootSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)

    class Meta:
        model = EmployeeOvertimeEntry
        fields = '__all__'

    def validate_amount(self, value):
        if value is None or Decimal(str(value)) < 0:
            raise serializers.ValidationError('Amount cannot be negative.')
        return value

    def validate(self, attrs):
        employee = attrs.get('employee') or getattr(self.instance, 'employee', None)
        if employee and not attrs.get('currency'):
            attrs['currency'] = employee.currency or 1
        calendar = attrs.get('period_calendar') or getattr(self.instance, 'period_calendar', None)
        if calendar and calendar not in PERIOD_CALENDARS:
            raise serializers.ValidationError({'period_calendar': 'Invalid calendar.'})
        if not attrs.get('month') and not getattr(self.instance, 'month', None):
            raise serializers.ValidationError({'month': 'Period month is required.'})
        if not attrs.get('year') and not getattr(self.instance, 'year', None):
            raise serializers.ValidationError({'year': 'Period year is required.'})
        return attrs


class EmployeeAbsenceEntrySerializer(DataRootSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)

    class Meta:
        model = EmployeeAbsenceEntry
        fields = '__all__'
        read_only_fields = ()

    def validate_entry_type(self, value):
        allowed = {choice[0] for choice in EmployeeAbsenceEntry.TYPE_CHOICES}
        if value not in allowed:
            raise serializers.ValidationError('Choose absence or food deduction.')
        return value

    def validate(self, attrs):
        employee = attrs.get('employee') or getattr(self.instance, 'employee', None)
        if not employee:
            raise serializers.ValidationError({'employee': 'Employee is required.'})
        if not attrs.get('currency'):
            attrs['currency'] = employee.currency or getattr(self.instance, 'currency', None) or 1

        entry_type = (
            attrs.get('entry_type')
            or getattr(self.instance, 'entry_type', None)
            or EmployeeAbsenceEntry.TYPE_ABSENCE
        )
        attrs['entry_type'] = entry_type

        if entry_type == EmployeeAbsenceEntry.TYPE_FOOD:
            amount = attrs.get('amount')
            if amount is None and self.instance:
                amount = self.instance.amount
            if amount is None or Decimal(str(amount)) < 0:
                raise serializers.ValidationError({
                    'amount': 'Enter a non-negative food deduction amount.',
                })
            attrs['amount'] = Decimal(str(amount))
            attrs['days'] = Decimal('0')
        else:
            days = attrs.get('days')
            if days is None and self.instance:
                days = self.instance.days
            days = Decimal(str(days if days is not None else 1))
            if days <= 0:
                raise serializers.ValidationError({
                    'days': 'Absence days must be greater than zero.',
                })
            attrs['days'] = days

            auto = EmployeeAbsenceEntry.deduction_amount_for(employee, days)
            salary_type = employee.salary_type or Employee.SALARY_TYPE_MONTHLY
            if salary_type == Employee.SALARY_TYPE_OTHER:
                amount = attrs.get('amount')
                if amount is None and self.instance:
                    amount = self.instance.amount
                if amount is None or Decimal(str(amount)) < 0:
                    raise serializers.ValidationError({
                        'amount': 'Enter a non-negative deduction amount for other pay types.',
                    })
                attrs['amount'] = amount
            else:
                attrs['amount'] = auto

        absence_date = attrs.get('absence_date') or getattr(self.instance, 'absence_date', None)
        if employee and absence_date and entry_type == EmployeeAbsenceEntry.TYPE_ABSENCE:
            clash = EmployeeAbsenceEntry.objects.filter(
                employee=employee,
                absence_date=absence_date,
                entry_type=EmployeeAbsenceEntry.TYPE_ABSENCE,
            )
            if self.instance:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError({
                    'absence_date': 'An absence is already recorded for this date.',
                })

        calendar = attrs.get('period_calendar') or getattr(self.instance, 'period_calendar', None)
        if calendar and calendar not in PERIOD_CALENDARS:
            raise serializers.ValidationError({'period_calendar': 'Invalid calendar.'})
        return attrs
