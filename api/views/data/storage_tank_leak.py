from django.db import transaction
from rest_framework.exceptions import ValidationError

from api.models.data.storage_tank_leak import StorageTankLeak
from api.serializers.data.storage_tank_leak import StorageTankLeakSerializer
from api.services.storage_tank_leak import reverse_tank_leak
from api.views.data.base import DataRootViewSet


class StorageTankLeakViewSet(DataRootViewSet):
    permission_module = 'storage_tanks'
    queryset = StorageTankLeak.objects.select_related(
        'storage_tank', 'damaged_record', 'performed_by',
    ).all()
    serializer_class = StorageTankLeakSerializer
    search_fields = ['storage_tank__name', 'notes', 'damaged_record__damaged_number']
    filterset_fields = ['storage_tank']
    http_method_names = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

    @transaction.atomic
    def perform_create(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        if instance.deleted_at:
            raise ValidationError({'detail': 'This leak was already reversed.'})
        reverse_tank_leak(instance, user=self.request.user)
