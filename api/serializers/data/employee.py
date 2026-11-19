from rest_framework import serializers

from api.models.data.currency import currency_details as _currency_details_fn
from api.models.data.employee import Employee
from api.serializers.data.base import DataRootSerializer
from api.services.employee_account import create_user_for_employee


def _truthy(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or '').strip().lower() in ('1', 'true', 'yes', 'on')


class EmployeeSerializer(DataRootSerializer):
    contract_start_date = serializers.DateField(required=True, allow_null=False)
    currency = serializers.IntegerField(required=False, allow_null=True)
    currency_details = serializers.SerializerMethodField(read_only=True)
    contract_duration_days = serializers.SerializerMethodField(read_only=True)
    contract_duration_months = serializers.SerializerMethodField(read_only=True)
    contract_duration_years = serializers.SerializerMethodField(read_only=True)
    user_details = serializers.SerializerMethodField(read_only=True)
    create_account = serializers.BooleanField(write_only=True, required=False, default=False)
    account_password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, style={'input_type': 'password'}
    )
    account_email = serializers.EmailField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Employee
        fields = "__all__"
        extra_kwargs = {
            "tazkira_number": {"required": False, "allow_blank": True},
            "tazkira_copy": {"required": False, "allow_null": True},
        }

    def get_currency_details(self, obj):
        return _currency_details_fn(obj.currency)

    def get_contract_duration_days(self, obj):
        return obj.contract_duration_days

    def get_contract_duration_months(self, obj):
        return obj.contract_duration_months

    def get_contract_duration_years(self, obj):
        return obj.contract_duration_years

    def get_user_details(self, obj):
        user = getattr(obj, 'user', None)
        if not user:
            return None
        return {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'role': user.role,
            'is_active': user.is_active,
        }

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not attrs.get('full_name') and not getattr(self.instance, 'full_name', None):
            raise serializers.ValidationError({'full_name': 'Full name is required.'})
        if not attrs.get('phone') and not getattr(self.instance, 'phone', None):
            raise serializers.ValidationError({'phone': 'Phone is required.'})
        start = attrs.get('contract_start_date', getattr(self.instance, 'contract_start_date', None))
        if not start:
            raise serializers.ValidationError({'contract_start_date': 'Contract start date is required.'})
        end = attrs.get('contract_end_date', getattr(self.instance, 'contract_end_date', None))
        if start and end and end < start:
            raise serializers.ValidationError({'contract_end_date': 'Contract end date must be after start date.'})
        if _truthy(attrs.get('create_account')):
            password = attrs.get('account_password') or ''
            email = (
                attrs.get('account_email')
                or attrs.get('email')
                or getattr(self.instance, 'email', None)
                or ''
            ).strip()
            if not password:
                raise serializers.ValidationError({'account_password': 'Password is required.'})
            if not email:
                raise serializers.ValidationError({'account_email': 'Email is required for the login account.'})
        return attrs

    def create(self, validated_data):
        create_account = _truthy(validated_data.pop('create_account', False))
        password = validated_data.pop('account_password', None)
        account_email = validated_data.pop('account_email', None)
        employee = super().create(validated_data)
        if create_account:
            request = self.context.get('request')
            create_user_for_employee(
                employee,
                email=account_email or employee.email or '',
                password=password or '',
                actor=getattr(request, 'user', None),
            )
        return employee

    def update(self, instance, validated_data):
        validated_data.pop('create_account', None)
        validated_data.pop('account_password', None)
        validated_data.pop('account_email', None)
        return super().update(instance, validated_data)
