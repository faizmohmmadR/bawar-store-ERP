import os
import subprocess
from datetime import datetime

from django.conf import settings
from django.http import FileResponse, JsonResponse
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny

from account.maintenance import (
    create_database_backup,
    get_backup_dir,
    run_nightly_maintenance,
    safe_backup_path,
)
from account.permissions import IsSuperUser


def _mysql_env(password: str) -> dict:
    env = os.environ.copy()
    env['MYSQL_PWD'] = password
    return env


@api_view(['POST'])
@permission_classes([IsSuperUser])
def backup_database(request):
    try:
        info = create_database_backup(prefix='backup')
        return JsonResponse({
            'message': 'Database backup successful!',
            'filename': info['filename'],
            'size': info['size'],
            'created_at': info['created_at'],
            'kind': info['kind'],
        })
    except subprocess.CalledProcessError:
        return JsonResponse({'error': 'Backup command failed.'}, status=500)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@api_view(['POST'])
@permission_classes([IsSuperUser])
def restore_database(request):
    if not getattr(settings, 'BACKUP_RESTORE_ENABLED', False):
        return JsonResponse(
            {
                'error': (
                    'Backup restore is disabled. Set BACKUP_RESTORE_ENABLED=True '
                    'only when you intentionally need restore, then restart the app.'
                ),
            },
            status=403,
        )

    filename = request.data.get('filename')
    if not filename:
        return JsonResponse({'error': 'No backup file provided.'}, status=400)

    backup_dir = get_backup_dir()

    try:
        backup_file_path = safe_backup_path(backup_dir, filename)
    except ValueError as e:
        return JsonResponse({'error': str(e)}, status=400)

    if not backup_file_path.exists():
        return JsonResponse({'error': 'Backup file does not exist.'}, status=400)

    db_engine = settings.DATABASES['default']['ENGINE']

    from django.apps import apps as django_apps
    known_tables = frozenset(
        model._meta.db_table for model in django_apps.get_models(include_auto_created=True)
    )

    try:
        if 'sqlite' in db_engine:
            from account.sqlite_restore import compatible_backup, merge_backup
            db_path = settings.DATABASES['default']['NAME']
            with compatible_backup(str(backup_file_path)) as upgraded:
                restored_count = merge_backup(upgraded, db_path, known_tables)
            return JsonResponse({'message': f'Merged {restored_count} new records successfully!'})

        db_name = settings.DATABASES['default']['NAME']
        db_user = settings.DATABASES['default']['USER']
        db_password = settings.DATABASES['default']['PASSWORD']
        db_host = settings.DATABASES['default']['HOST']
        db_port = str(settings.DATABASES['default']['PORT'])

        restore_command = [
            'mysql',
            '-u', db_user,
            '-h', db_host,
            '--port', db_port,
            db_name,
        ]
        with open(backup_file_path, 'rb') as f:
            subprocess.run(
                restore_command,
                stdin=f,
                stderr=subprocess.PIPE,
                check=True,
                env=_mysql_env(db_password),
            )
        return JsonResponse({'message': 'Database restored successfully!'})

    except subprocess.CalledProcessError:
        return JsonResponse({'error': 'Restore command failed.'}, status=500)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


def _backup_list_settings() -> dict:
    return {
        'activity_log_retention_days': int(getattr(settings, 'ACTIVITY_LOG_RETENTION_DAYS', 365)),
        'backup_retention_days': int(getattr(settings, 'BACKUP_RETENTION_DAYS', 30)),
        'restore_enabled': bool(getattr(settings, 'BACKUP_RESTORE_ENABLED', False)),
    }


@api_view(['GET'])
@permission_classes([IsSuperUser])
def list_backups(request):
    backup_dir = get_backup_dir()
    settings_payload = _backup_list_settings()

    if not backup_dir.exists():
        return JsonResponse({'backups': [], 'settings': settings_payload})

    db_engine = settings.DATABASES['default']['ENGINE']
    extension = '.db' if 'sqlite' in db_engine else '.sql'

    backups = []
    for fname in os.listdir(backup_dir):
        if not fname.endswith(extension):
            continue
        if fname.startswith('auto_backup_'):
            kind = 'auto'
        elif fname.startswith('backup_'):
            kind = 'manual'
        else:
            continue

        file_path = backup_dir / fname
        if not file_path.is_file():
            continue
        stat = file_path.stat()
        backups.append({
            'filename': fname,
            'size': stat.st_size,
            'created_at': datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S'),
            'kind': kind,
        })

    backups.sort(key=lambda x: x['created_at'], reverse=True)
    return JsonResponse({
        'backups': backups,
        'settings': settings_payload,
    })


@api_view(['DELETE'])
@permission_classes([IsSuperUser])
def delete_backup(request):
    filename = request.data.get('filename')
    if not filename:
        return JsonResponse({'error': 'No backup file provided.'}, status=400)

    backup_dir = get_backup_dir()

    try:
        backup_file_path = safe_backup_path(backup_dir, filename)
    except ValueError as e:
        return JsonResponse({'error': str(e)}, status=400)

    if not backup_file_path.exists():
        return JsonResponse({'error': 'Backup file does not exist.'}, status=400)

    try:
        os.remove(backup_file_path)
        return JsonResponse({'message': 'Backup file deleted successfully!'})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@api_view(['POST'])
@permission_classes([IsSuperUser])
def download_backup(request):
    filename = request.data.get('filename')
    if not filename:
        return JsonResponse({'error': 'No backup file provided.'}, status=400)

    backup_dir = get_backup_dir()

    try:
        backup_file_path = safe_backup_path(backup_dir, filename)
    except ValueError as e:
        return JsonResponse({'error': str(e)}, status=400)

    if not backup_file_path.exists():
        return JsonResponse({'error': 'Backup file does not exist.'}, status=404)

    safe_name = backup_file_path.name
    response = FileResponse(open(backup_file_path, 'rb'), as_attachment=True, filename=safe_name)
    response['Content-Disposition'] = f'attachment; filename="{safe_name}"'
    return response


def _extract_maintenance_token(request) -> str:
    auth = request.headers.get('Authorization') or request.META.get('HTTP_AUTHORIZATION') or ''
    if auth.lower().startswith('bearer '):
        return auth[7:].strip()
    return (
        request.GET.get('token')
        or (getattr(request, 'data', {}) or {}).get('token')
        or ''
    )


@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def run_maintenance_endpoint(request):
    """
    Hostinger-friendly HTTP cron endpoint.
    Enable by setting MAINTENANCE_CRON_SECRET in .env, then call nightly:
      curl -fsS -X POST "https://YOUR-API/api/maintenance/run/" \\
        -H "Authorization: Bearer YOUR_SECRET"
    """
    import secrets as pysecrets

    expected = (getattr(settings, 'MAINTENANCE_CRON_SECRET', '') or '').strip()
    if not expected:
        return JsonResponse(
            {'error': 'Maintenance HTTP cron is disabled. Set MAINTENANCE_CRON_SECRET.'},
            status=503,
        )

    provided = _extract_maintenance_token(request)
    if not provided or not pysecrets.compare_digest(provided, expected):
        return JsonResponse({'error': 'Unauthorized.'}, status=401)

    dry_run = str(request.GET.get('dry_run') or '').lower() in ('1', 'true', 'yes')
    result = run_nightly_maintenance(dry_run=dry_run)
    status = 200 if result.get('ok') else 500
    return JsonResponse(result, status=status)
