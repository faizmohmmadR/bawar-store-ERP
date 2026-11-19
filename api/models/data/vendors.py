from django.db import models
from api.models.data.base import BaseModel


class Vendor(BaseModel):
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(max_length=255, blank=True, null=True)
    address = models.CharField(blank=True, null=True, max_length=255)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name
