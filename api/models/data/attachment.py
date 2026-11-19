from uuid import uuid4

from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.core.validators import FileExtensionValidator
from django.db import models
from django.utils import timezone
from django.utils.text import get_valid_filename

from api.models.data.base import BaseModel

ALLOWED_DOCUMENT_EXTENSIONS = ('pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif')
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024  # 10 MB


def attachment_upload_to(instance, filename):
    """Store as attachments/<owner>/<ref>/<uuid>.<ext> — not the original upload name as the title."""
    model = 'misc'
    ref = 'file'
    if getattr(instance, 'content_type_id', None) and instance.content_type:
        model = instance.content_type.model
    owner = getattr(instance, 'content_object', None)
    if owner is not None:
        invoice = (getattr(owner, 'invoice_number', None) or '').strip()
        if invoice:
            ref = get_valid_filename(invoice)[:40]
        elif getattr(owner, 'pk', None):
            ref = f'id-{owner.pk}'
        elif instance.object_id:
            ref = f'id-{instance.object_id}'
    elif instance.object_id:
        ref = f'id-{instance.object_id}'
    now = timezone.now()
    ext = ''
    if filename and '.' in filename:
        ext = '.' + filename.rsplit('.', 1)[-1].lower()[:8]
    return f'attachments/{model}/{ref}/{now:%Y/%m}/{uuid4().hex[:12]}{ext}'


class AttachedDocument(BaseModel):
    """Image or PDF attached to a purchase, payment, or other record."""

    title = models.CharField(max_length=255)
    file = models.FileField(
        upload_to=attachment_upload_to,
        validators=[FileExtensionValidator(allowed_extensions=list(ALLOWED_DOCUMENT_EXTENSIONS))],
    )
    original_name = models.CharField(max_length=255, blank=True)
    file_size = models.PositiveIntegerField(default=0)
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey('content_type', 'object_id')

    class Meta:
        ordering = ['id']
        indexes = [
            models.Index(fields=['content_type', 'object_id']),
        ]

    def save(self, *args, **kwargs):
        if self.file:
            if not self.original_name:
                self.original_name = get_valid_filename(getattr(self.file, 'name', '') or '')[:255]
            size = getattr(self.file, 'size', None)
            if size:
                self.file_size = int(size)
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        storage = self.file.storage if self.file else None
        name = self.file.name if self.file else None
        super().delete(*args, **kwargs)
        if storage and name:
            storage.delete(name)

    @property
    def content_kind(self) -> str:
        name = (self.original_name or getattr(self.file, 'name', '') or '').lower()
        if name.endswith('.pdf'):
            return 'pdf'
        if name.endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif')):
            return 'image'
        return 'file'

    def __str__(self):
        return self.title or self.original_name or f'Document {self.pk}'
