from rest_framework.exceptions import ValidationError

from api.models.data.fx_revaluation import FxRevaluation
from api.serializers.data.fx_revaluation import FxRevaluationSerializer
from api.views.data.base import DataRootViewSet


class FxRevaluationViewSet(DataRootViewSet):
    permission_module = 'fx_revaluations'
    queryset = (
        FxRevaluation.objects.select_related('created_by')
        .all()
        .order_by('-as_of_date', '-id')
    )
    serializer_class = FxRevaluationSerializer
    filterset_fields = ['status', 'as_of_date']
    search_fields = ['notes']

    def get_queryset(self):
        qs = super().get_queryset()
        return qs

    def perform_create(self, serializer):
        from api.services.accounting.revaluation import run_fx_revaluation

        as_of_date = serializer.validated_data['as_of_date']
        notes = serializer.validated_data.get('notes') or ''
        status = serializer.validated_data.get('status') or FxRevaluation.STATUS_POSTED
        reval = run_fx_revaluation(
            as_of_date=as_of_date,
            created_by=self.request.user,
            notes=notes,
            status=status,
        )
        serializer.instance = reval

    def perform_update(self, serializer):
        instance = self.get_object()
        if instance.status == FxRevaluation.STATUS_POSTED:
            new_status = serializer.validated_data.get('status', instance.status)
            # Allow reverse or notes-only; block changing as_of_date on posted.
            if 'as_of_date' in serializer.validated_data and serializer.validated_data['as_of_date'] != instance.as_of_date:
                raise ValidationError('Posted revaluations cannot change as_of_date. Reverse and create a new run.')
            if new_status not in (FxRevaluation.STATUS_POSTED, FxRevaluation.STATUS_REVERSED):
                raise ValidationError('A posted revaluation can only stay posted or be reversed.')
            serializer.save()
            return
        if instance.status == FxRevaluation.STATUS_REVERSED:
            raise ValidationError('A reversed FX revaluation cannot be edited.')

        serializer.save()

    def perform_destroy(self, instance):
        if instance.status == FxRevaluation.STATUS_POSTED:
            raise ValidationError('Posted FX revaluations cannot be deleted. Reverse the document instead.')
        instance.delete()
