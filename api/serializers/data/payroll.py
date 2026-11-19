from copy import copy
from decimal import Decimal

from rest_framework import serializers

from api.mixins.base_currency import BaseCurrencySerializerMixin
from api.models.data.currency import currency_details as _currency_details_fn
from api.models.data.payroll import Payroll
from api.serializers.data.base import DataRootSerializer


class PayrollSerializer(BaseCurrencySerializerMixin, DataRootSerializer):
    base_currency_amount_fields = (
        'amount', 'basic_salary', 'bonus', 'overtime', 'deductions', 'net_salary',
    )
    base_currency_date_field = 'payment_date'

    currency = serializers.IntegerField()
    # Temporary write aliases for older clients still sending typos
    bunus = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, write_only=True
    )
    curency = serializers.IntegerField(required=False, write_only=True)

    employee_details = serializers.SerializerMethodField()
    currency_details = serializers.SerializerMethodField()

    class Meta:
        model = Payroll
        fields = '__all__'
        read_only_fields = (
            'exchange_rate',
            'amount_base',
            'basic_salary_base',
            'bonus_base',
            'overtime_base',
            'deductions_base',
            'net_salary_base',
            'deductions',
            'salary_type',
            'source_sale',
        )
        # No unique-period validators: multiple salary/advance payments per month
        # are allowed (settlement / partial / overpayment model).
        validators = []

    def validate(self, attrs):
        if 'bunus' in attrs and 'bonus' not in attrs:
            attrs['bonus'] = attrs.pop('bunus')
        elif 'bunus' in attrs:
            attrs.pop('bunus')
        if 'curency' in attrs and 'currency' not in attrs:
            attrs['currency'] = attrs.pop('curency')
        elif 'curency' in attrs:
            attrs.pop('curency')

        if self.instance and getattr(self.instance, 'source_sale_id', None):
            raise serializers.ValidationError({
                'detail': 'Salary settlements from product sales are managed by the sale document.',
            })

        method = attrs.get('payment_method', getattr(self.instance, 'payment_method', None))
        if method == Payroll.PAYMENT_GOODS and not getattr(self.instance, 'source_sale_id', None):
            raise serializers.ValidationError({
                'payment_method': 'Goods settlements are created automatically from employee product sales.',
            })

        employee = attrs.get('employee') or getattr(self.instance, 'employee', None)
        if employee and not self.instance and not attrs.get('salary_type'):
            attrs['salary_type'] = getattr(
                employee, 'salary_type', None,
            ) or 'monthly'

        salary_type = attrs.get('salary_type') or getattr(
            self.instance, 'salary_type', None,
        ) or 'monthly'

        initial = getattr(self, 'initial_data', {}) or {}
        if salary_type == 'other':
            attrs['manual_net'] = True
        elif salary_type == 'daily' and 'working_days' in initial:
            # Rate × days; ignore posted amount unless client sets manual_net.
            attrs.setdefault('manual_net', False)
            if employee and 'basic_salary' not in attrs:
                attrs['basic_salary'] = employee.salary
        elif 'amount' in initial or 'net_salary' in initial:
            attrs.setdefault('manual_net', True)

        if employee and 'basic_salary' not in attrs:
            if not self.instance or not self.instance.basic_salary:
                attrs['basic_salary'] = employee.salary

        for field in ('basic_salary', 'bonus', 'overtime', 'salary_deduction', 'gross_amount', 'amount', 'net_salary'):
            value = attrs.get(field)
            if value is not None and value < 0:
                raise serializers.ValidationError({field: 'Amount cannot be negative.'})

        preview = copy(self.instance) if self.instance else Payroll()
        for field, value in attrs.items():
            setattr(preview, field, value)
        if not self.instance and employee:
            preview.salary_type = employee.salary_type
        if preview.deduction_days > preview.working_days:
            raise serializers.ValidationError({'deduction_days': 'Deduction days cannot exceed working days.'})
        if preview.payroll_type == Payroll.PAYROLL_TYPE_ADVANCE and any(
            Decimal(str(getattr(preview, field) or 0)) != 0
            for field in ('bonus', 'overtime', 'salary_deduction', 'deduction_days')
        ):
            raise serializers.ValidationError({'payroll_type': 'Advances cannot include salary adjustments.'})

        # Infer the gross amount when editing a legacy manual payroll's adjustments.
        if (self.instance and preview.manual_net and preview.gross_amount is None
                and any(field in attrs for field in ('bonus', 'overtime', 'salary_deduction'))):
            preview.gross_amount = (
                self.instance.amount - self.instance.bonus - self.instance.overtime
                + self.instance.salary_deduction
            )
            attrs['gross_amount'] = preview.gross_amount
        preview.recalculate_amounts()
        if preview.net_salary < 0:
            raise serializers.ValidationError({'salary_deduction': 'Deductions cannot exceed earnings.'})
        # Convert the calculated amounts, not an untrusted/stale client preview.
        for field in ('amount', 'net_salary', 'deductions'):
            try:
                attrs[field] = serializers.DecimalField(
                    max_digits=12, decimal_places=2,
                ).run_validation(getattr(preview, field))
            except serializers.ValidationError as exc:
                raise serializers.ValidationError({field: exc.detail}) from exc
        return super().validate(attrs)

    def get_employee_details(self, obj):
        if obj.employee:
            return {
                'id': obj.employee.id,
                'fullname': obj.employee.full_name,
                'salary': obj.employee.salary,
                'salary_type': getattr(obj.employee, 'salary_type', None) or 'monthly',
                'phone': obj.employee.phone,
                'tazkira_number': obj.employee.tazkira_number,
            }
        return None

    def get_currency_details(self, obj):
        return _currency_details_fn(obj.currency)
