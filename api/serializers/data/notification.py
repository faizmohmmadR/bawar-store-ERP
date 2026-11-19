from rest_framework import serializers

from api.models.data.notification import Notification
from api.serializers.data.base import DataRootSerializer


class NotificationSerializer(DataRootSerializer):
    link = serializers.SerializerMethodField()
    type_label = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = '__all__'
        read_only_fields = (
            'title',
            'message',
            'notification_type',
            'content_type',
            'object_id',
            'user',
        )

    def get_link(self, obj):
        if obj.notification_type == 'stock_expiry':
            return '/stock/expiring'
        if obj.notification_type == 'low_stock':
            return '/stock/low-stock'
        return None

    def get_type_label(self, obj):
        return dict(Notification.TYPE_CHOICES).get(
            obj.notification_type, obj.notification_type
        )
