from rest_framework.exceptions import NotFound


class SoftDeleteViewSetMixin:
    """Move records to trash on DELETE; hard-delete only with ?permanent=true."""

    soft_delete_enabled = True

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('trash') == 'true':
            model = qs.model
            if hasattr(model, 'all_objects'):
                qs = model.all_objects.filter(deleted_at__isnull=False)
            else:
                qs = qs.filter(deleted_at__isnull=False)
            return self.filter_queryset(qs)
        return qs

    def perform_destroy(self, instance):
        if not getattr(self, 'soft_delete_enabled', True):
            self.perform_hard_destroy(instance)
            return
        if self._permanent_delete_requested():
            self.perform_hard_destroy(instance)
            return
        if hasattr(instance, 'soft_delete'):
            instance.soft_delete(user=self.request.user)
            return
        self.perform_hard_destroy(instance)

    def perform_hard_destroy(self, instance):
        instance.delete()

    def _permanent_delete_requested(self):
        request = getattr(self, 'request', None)
        if request is None:
            return False
        return request.query_params.get('permanent') == 'true'
