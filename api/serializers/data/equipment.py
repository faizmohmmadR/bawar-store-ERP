from rest_framework import serializers

from api.models.data.currency import currency_details as _currency_details_fn
from api.models.data.equipment import Equipment
from api.serializers.data.base import DataRootSerializer


class EquipmentSerializer(DataRootSerializer):
    currency = serializers.IntegerField()
    payment_method = serializers.ChoiceField(
        choices=[choice[0] for choice in Equipment.PAYMENT_METHOD_CHOICES],
        required=False,
        allow_null=True,
        allow_blank=True,
    )
    currency_details = serializers.SerializerMethodField()
    assigned_to_details = serializers.SerializerMethodField()
    expense_details = serializers.SerializerMethodField()
    total_cost = serializers.SerializerMethodField()
    net_book_value = serializers.SerializerMethodField()

    class Meta:
        model = Equipment
        fields = '__all__'

    def create(self, validated_data):
        validated_data.pop('serial_number', None)
        validated_data.pop('is_opening_balance', None)
        validated_data.pop('record_as_expense', None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop('serial_number', None)
        validated_data.pop('is_opening_balance', None)
        validated_data.pop('record_as_expense', None)
        return super().update(instance, validated_data)

    def get_currency_details(self, obj):
        return _currency_details_fn(obj.currency)

    def get_assigned_to_details(self, obj):
        if not obj.assigned_to_id:
            return None
        emp = obj.assigned_to
        return {
            'id': emp.id,
            'full_name': emp.full_name,
            'phone': emp.phone,
        }

    def get_expense_details(self, obj):
        if not obj.expense_id:
            return None
        expense = obj.expense
        return {
            'id': expense.id,
            'amount': str(expense.amount),
            'category': expense.category.name if expense.category_id else None,
            'expense_date': expense.expense_date,
        }

    def get_total_cost(self, obj):
        return str(obj.total_cost)

    def get_net_book_value(self, obj):
        return str(obj.net_book_value)

    def validate_assigned_to(self, employee):
        if employee is None:
            return employee
        request = self.context.get('request')
        if self.instance is not None:
            if self.instance.assigned_to_id and self.instance.assigned_to_id != employee.id:
                pass
        elif request is not None:
            try:
                pass
            except Exception:
                pass
        if employee is None:
            raise serializers.ValidationError(
                'Assigned employee is required.'
            )
        return employee

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not attrs.get('status'):
            attrs['status'] = Equipment.STATUS_IN_USE
        if attrs.get('quantity') is None:
            attrs['quantity'] = 1
        method = attrs.get('payment_method')
        if method is None or method == '':
            attrs['payment_method'] = Equipment.PAYMENT_CASH
        if 'acquisition_type' not in attrs and self.instance is None:
            attrs['acquisition_type'] = Equipment.ACQUISITION_NEW

        merged = {}
        if self.instance is not None:
            for field in (
                'acquisition_type',
                'quantity',
                'unit_cost',
                'accumulated_depreciation',
                'residual_value',
            ):
                merged[field] = getattr(self.instance, field)
        merged.update(attrs)

        acq = merged.get('acquisition_type') or Equipment.ACQUISITION_NEW
        if acq == Equipment.ACQUISITION_EXPENSE and merged.get('accumulated_depreciation'):
            raise serializers.ValidationError(
                {
                    'accumulated_depreciation': (
                        'Not used when acquisition type is expense.'
                    ),
                },
            )

        qty = merged.get('quantity') or 1
        unit_cost = merged.get('unit_cost') or 0
        cost = qty * unit_cost
        acc = merged.get('accumulated_depreciation') or 0
        if acc < 0:
            raise serializers.ValidationError(
                {'accumulated_depreciation': 'Cannot be negative.'},
            )
        if acc > cost:
            raise serializers.ValidationError(
                {'accumulated_depreciation': 'Cannot exceed original cost.'},
            )
        residual = merged.get('residual_value') or 0
        if residual < 0:
            raise serializers.ValidationError(
                {'residual_value': 'Cannot be negative.'})
        if residual > cost:
            raise serializers.ValidationError(
                {'residual_value': 'Cannot exceed original cost.'},
            )
        return attrs
