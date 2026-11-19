from rest_framework import serializers

from api.mixins.base_currency import BaseCurrencySerializerMixin
from api.models.data.currency import BASE_CURRENCY_ID, currency_details as _currency_details_fn
from api.models.data.withdrawal import (
    GL_CODE_TO_PAYMENT_METHOD,
    WITHDRAWAL_GL_CODES,
    Withdrawal,
)
from api.serializers.data.base import DataRootSerializer
from api.services.gl_account_ledger import get_gl_account_totals


class WithdrawalSerializer(BaseCurrencySerializerMixin, DataRootSerializer):
    """Same currency/base-amount pattern as Expense serializers."""

    base_currency_amount_fields = ('amount',)
    base_currency_date_field = 'withdrawal_date'

    currency = serializers.IntegerField()
    currency_details = serializers.SerializerMethodField()
    recorded_by_details = serializers.SerializerMethodField()
    payment_method_label = serializers.SerializerMethodField()
    gl_account_details = serializers.SerializerMethodField()

    class Meta:
        model = Withdrawal
        fields = '__all__'
        read_only_fields = (
            'exchange_rate',
            'amount_base',
            'recorded_by',
            'payment_method',
        )

    def get_payment_method_label(self, obj):
        return obj.get_payment_method_display()

    def get_currency_details(self, obj):
        return _currency_details_fn(obj.currency)

    def get_recorded_by_details(self, obj):
        if not obj.recorded_by_id:
            return None
        u = obj.recorded_by
        return {
            'id': u.id,
            'username': u.username,
            'fullname': f'{u.first_name or ""} {u.last_name or ""}'.strip(),
        }

    def get_gl_account_details(self, obj):
        acct = obj.gl_account
        if not acct:
            return None
        totals = get_gl_account_totals(acct)
        return {
            'id': acct.id,
            'code': acct.code,
            'name': acct.name,
            'category': acct.category,
            'currency': acct.currency,
            'currency_details': _currency_details_fn(acct.currency or BASE_CURRENCY_ID),
            'all_time_totals': totals,
            'balance': totals.get('balance', 0),
        }

    def validate_gl_account(self, account):
        if account is None:
            raise serializers.ValidationError('GL account is required.')
        code = (account.code or '').strip()
        if code not in WITHDRAWAL_GL_CODES:
            raise serializers.ValidationError(
                'Withdrawals must use Cash (1000), Bank (1050), or Sarafi (1060).'
            )
        if not account.is_active:
            raise serializers.ValidationError(
                'Selected GL account is inactive.')
        return account

    def validate(self, attrs):
        # Derive payment_method / align currency before base-currency conversion.
        account = attrs.get('gl_account')
        if account is None and self.instance is not None:
            account = self.instance.gl_account
        if account is None:
            raise serializers.ValidationError(
                {'gl_account': 'GL account is required.'})

        currency = attrs.get('currency')
        if currency is None and self.instance is not None:
            currency = self.instance.currency
        if currency is None:
            currency = account.currency if account.currency is not None else BASE_CURRENCY_ID
            attrs['currency'] = currency

        account_currency = account.currency if account.currency is not None else BASE_CURRENCY_ID
        if int(currency) != int(account_currency):
            raise serializers.ValidationError(
                {
                    'currency': (
                        'Currency must match the selected GL account '
                        f'({account.code} is currency id {account_currency}).'
                    )
                }
            )

        code = (account.code or '').strip()
        attrs['payment_method'] = GL_CODE_TO_PAYMENT_METHOD.get(code, 'cash')
        attrs['currency'] = int(currency)

        # Expense pattern: convert amounts after currency is known.
        attrs = super().validate(attrs)
        return attrs
