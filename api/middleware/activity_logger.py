"""HTTP middleware that records authenticated write actions into ActivityLog."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

from django.utils.deprecation import MiddlewareMixin

from api.models.data.activity_log import ActivityLog

logger = logging.getLogger(__name__)

# Paths that should never create activity rows (noise / meta).
_EXCLUDED_PREFIXES = (
    '/api/activity-logs',
    '/api/notifications',
    '/admin/',
    '/static/',
    '/media/',
)

_EXCLUDED_METHODS = frozenset({'GET', 'OPTIONS', 'HEAD'})

# Trailing viewset actions mapped to ActivityLog.action values.
_ACTION_ALIASES = {
    'pay': 'payment',
    'payment': 'payment',
    'login': 'login',
    'logout': 'logout',
    'logoutall': 'logout',
    'export': 'export',
    'sync': 'update',
}

_SENSITIVE_KEYS = frozenset({
    'password',
    'password1',
    'password2',
    'old_password',
    'new_password',
    'confirm_password',
    'token',
    'access',
    'refresh',
    'secret',
    'otp',
    'code',
})

_ID_RE = re.compile(r'^\d+$')


class ActivityLoggerMiddleware(MiddlewareMixin):
    """Log successful mutating API calls for the authenticated user."""

    def process_response(self, request, response):
        try:
            if not self._should_log(request, response):
                return response
            self._log_activity(request, response)
        except Exception:
            # Never break the request because of logging.
            logger.exception('Activity logging failed for %s %s', request.method, request.path)
        return response

    def _should_log(self, request, response) -> bool:
        user = getattr(request, 'user', None)
        if not user or not getattr(user, 'is_authenticated', False):
            return False

        path = request.path or ''
        if any(path.startswith(prefix) for prefix in _EXCLUDED_PREFIXES):
            return False

        method = (request.method or '').upper()
        if method in _EXCLUDED_METHODS:
            return False

        # Successful responses only.
        if response.status_code not in (200, 201, 204):
            return False

        model_name, _object_id, _extra = self._parse_path(path)
        return bool(model_name)

    def _log_activity(self, request, response) -> None:
        path = request.path or ''
        method = (request.method or '').upper()
        model_name, object_id, path_action = self._parse_path(path)
        if not model_name:
            return

        action = self._resolve_action(method, model_name, path_action)
        object_id = object_id or self._object_id_from_response(response)
        description = self._generate_description(request.user, action, model_name, object_id, path_action)

        ActivityLog.objects.create(
            user=request.user,
            action=action,
            model_name=model_name,
            object_id=object_id,
            description=description,
            ip_address=self._get_client_ip(request),
            user_agent=(request.META.get('HTTP_USER_AGENT') or '')[:2000],
            changes=self._safe_changes(request),
        )

    def _resolve_action(self, method: str, model_name: str, path_action: Optional[str]) -> str:
        if model_name in ('login', 'logout', 'logoutall'):
            return 'login' if model_name == 'login' else 'logout'
        if path_action and path_action in _ACTION_ALIASES:
            return _ACTION_ALIASES[path_action]
        mapping = {
            'POST': 'create',
            'PUT': 'update',
            'PATCH': 'update',
            'DELETE': 'delete',
        }
        return mapping.get(method, 'view')

    def _parse_path(self, path: str) -> tuple[Optional[str], Optional[int], Optional[str]]:
        """
        /api/<resource>/
        /api/<resource>/<id>/
        /api/<resource>/<id>/<action>/
        """
        parts = [p for p in path.split('/') if p]
        if len(parts) < 2 or parts[0] != 'api':
            return None, None, None

        resource = parts[1].replace('-', '_')
        object_id = None
        path_action = None

        if len(parts) >= 3:
            if _ID_RE.match(parts[2]):
                object_id = int(parts[2])
                if len(parts) >= 4 and not _ID_RE.match(parts[3]):
                    path_action = parts[3].replace('-', '_')
            elif not _ID_RE.match(parts[2]):
                # /api/login/ or another custom API action.
                path_action = parts[2].replace('-', '_')

        # Auth endpoints: treat resource itself as the action target.
        if resource in ('login', 'logout', 'logoutall'):
            return resource, object_id, resource

        return resource, object_id, path_action

    def _object_id_from_response(self, response) -> Optional[int]:
        try:
            data = getattr(response, 'data', None)
            if isinstance(data, dict) and data.get('id') is not None:
                return int(data['id'])
        except (TypeError, ValueError, AttributeError):
            return None
        return None



    def _generate_description(self, user, action, model_name, object_id, path_action) -> str:
        first = (getattr(user, 'first_name', None) or '').strip()
        last = (getattr(user, 'last_name', None) or '').strip()
        user_name = f'{first} {last}'.strip() or getattr(user, 'username', None) or 'User'
        try:
            role = user.get_role_display()
        except Exception:
            role = getattr(user, 'role', '') or 'user'

        model_display = model_name.replace('_', ' ').title()
        verb = {
            'create': 'created',
            'update': 'updated',
            'delete': 'deleted',
            'login': 'logged in',
            'logout': 'logged out',
            'payment': 'paid',
            'export': 'exported',
            'view': 'viewed',
        }.get(action, action)

        if action in ('login', 'logout'):
            return f'{user_name} ({role}) {verb}'

        detail = f'{model_display}'
        if object_id:
            detail = f'{model_display} #{object_id}'
        if path_action and path_action not in _ACTION_ALIASES and path_action not in (
            'create',
            'update',
            'delete',
        ):
            detail = f'{detail} ({path_action.replace("_", " ")})'

        return f'{user_name} ({role}) {verb} {detail}'

    def _safe_changes(self, request) -> Optional[dict[str, Any]]:
        method = (request.method or '').upper()
        if method not in ('POST', 'PUT', 'PATCH'):
            return None

        raw = None
        try:
            if hasattr(request, 'data'):
                raw = request.data
            elif getattr(request, 'body', None):
                raw = json.loads(request.body.decode('utf-8') or '{}')
        except Exception:
            return None

        if raw is None:
            return None
        if hasattr(raw, 'dict'):
            try:
                raw = raw.dict()
            except Exception:
                raw = dict(raw)
        if not isinstance(raw, dict):
            return None

        cleaned: dict[str, Any] = {}
        for key, value in raw.items():
            key_l = str(key).lower()
            if key_l in _SENSITIVE_KEYS or 'password' in key_l or 'token' in key_l:
                cleaned[key] = '***'
            else:
                cleaned[key] = value
        return cleaned or None

    def _get_client_ip(self, request) -> Optional[str]:
        forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        if forwarded:
            return forwarded.split(',')[0].strip() or None
        return request.META.get('REMOTE_ADDR')
