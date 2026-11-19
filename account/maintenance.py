"""
Nightly maintenance helpers for Hostinger / cheap hosting.

Designed to run via:
  - one shell cron: scripts/hostinger_cron.sh
  - or one HTTP cron: POST /api/maintenance/run/ with Bearer secret
"""

from __future__ import annotations

import logging
import os
import sqlite3
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

_SAFE_FILENAME_PREFIXES = ('backup_', 'auto_backup_')
_SAFE_EXTENSIONS = ('.db', '.sql')


def get_backup_dir() -> Path:
    configured = (getattr(settings, 'BACKUP_DIR', None) or '').strip()
    path = Path(configured) if configured else (Path(settings.BASE_DIR) / 'backups')
    path.mkdir(parents=True, exist_ok=True)
    return path


def backup_extension() -> str:
    engine = settings.DATABASES['default']['ENGINE']
    return '.db' if 'sqlite' in engine else '.sql'


def _mysql_env(password: str) -> dict:
    env = os.environ.copy()
    env['MYSQL_PWD'] = password
    return env


def safe_backup_path(backup_dir: Path | str, filename: str) -> Path:
    """Validate filename and resolve path inside backup_dir. Raises ValueError."""
    if not filename or '/' in filename or '\\' in filename:
        raise ValueError('Invalid filename.')
    if not any(filename.startswith(p) for p in _SAFE_FILENAME_PREFIXES):
        raise ValueError('Invalid filename prefix.')
    if not any(filename.endswith(ext) for ext in _SAFE_EXTENSIONS):
        raise ValueError('Invalid file extension.')

    resolved = Path(os.path.realpath(os.path.join(str(backup_dir), filename)))
    safe_dir = Path(os.path.realpath(str(backup_dir)))
    if resolved != safe_dir and not str(resolved).startswith(str(safe_dir) + os.sep):
        raise ValueError('Path traversal detected.')
    return resolved


def create_database_backup(*, prefix: str = 'backup') -> dict:
    """
    Create a DB dump under backups/.
    prefix: 'backup' (manual) or 'auto_backup' (scheduled).
    """
    if prefix not in ('backup', 'auto_backup'):
        raise ValueError('Invalid backup prefix.')

    backup_dir = get_backup_dir()
    timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    engine = settings.DATABASES['default']['ENGINE']
    ext = backup_extension()
    backup_file = backup_dir / f'{prefix}_{timestamp}{ext}'

    if 'sqlite' in engine:
        db_path = settings.DATABASES['default']['NAME']
        with sqlite3.connect(db_path) as source, sqlite3.connect(str(backup_file)) as destination:
            source.backup(destination)
    else:
        db = settings.DATABASES['default']
        dump_command = [
            'mysqldump',
            '-u', db['USER'],
            '-h', db['HOST'],
            '--port', str(db['PORT']),
            '--single-transaction',
            '--routines',
            '--triggers',
            db['NAME'],
        ]
        with open(backup_file, 'w', encoding='utf-8') as f:
            subprocess.run(
                dump_command,
                stdout=f,
                stderr=subprocess.PIPE,
                check=True,
                env=_mysql_env(db['PASSWORD']),
            )

    return {
        'filename': backup_file.name,
        'path': str(backup_file),
        'size': backup_file.stat().st_size,
        'created_at': timestamp,
        'kind': 'auto' if prefix == 'auto_backup' else 'manual',
    }


def prune_auto_backups(*, retention_days: int | None = None) -> dict:
    """Delete auto_backup_* files older than retention_days. Manual backups are never pruned."""
    days = retention_days if retention_days is not None else int(
        getattr(settings, 'BACKUP_RETENTION_DAYS', 30)
    )
    if days < 1:
        return {'deleted': 0, 'kept': 0, 'retention_days': days}

    backup_dir = get_backup_dir()
    ext = backup_extension()
    cutoff = datetime.now() - timedelta(days=days)
    deleted = 0
    kept = 0

    for path in backup_dir.iterdir():
        if not path.is_file():
            continue
        if not path.name.startswith('auto_backup_') or not path.name.endswith(ext):
            continue
        mtime = datetime.fromtimestamp(path.stat().st_mtime)
        if mtime < cutoff:
            try:
                path.unlink()
                deleted += 1
            except OSError as exc:
                logger.warning('Failed to delete old backup %s: %s', path.name, exc)
        else:
            kept += 1

    return {'deleted': deleted, 'kept': kept, 'retention_days': days}


def purge_old_activity_logs(*, retention_days: int | None = None, dry_run: bool = False) -> dict:
    """Hard-delete activity logs older than retention_days."""
    from api.models.data.activity_log import ActivityLog

    days = retention_days if retention_days is not None else int(
        getattr(settings, 'ACTIVITY_LOG_RETENTION_DAYS', 365)
    )
    if days < 1:
        return {'deleted': 0, 'retention_days': days, 'dry_run': dry_run}

    cutoff = timezone.now() - timedelta(days=days)
    qs = ActivityLog.all_objects.filter(created_at__lt=cutoff)
    count = qs.count()
    if not dry_run and count:
        qs.delete()
    return {'deleted': count, 'retention_days': days, 'dry_run': dry_run, 'cutoff': cutoff.isoformat()}


def run_nightly_maintenance(*, dry_run: bool = False) -> dict:
    """
    One job for Hostinger cron:
      1) create auto backup
      2) prune old auto backups
      3) purge old activity logs
      4) purge expired trash
    """
    result: dict = {
        'ok': True,
        'dry_run': dry_run,
        'backup': None,
        'backup_prune': None,
        'activity_logs': None,
        'trash': None,
        'errors': [],
    }

    if not dry_run:
        try:
            result['backup'] = create_database_backup(prefix='auto_backup')
        except Exception as exc:
            result['ok'] = False
            result['errors'].append(f'backup: {exc}')
            logger.exception('Auto backup failed')
    else:
        result['backup'] = {'skipped': True, 'reason': 'dry_run'}

    try:
        if dry_run:
            # Count only — do not delete
            days = int(getattr(settings, 'BACKUP_RETENTION_DAYS', 30))
            backup_dir = get_backup_dir()
            ext = backup_extension()
            cutoff = datetime.now() - timedelta(days=days)
            would_delete = 0
            for path in backup_dir.iterdir():
                if (
                    path.is_file()
                    and path.name.startswith('auto_backup_')
                    and path.name.endswith(ext)
                    and datetime.fromtimestamp(path.stat().st_mtime) < cutoff
                ):
                    would_delete += 1
            result['backup_prune'] = {
                'deleted': would_delete,
                'retention_days': days,
                'dry_run': True,
            }
        else:
            result['backup_prune'] = prune_auto_backups()
    except Exception as exc:
        result['ok'] = False
        result['errors'].append(f'backup_prune: {exc}')
        logger.exception('Backup prune failed')

    try:
        result['activity_logs'] = purge_old_activity_logs(dry_run=dry_run)
    except Exception as exc:
        result['ok'] = False
        result['errors'].append(f'activity_logs: {exc}')
        logger.exception('Activity log purge failed')

    try:
        from api.services.soft_delete.service import purge_expired_trash

        purged = purge_expired_trash(dry_run=dry_run)
        result['trash'] = {'purged': len(purged), 'dry_run': dry_run}
    except Exception as exc:
        result['ok'] = False
        result['errors'].append(f'trash: {exc}')
        logger.exception('Trash purge failed')

    return result
