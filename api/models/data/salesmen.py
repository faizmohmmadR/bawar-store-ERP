from django.db import models

from api.models.data.base import BaseModel


class Salesman(BaseModel):
    """Sales representative who can earn commission on sale lines."""

    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(max_length=255, blank=True, null=True)
    address = models.CharField(blank=True, null=True, max_length=255)
    is_active = models.BooleanField(default=True)
    notes = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name
