"""Stage legacy SQLite backups through their migrations before a merge restore."""
from contextlib import contextmanager
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile

from django.conf import settings


@contextmanager
def compatible_backup(backup):
    backup = Path(backup).resolve()
    with sqlite3.connect(f'{backup.as_uri()}?mode=ro', uri=True) as connection:
        if connection.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
            raise ValueError('The backup failed its SQLite integrity check.')
        history = connection.execute("SELECT app, name FROM django_migrations WHERE app IN ('api', 'account')").fetchall()
    current_migrations = {
        (app, path.stem)
        for app in ('api', 'account')
        for path in Path(settings.BASE_DIR, app, 'migrations').glob('[0-9]*.py')
    }
    legacy = any((app, name) not in current_migrations for app, name in history)
    with tempfile.TemporaryDirectory(prefix='erp-compatible-backup-') as temporary:
        output = Path(temporary, 'compatible.sqlite3')
        command = [sys.executable, str(Path(settings.BASE_DIR, 'scripts/rebuild_sqlite_backup.py')),
                   '--backup', str(backup), '--output', str(output)]
        if legacy:
            archive = Path(settings.BASE_DIR, 'backups/migration-reset-20261018/legacy-migrations.zip')
            if not archive.is_file():
                raise ValueError('This older backup requires the legacy-migrations.zip archive saved during the migration reset.')
            command.extend(['--legacy-archive', str(archive)])
        import os
        result = subprocess.run(command, cwd=settings.BASE_DIR, capture_output=True, text=True,
                                env={**os.environ, 'DEBUG': 'False', 'DB_ENGINE': 'sqlite'})
        if result.returncode:
            # Do not return database row contents or subprocess diagnostics over the API.
            raise ValueError('The backup could not be upgraded to the current schema. The active database was not changed.')
        yield output


def merge_backup(source, destination, known_tables):
    """Insert missing primary keys atomically, keeping the current schema and history."""
    restored = 0
    with sqlite3.connect(destination) as target, sqlite3.connect(source) as backup:
        target.execute('PRAGMA foreign_keys=OFF')
        target.execute('BEGIN IMMEDIATE')
        tables = {row[0] for row in backup.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        for table in sorted(tables & set(known_tables)):
            quoted = '"' + table.replace('"', '""') + '"'
            info = backup.execute(f'PRAGMA table_info({quoted})').fetchall()
            primary = [column[1] for column in info if column[5]]
            if len(primary) != 1:
                raise ValueError(f'Unsupported primary key in {table}.')
            columns = [column[1] for column in info]
            current_columns = {column[1] for column in target.execute(f'PRAGMA table_info({quoted})')}
            if set(columns) != current_columns:
                raise ValueError(f'Schema mismatch in {table}; no records were restored.')
            primary_index = columns.index(primary[0])
            names = ','.join('"' + column.replace('"', '""') + '"' for column in columns)
            placeholders = ','.join('?' for _ in columns)
            for row in backup.execute(f'SELECT * FROM {quoted}'):
                exists = target.execute(f'SELECT 1 FROM {quoted} WHERE "{primary[0]}"=?', (row[primary_index],)).fetchone()
                if not exists:
                    target.execute(f'INSERT INTO {quoted} ({names}) VALUES ({placeholders})', row)
                    restored += 1
        if target.execute('PRAGMA foreign_key_check').fetchone():
            raise ValueError('Restore would create broken relationships; no records were restored.')
    return restored
