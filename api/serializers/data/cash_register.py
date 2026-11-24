from decimal import Decimal

from rest_framework import serializers

from api.models.data.cash_register import (
    CashCountLine,
    CashRegister,
    CashSession,
    CashTransaction,
)
from api.services.cash_register import AFN_DENOMINATIONS, session_totals


class CashRegisterSerializer(serializers.ModelSerializer):
    linked_cash_account_code = serializers.CharField(
        source='linked_cash_account.code', read_only=True,
    )
    linked_cash_account_name = serializers.CharField(
        source='linked_cash_account.name', read_only=True,
    )

    class Meta:
        model = CashRegister
        fields = [
            'id', 'name', 'code', 'linked_cash_account', 'linked_cash_account_code',
            'linked_cash_account_name', 'default_currency', 'is_active', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class CashCountLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = CashCountLine
        fields = ['id', 'denomination', 'quantity', 'subtotal']
        read_only_fields = ['subtotal']


class CashTransactionSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    direction_display = serializers.CharField(source='get_direction_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    cash_in = serializers.SerializerMethodField()
    cash_out = serializers.SerializerMethodField()
    source_type = serializers.SerializerMethodField()
    accounting_status = serializers.SerializerMethodField()

    class Meta:
        model = CashTransaction
        fields = [
            'id', 'cash_register', 'cash_session', 'direction', 'direction_display',
            'category', 'category_display', 'amount', 'cash_in', 'cash_out',
            'currency', 'exchange_rate', 'amount_base', 'description',
            'transaction_date', 'status', 'created_by', 'created_by_name',
            'content_type', 'object_id', 'source_type', 'posts_own_journal',
            'accounting_status', 'created_at',
        ]
        read_only_fields = fields

    def get_created_by_name(self, obj):
        user = obj.created_by
        if not user:
            return None
        return getattr(user, 'get_full_name', lambda: None)() or getattr(user, 'username', str(user))

    def get_cash_in(self, obj):
        if obj.direction == CashTransaction.DIRECTION_IN:
            return obj.amount
        return Decimal('0')

    def get_cash_out(self, obj):
        if obj.direction == CashTransaction.DIRECTION_OUT:
            return obj.amount
        return Decimal('0')

    def get_source_type(self, obj):
        if obj.content_type_id:
            return f'{obj.content_type.app_label}.{obj.content_type.model}'
        return None

    def get_accounting_status(self, obj):
        if not obj.posts_own_journal and obj.content_type_id:
            return 'via_source'
        if obj.posts_own_journal:
            return 'posted'
        if obj.category == CashTransaction.CAT_INITIAL_CASH:
            return 'brought_forward'
        return 'none'


class CashSessionSerializer(serializers.ModelSerializer):
    opened_by_name = serializers.SerializerMethodField()
    closed_by_name = serializers.SerializerMethodField()
    totals = serializers.SerializerMethodField()
    count_lines = CashCountLineSerializer(many=True, read_only=True)
    cash_register_code = serializers.CharField(source='cash_register.code', read_only=True)

    class Meta:
        model = CashSession
        fields = [
            'id', 'cash_register', 'cash_register_code', 'session_number', 'currency',
            'opening_balance', 'opening_source', 'opened_by', 'opened_by_name',
            'opened_at', 'expected_closing_balance', 'actual_closing_balance',
            'cash_difference', 'difference_reason', 'carry_forward_amount',
            'status', 'closed_by', 'closed_by_name', 'closed_at', 'notes',
            'totals', 'count_lines', 'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_opened_by_name(self, obj):
        user = obj.opened_by
        if not user:
            return None
        return getattr(user, 'get_full_name', lambda: None)() or getattr(user, 'username', str(user))

    def get_closed_by_name(self, obj):
        user = obj.closed_by
        if not user:
            return None
        return getattr(user, 'get_full_name', lambda: None)() or getattr(user, 'username', str(user))

    def get_totals(self, obj):
        data = session_totals(obj)
        return {k: (str(v) if isinstance(v, Decimal) else v) for k, v in data.items()}


class OpenSessionSerializer(serializers.Serializer):
    opening_balance = serializers.DecimalField(
        max_digits=15, decimal_places=2, required=False, allow_null=True,
    )
    opening_deposit = serializers.DecimalField(
        max_digits=15, decimal_places=2, required=False, allow_null=True,
        help_text='Cash put into the drawer at open today (on top of yesterday carry-forward).',
    )
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    currency = serializers.IntegerField(required=False)


class CloseSessionSerializer(serializers.Serializer):
    actual_closing_balance = serializers.DecimalField(max_digits=15, decimal_places=2)
    carry_forward_amount = serializers.DecimalField(max_digits=15, decimal_places=2)
    difference_reason = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    count_lines = serializers.ListField(
        child=serializers.DictField(), required=False, allow_empty=True,
    )
    removals = serializers.ListField(
        child=serializers.DictField(), required=False, allow_empty=True,
    )


class DepositCashSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=Decimal('0.01'))
    description = serializers.CharField(required=False, allow_blank=True, default='')
    currency = serializers.IntegerField(required=False)


class ManualCashTransactionSerializer(serializers.Serializer):
    MANUAL_CATEGORIES = {
        CashTransaction.CAT_OWNER_CAPITAL,
        CashTransaction.CAT_OTHER_RECEIPT,
        CashTransaction.CAT_OTHER_PAYMENT,
        CashTransaction.CAT_BANK_DEPOSIT,
        CashTransaction.CAT_OWNER_WITHDRAWAL,
    }

    category = serializers.ChoiceField(choices=CashTransaction.CATEGORY_CHOICES)
    amount = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=Decimal('0.01'))
    description = serializers.CharField(required=False, allow_blank=True, default='')
    currency = serializers.IntegerField(required=False)

    def validate_category(self, value):
        if value not in self.MANUAL_CATEGORIES:
            raise serializers.ValidationError(
                'Only owner capital, other receipt/payment, bank deposit, or owner withdrawal '
                'may be entered manually. Sales, expenses, and payments sync automatically.',
            )
        return value


class CashCountPreviewSerializer(serializers.Serializer):
    lines = serializers.ListField(child=serializers.DictField(), allow_empty=True)

    def create_total(self):
        total = Decimal('0')
        normalized = []
        for row in self.validated_data.get('lines') or []:
            try:
                denom = Decimal(str(row.get('denomination') or 0))
                qty = int(row.get('quantity') or 0)
            except (TypeError, ValueError, ArithmeticError):
                continue
            if denom <= 0 or qty < 0:
                continue
            sub = (denom * Decimal(qty)).quantize(Decimal('0.01'))
            total += sub
            normalized.append({
                'denomination': str(denom),
                'quantity': qty,
                'subtotal': str(sub),
            })
        return {
            'lines': normalized,
            'total': str(total.quantize(Decimal('0.01'))),
            'denominations': [str(d) for d in AFN_DENOMINATIONS],
        }
