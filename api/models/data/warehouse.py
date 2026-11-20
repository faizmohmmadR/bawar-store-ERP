from django.db import models

from api.models.data.base import BaseModel


class Warehouse(BaseModel):
    """Physical stock location. Single-company ERP; balances are warehouse-scoped."""

    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    address = models.TextField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-is_default', 'name']

    def __str__(self):
        return f'{self.code} — {self.name}'

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.is_default:
            type(self).objects.exclude(pk=self.pk).filter(is_default=True).update(is_default=False)
