"""Access helpers for user / branch scoping."""

from rest_framework.exceptions import PermissionDenied


def user_is_hq(user) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    return bool(getattr(user, 'is_hq', False))


def assert_can_manage_user(actor, target):
    """
    Ensure the actor may view/edit the target user's permissions.
    HQ / superuser may manage anyone. Staff with permission may manage
    non-admin users only.
    """
    if not actor or not getattr(actor, 'is_authenticated', False):
        raise PermissionDenied('Authentication required.')
    if target is None:
        raise PermissionDenied('User not found.')
    if user_is_hq(actor):
        return
    if getattr(target, 'is_superuser', False) or user_is_hq(target):
        raise PermissionDenied('You cannot manage administrator accounts.')
