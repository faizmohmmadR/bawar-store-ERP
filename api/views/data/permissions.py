from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from account.models import User
from account.permissions import IsSuperUser, HasAnyPermission, HasPermission
from api.models.data.permissions import Permission, UserPermission
from api.serializers.data.permissions import (
    PermissionSerializer,
    UserPermissionSerializer,
    UserPermissionUpdateSerializer,
)
from api.services.default_permissions import initialize_default_permissions
from api.utils.branch_scope import assert_can_manage_user


def _parse_granted(value):
    if isinstance(value, bool):
        return value
    return str(value).lower() in ('true', '1', 'yes')


class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Permission.objects.all()
    serializer_class = PermissionSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        HasAnyPermission(['view_permissions', 'edit_permissions']),
    ]

    def get_queryset(self):
        queryset = super().get_queryset()
        module = self.request.query_params.get('module')
        if module:
            queryset = queryset.filter(module=module)
        return queryset.order_by('module', 'name')

    @action(detail=False, methods=['post'], url_path='initialize_defaults')
    def initialize_defaults(self, request):
        """Create or update all default ERP permissions."""
        if not request.user.is_superuser:
            return Response(
                {'detail': 'Only the system administrator can initialize permissions.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        result = initialize_default_permissions()
        return Response(
            {
                'detail': 'Default permissions initialized successfully.',
                **result,
            },
            status=status.HTTP_200_OK,
        )


class UserPermissionViewSet(viewsets.ModelViewSet):
    serializer_class = UserPermissionSerializer

    def get_permissions(self):
        if self.action == 'user_permissions':
            return [
                permissions.IsAuthenticated(),
                HasAnyPermission(['view_permissions', 'edit_permissions']),
            ]
        if self.action == 'bulk_update':
            return [permissions.IsAuthenticated(), HasPermission('edit_permissions')]
        return [permissions.IsAuthenticated(), HasPermission('edit_permissions')]

    def get_queryset(self):
        user_id = self.kwargs.get('user_id')
        if user_id:
            return UserPermission.objects.filter(user_id=user_id).select_related('permission', 'user').order_by('pk')
        return UserPermission.objects.select_related('permission', 'user').order_by('pk')

    @action(detail=False, methods=['post'], url_path='bulk-update')
    def bulk_update(self, request, user_id=None):
        user = get_object_or_404(User, id=user_id)
        assert_can_manage_user(request.user, user)
        serializer = UserPermissionUpdateSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        for perm_data in serializer.validated_data['permissions']:
            permission = get_object_or_404(Permission, id=perm_data['permission_id'])
            granted = _parse_granted(perm_data['granted'])

            user_permission, created = UserPermission.objects.get_or_create(
                user=user,
                permission=permission,
                defaults={'granted': granted},
            )
            if not created and user_permission.granted != granted:
                user_permission.granted = granted
                user_permission.save(update_fields=['granted', 'updated_at'])

        updated_permissions = UserPermission.objects.filter(user=user).select_related('permission')
        response_serializer = UserPermissionSerializer(updated_permissions, many=True)
        return Response(response_serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='user-permissions')
    def user_permissions(self, request, user_id=None):
        user = get_object_or_404(User, id=user_id)
        assert_can_manage_user(request.user, user)
        all_permissions = Permission.objects.all().order_by('module', 'name')
        user_permissions = UserPermission.objects.filter(user=user)
        granted_permissions = {up.permission_id: up.granted for up in user_permissions}

        result = [
            {
                'id': permission.id,
                'name': permission.name,
                'codename': permission.codename,
                'module': permission.module,
                'description': permission.description,
                'granted': granted_permissions.get(permission.id, False),
            }
            for permission in all_permissions
        ]
        return Response(result, status=status.HTTP_200_OK)
