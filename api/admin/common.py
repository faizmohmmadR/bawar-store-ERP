"""Shared Django admin helpers for soft-delete ERP models."""
from django.contrib import admin


class SoftDeleteModelAdmin(admin.ModelAdmin):
    """Prefer all_objects so soft-deleted rows remain visible/filterable."""

    show_deleted_filter = True

    def get_queryset(self, request):
        model = self.model
        if hasattr(model, 'all_objects'):
            return model.all_objects.get_queryset()
        return super().get_queryset(request)

    def get_list_filter(self, request):
        filters = list(super().get_list_filter(request) or [])
        if self.show_deleted_filter and hasattr(self.model, 'deleted_at'):
            if 'deleted_at' not in filters:
                filters.append('deleted_at')
        return filters

    def get_readonly_fields(self, request, obj=None):
        fields = list(super().get_readonly_fields(request, obj) or [])
        for name in ('created_at', 'updated_at', 'deleted_at', 'deleted_by'):
            if hasattr(self.model, name) and name not in fields:
                fields.append(name)
        return fields


class ReadOnlySoftDeleteAdmin(SoftDeleteModelAdmin):
    """Useful for audit / auto-generated rows."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
