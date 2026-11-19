from rest_framework import serializers

from api.models.data.activity_log import ActivityLog


class ActivityLogSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    user_email = serializers.SerializerMethodField()
    user_role = serializers.SerializerMethodField()

    class Meta:
        model = ActivityLog
        fields = [
            'id',
            'user',
            'user_name',
            'user_email',
            'user_role',
            'action',
            'model_name',
            'object_id',
            'description',
            'ip_address',
            'user_agent',
            'changes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields

    def get_user_name(self, obj):
        if not obj.user:
            return 'Unknown'
        name = f'{obj.user.first_name or ""} {obj.user.last_name or ""}'.strip()
        return name or obj.user.username

    def get_user_email(self, obj):
        return obj.user.email if obj.user else None

    def get_user_role(self, obj):
        if not obj.user:
            return None
        try:
            return obj.user.get_role_display()
        except Exception:
            return getattr(obj.user, 'role', None)

        return None
