from rest_framework import serializers
from api.models.data.currency import CURRENCY_CHOICES, currency_details as _currency_details_fn
from api.models.data.expenses import Expense, ExpenseCategory
from api.serializers.data.base import DataRootSerializer
from api.mixins.base_currency import BaseCurrencySerializerMixin



class ExpenseCategorySerializer(DataRootSerializer):
    class Meta:
        model = ExpenseCategory
        fields = "__all__"

class ExpenseSerializer(BaseCurrencySerializerMixin, DataRootSerializer):
    base_currency_amount_fields = ('amount',)
    base_currency_date_field = 'expense_date'

    currency = serializers.IntegerField()
    category_details = serializers.SerializerMethodField()
    user_details = serializers.SerializerMethodField()
    currency_details = serializers.SerializerMethodField()
    
    class Meta:
        model = Expense
        fields = "__all__"
    
    def get_category_details(self, obj):
        if obj.category:
            return {
                "id": obj.category.id,
                "name": obj.category.name
            }
        return None
    
    def get_user_details(self, obj):
        if obj.user:
            return {
                "id": obj.user.id,
                "fullname": f"{obj.user.first_name or ''} {obj.user.last_name or ''}".strip(),
                "username": obj.user.username,
                "email": obj.user.email
            }
        return None
    
    def get_currency_details(self, obj):
        return _currency_details_fn(obj.currency)