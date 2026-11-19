from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError, RestrictedError
from rest_framework import serializers
from rest_framework.exceptions import APIException
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from account.permissions import HasModulePermission
from api.services.soft_delete.registry import TRASH_RETENTION_DAYS, TRASH_REGISTRY
from api.services.soft_delete.service import (
    list_trash_items,
    permanent_delete_trash_item,
    restore_trash_item,
)


class TrashSelectionSerializer(serializers.Serializer):
    model = serializers.ChoiceField(choices=list(TRASH_REGISTRY))
    id = serializers.IntegerField(min_value=1)


class TrashBatchSerializer(serializers.Serializer):
    items = TrashSelectionSerializer(many=True, allow_empty=False, max_length=100)

    def validate_items(self, items):
        keys = [(item['model'], item['id']) for item in items]
        if len(keys) != len(set(keys)):
            raise serializers.ValidationError('Select each record only once.')
        return items


def run_batch_action(request, action):
    serializer = TrashBatchSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    results, errors = [], []
    for item in serializer.validated_data['items']:
        try:
            # Preserve each model's inventory/accounting cleanup and roll back
            # only the blocked item, reporting successful items explicitly.
            with transaction.atomic():
                results.append(action(item['model'], item['id'], request.user,
                                      query_params=request.query_params))
        except (ProtectedError, RestrictedError):
            errors.append({**item, 'detail': 'This record is still referenced by other records.'})
        except IntegrityError:
            errors.append({**item, 'detail': 'Database constraints prevent processing this record.'})
        except DjangoValidationError as exc:
            errors.append({**item, 'detail': '; '.join(exc.messages)})
        except APIException as exc:
            errors.append({**item, 'detail': str(exc.detail)})
    return Response({'results': results, 'errors': errors,
                     'succeeded': len(results), 'failed': len(errors)})


class TrashListView(APIView):
    permission_classes = [IsAuthenticated, HasModulePermission]
    permission_module = 'settings'
    permission_codenames = ['view_settings', 'view_backups']

    def get(self, request):
        model_key = request.query_params.get('model') or None
        search = (request.query_params.get('search') or '').strip()
        rows = list_trash_items(
            request.user,
            query_params=request.query_params,
            model_key=model_key,
            search=search,
        )
        return Response({
            'retention_days': TRASH_RETENTION_DAYS,
            'count': len(rows),
            'results': rows,
        })


class TrashRestoreView(APIView):
    permission_classes = [IsAuthenticated, HasModulePermission]
    permission_module = 'settings'
    permission_codenames = ['view_settings', 'view_backups']

    def post(self, request):
        if 'items' in request.data:
            return run_batch_action(request, restore_trash_item)
        model_key = request.data.get('model')
        obj_id = request.data.get('id')
        if not model_key or not obj_id:
            return Response(
                {'detail': 'model and id are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        result = restore_trash_item(
            model_key,
            obj_id,
            request.user,
            query_params=request.query_params,
        )
        return Response(result)


class TrashPermanentDeleteView(APIView):
    permission_classes = [IsAuthenticated, HasModulePermission]
    permission_module = 'settings'
    permission_codenames = ['view_settings', 'view_backups']

    def post(self, request):
        if 'items' in request.data:
            return run_batch_action(request, permanent_delete_trash_item)
        model_key = request.data.get('model')
        obj_id = request.data.get('id')
        if not model_key or not obj_id:
            return Response(
                {'detail': 'model and id are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        result = permanent_delete_trash_item(
            model_key,
            obj_id,
            request.user,
            query_params=request.query_params,
        )
        return Response(result)
