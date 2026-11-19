from django.db import models


class DocumentNumberSequence(models.Model):
    """Persistent reservations, including numbers whose documents were deleted."""

    key = models.CharField(max_length=150, unique=True)
    last_value = models.PositiveBigIntegerField(default=0)
