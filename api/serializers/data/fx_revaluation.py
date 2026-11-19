from rest_framework import serializers

from api.models.data.fx_revaluation import FxRevaluation
from api.serializers.data.base import DataRootSerializer


class FxRevaluationSerializer(DataRootSerializer):
    created_by_details = serializers.SerializerMethodField()

    class Meta:
        model = FxRevaluation
        fields = '__all__'
        read_only_fields = (
            'total_gain',
            'total_loss',
            'closing_rates',
            'posted_at',
            'created_by',
        )

    def get_created_by_details(self, obj):
        if not obj.created_by_id:
            return None
        u = obj.created_by
        return {
            'id': u.id,
            'username': u.username,
            'fullname': f'{u.first_name or ""} {u.last_name or ""}'.strip(),
        }
