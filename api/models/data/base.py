from django.db import models

from api.models.soft_delete import SoftDeleteModelMixin


class BaseModel(SoftDeleteModelMixin, models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True