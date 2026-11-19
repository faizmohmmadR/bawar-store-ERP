from rest_framework.permissions import BasePermission


class IsSuperUser(BasePermission):
    """Only Django superusers (main admin) may access."""

    message = 'Only the system administrator can perform this action.'

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_superuser)


class IsAdminOrSuperUser(BasePermission):
    """Admin or superuser accounts."""

    message = 'Admin access required.'

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, 'is_hq', False))


class HasPermission(BasePermission):
    """Require a single permission codename (admin/superuser bypass)."""

    def __init__(self, codename: str):
        self.codename = codename

    def __call__(self):
        # Allow using HasPermission(...) directly inside DRF permission_classes.
        return self

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return user.has_permission(self.codename)


class HasAnyPermission(BasePermission):
    """Require any one of the given permission codenames."""

    def __init__(self, codenames):
        self.codenames = list(codenames)

    def __call__(self):
        # Allow using HasAnyPermission([...]) directly inside DRF permission_classes.
        return self

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return any(user.has_permission(c) for c in self.codenames)


_ACTION_VERB = {
    'list': 'view',
    'retrieve': 'view',
    'create': 'add',
    'update': 'edit',
    'partial_update': 'edit',
    'destroy': 'delete',
}


def _user_has_required(user, required):
    if not required:
        return True
    if isinstance(required, (list, tuple, set, frozenset)):
        return any(user.has_permission(c) for c in required)
    return user.has_permission(required)


class HasModulePermission(BasePermission):
    """
    Map DRF actions to view_/add_/edit_/delete_{module} codenames.
    Set permission_module on the view/viewset, or permission_codenames for OR checks.
    permission_action_map values may be a single codename or a list (OR).
    """

    message = 'You do not have permission to perform this action.'

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if getattr(user, 'is_hq', False):
            return True

        action = getattr(view, 'action', None)

        codenames = getattr(view, 'permission_codenames', None)
        if codenames and action in ('list', 'retrieve'):
            return any(user.has_permission(c) for c in codenames)

        action_map = getattr(view, 'permission_action_map', None) or {}
        if action in action_map:
            return _user_has_required(user, action_map[action])

        module = getattr(view, 'permission_module', None)
        if not module:
            return True

        verb = _ACTION_VERB.get(action, 'view')
        return user.has_permission(f'{verb}_{module}')
