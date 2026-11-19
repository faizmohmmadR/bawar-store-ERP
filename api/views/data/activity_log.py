from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count, Q

from api.models.data.activity_log import ActivityLog
from api.serializers.data.activity_log import ActivityLogSerializer
from api.views.data.base import DataRootViewSet


class ActivityLogViewSet(DataRootViewSet):
    """Read-only activity feed. Writes come from ActivityLoggerMiddleware."""

    permission_module = 'activity_logs'
    permission_codenames = ('view_activity_logs', 'view_settings')
    http_method_names = ['get', 'head', 'options']
    queryset = ActivityLog.objects.select_related('user').all()
    serializer_class = ActivityLogSerializer
    search_fields = [
        'description',
        'user__username',
        'user__first_name',
        'user__last_name',
        'user__email',
        'model_name',
    ]
    ordering_fields = ['created_at', 'action', 'model_name']
    ordering = ['-created_at']

    def get_queryset(self):
        """

        """

        qs = super().get_queryset()
        user = self.request.user
        return qs

    @action(detail=False, methods=['get'])
    def stats(self, request):
        queryset = self.get_queryset()
        stats = {
            'total_activities': queryset.count(),
            'by_action': list(queryset.values('action').annotate(count=Count('id'))),
            'by_user': list(
                queryset.values(
                    'user__username',
                    'user__first_name',
                    'user__last_name',
                    'user__role',
                ).annotate(count=Count('id'))[:10]
            ),
            'by_model': list(queryset.values('model_name').annotate(count=Count('id'))),
        }
        return Response(stats)
