from django.utils import timezone
from django.db import models
from api.models.data.base import BaseModel

from api.models.data.currency import CURRENCY_CHOICES
from django.contrib.auth import get_user_model

User = get_user_model()

class ExpenseCategory(BaseModel):
    """Category model for organizing expenses"""
    name = models.CharField(max_length=100)
    description = models.CharField(max_length=200, blank=True, null=True)

    def __str__(self):
        return self.name    
    
    
    
class Expense(BaseModel):
    """Expense model for tracking business expenses"""

    PAYMENT_CASH = 'cash'
    PAYMENT_BANK = 'bank'
    PAYMENT_SARAFI = 'sarafi'
    PAYMENT_METHOD_CHOICES = [
        (PAYMENT_CASH, 'Cash'),
        (PAYMENT_BANK, 'Bank'),
        (PAYMENT_SARAFI, 'Sarafi'),
    ]

    category = models.ForeignKey(ExpenseCategory, on_delete=models.CASCADE, related_name='expenses')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    amount_base = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=1)
    expense_date = models.DateTimeField(default=timezone.now)
    currency = models.IntegerField(choices=CURRENCY_CHOICES)
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default=PAYMENT_CASH,
        help_text='Cash book credited when the expense is posted',
    )

    receipt = models.FileField(upload_to='expenses/receipts/', blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='expenses')
    

    def __str__(self):
        currency_info = f" ({self.get_currency_display()})" if self.currency else ""
        return f"{self.category.name} - {self.amount}{currency_info} ({self.expense_date})"

