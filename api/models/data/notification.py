from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models

from api.models.data.base import BaseModel



class Notification(BaseModel):
    """In-app notifications (e.g. stock approaching expiry)."""

    TYPE_CHOICES = [
        ('stock_expiry', 'Stock Expiry'),
        ('low_stock', 'Low Stock'),
        ('transfer', 'Stock Transfer'),
        ('general', 'General'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notifications',
        help_text='Null = visible to admins/superusers',
    )
    title = models.CharField(max_length=200)
    message = models.TextField()
    notification_type = models.CharField(
        max_length=30, choices=TYPE_CHOICES, default='general'
    )
    is_read = models.BooleanField(default=False)

    content_type = models.ForeignKey(
        ContentType, on_delete=models.CASCADE, null=True, blank=True
    )
    object_id = models.PositiveIntegerField(null=True, blank=True)
    content_object = GenericForeignKey('content_type', 'object_id')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title
