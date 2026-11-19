from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from api.models.data.attachment import AttachedDocument
from api.serializers.data.attachment import AttachedDocumentSerializer
from api.services.attachments import assert_can_write_owner, assert_owner_accessible, documents_for, resolve_owner
from api.views.data.base import DataRootViewSet


class AttachedDocumentViewSet(DataRootViewSet):
    queryset = AttachedDocument.objects.all()
    serializer_class = AttachedDocumentSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = None
    permission_codenames = [
        'view_payments',
        'add_payments',
        'edit_payments',
        'view_sale_payments',
        'view_sales',
        'add_sales',
        'edit_sales',
    ]

    def get_queryset(self):
        qs = super().get_queryset()
        owner_type = self.request.query_params.get('owner_type')
        object_id = self.request.query_params.get('object_id')
        if owner_type and object_id:
            owner = resolve_owner(owner_type, object_id)
            assert_owner_accessible(self.request.user, owner)
            return documents_for(owner)
        if self.action in ('list',):
            return qs.none()
        return qs

    def perform_create(self, serializer):
        serializer.save()

    def perform_update(self, serializer):
        assert_can_write_owner(self.request.user, serializer.instance.content_object)
        serializer.save()

    def perform_destroy(self, instance):
        assert_can_write_owner(self.request.user, instance.content_object)
        instance.delete()
