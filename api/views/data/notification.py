from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from api.models.data.notification import Notification
from api.serializers.data.notification import NotificationSerializer
from api.services.notifications import scan_stock_alerts
from api.views.data.base import DataRootViewSet


class NotificationViewSet(DataRootViewSet):
    permission_module = 'notifications'
    queryset = Notification.objects.select_related('user').all()
    serializer_class = NotificationSerializer
    filterset_fields = ['notification_type', 'is_read']
    search_fields = ['title', 'message']
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if getattr(user, 'is_superuser', False) or getattr(user, 'is_admin', False):
            return qs
        return qs.filter(Q(user=user) | Q(user__isnull=True))

    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        count = self.get_queryset().filter(is_read=False).count()
        return Response({'count': count})

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        note = self.get_object()
        note.is_read = True
        note.save(update_fields=['is_read', 'updated_at'])
        return Response(self.get_serializer(note).data)

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        updated = self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({'updated': updated})

    @action(detail=False, methods=['post'])
    def scan_expiry(self, request):
        """Scan expiry + low/out-of-stock and create unread notifications."""
        days = int(request.data.get('days_ahead', 30) or 30)
        # low_stock_threshold is deprecated; alerts use product reorder/min levels.
        threshold = int(request.data.get('low_stock_threshold', 100) or 100)
        include_low = str(request.data.get('include_low_stock', '1')).lower() not in (
            '0',
            'false',
            'no',
        )
        result = scan_stock_alerts(
            days_ahead=days,
            low_stock_threshold=threshold,
            include_low_stock=include_low,
            mark_expired=True,
        )
        created = result['notifications']
        return Response(
            {
                'created_or_updated': result['created'],
                'refreshed': result['refreshed'],
                'resolved': result['resolved'],
                'expiry_created': result['expiry_created'],
                'low_stock_created': result['low_stock_created'],
                'summary': result['summary'],
                'notifications': self.get_serializer(created, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['post'], url_path='scan_alerts')
    def scan_alerts(self, request):
        """Alias of scan_expiry — preferred name for clients."""
        return self.scan_expiry(request)
