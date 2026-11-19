#!/usr/bin/env python3
"""Build a current-schema SQLite database from a backup without touching the live DB.

Older backups require the historical migration archive saved before the migration reset.
Run using the project's virtualenv Python. Output must be a new, unused path.
"""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def snapshot(source, destination):
    with sqlite3.connect(f'{source.as_uri()}?mode=ro', uri=True) as src:
        if src.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
            raise RuntimeError('Backup failed SQLite integrity check.')
        with sqlite3.connect(destination) as dst:
            src.backup(dst)


def migrate(database, archive=None):
    """Use a separate process so Django never caches the other migration graph."""
    args = [sys.executable, str(Path(__file__).resolve()), '--migrate-stage', str(database)]
    if archive:
        args.extend(['--legacy-archive', str(archive)])
    subprocess.run(args, cwd=ROOT, check=True, env={**os.environ, 'DEBUG': 'False', 'DB_ENGINE': 'sqlite'})


def migrate_stage(database, archive):
    sys.path.insert(0, str(ROOT))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    from django.conf import settings
    settings.DATABASES['default']['NAME'] = str(database)
    with tempfile.TemporaryDirectory(prefix='erp-migration-modules-') as temporary:
        if archive:
            modules = {}
            with zipfile.ZipFile(archive) as legacy:
                for app in ('account', 'api'):
                    package = Path(temporary, f'legacy_{app}')
                    package.mkdir()
                    for name in legacy.namelist():
                        path = Path(name)
                        if path.parent == Path(app, 'migrations') and path.suffix == '.py':
                            (package / path.name).write_bytes(legacy.read(name))
                    if not (package / '__init__.py').exists():
                        raise RuntimeError(f'Missing {app} migration module in archive.')
                    modules[app] = f'legacy_{app}'
            sys.path.insert(0, temporary)
            settings.MIGRATION_MODULES = modules
        import django
        django.setup()
        from django.core.management import call_command
        call_command('migrate', interactive=False, verbosity=1)
        if archive:
            # Legacy migrations predate nullable barcode uniqueness. Normalize
            # raw fixture blanks before copying into the current unique schema.
            from api.models.data.products import Product
            Product.all_objects.filter(barcode='').update(barcode=None)


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def tables(connection, schema='main'):
    return {row[0] for row in connection.execute(
        f"SELECT name FROM {schema}.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'django_migrations'"
    )}


def copy_current_data(source, target):
    report = {}
    with sqlite3.connect(target) as connection:
        connection.execute('PRAGMA foreign_keys=OFF')
        connection.execute('ATTACH DATABASE ? AS restored', (str(source),))
        source_tables = tables(connection, 'restored')
        target_tables = tables(connection)
        if source_tables != target_tables:
            raise RuntimeError(f'Schema tables differ: {sorted(source_tables ^ target_tables)}')
        for table in sorted(target_tables):
            source_columns = [row[1] for row in connection.execute(f'PRAGMA restored.table_info({quote(table)})')]
            target_columns = [row[1] for row in connection.execute(f'PRAGMA main.table_info({quote(table)})')]
            if set(source_columns) != set(target_columns):
                raise RuntimeError(f'Column mismatch for {table}; upgrade this backup before copying.')
            columns = ', '.join(quote(column) for column in target_columns)
            connection.execute(f'DELETE FROM main.{quote(table)}')
            connection.execute(f'INSERT INTO main.{quote(table)} ({columns}) SELECT {columns} FROM restored.{quote(table)}')
            count = connection.execute(f'SELECT COUNT(*) FROM main.{quote(table)}').fetchone()[0]
            original_count = connection.execute(f'SELECT COUNT(*) FROM restored.{quote(table)}').fetchone()[0]
            if count != original_count:
                raise RuntimeError(f'Row count mismatch in {table}')
            for first, second in [('main', 'restored'), ('restored', 'main')]:
                if connection.execute(f'SELECT {columns} FROM {first}.{quote(table)} EXCEPT SELECT {columns} FROM {second}.{quote(table)} LIMIT 1').fetchone():
                    raise RuntimeError(f'Data mismatch in {table}')
            report[table] = count
        # Preserve deleted-row high-water marks so new records cannot reuse old IDs.
        connection.execute('DELETE FROM main.sqlite_sequence WHERE name != ?', ('django_migrations',))
        connection.execute("INSERT INTO main.sqlite_sequence(name, seq) SELECT name, seq FROM restored.sqlite_sequence WHERE name != 'django_migrations'")
        violations = connection.execute('PRAGMA main.foreign_key_check').fetchall()
        if violations:
            raise RuntimeError(f'Restored database has foreign key violations: {violations[:10]}')
        if connection.execute('PRAGMA main.integrity_check').fetchall() != [('ok',)]:
            raise RuntimeError('Restored database failed integrity check.')
        connection.commit()
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--legacy-archive', type=Path)
    parser.add_argument('--migrate-stage', type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.migrate_stage:
        migrate_stage(args.migrate_stage.resolve(), args.legacy_archive)
        return
    if not args.backup or not args.output:
        parser.error('--backup and --output are required')
    source, output = args.backup.resolve(), args.output.resolve()
    if output.exists():
        parser.error('Output already exists; choose a new staging file.')
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        with tempfile.TemporaryDirectory(prefix='erp-restore-') as temporary:
            upgraded = Path(temporary, 'upgraded.sqlite3')
            snapshot(source, upgraded)
            migrate(upgraded, args.legacy_archive.resolve() if args.legacy_archive else None)
            if args.legacy_archive:
                # Archived migrations bring the schema to the consolidated
                # initial state. Rebase only this temporary copy, then apply
                # newer incremental migrations (constraints, counters, etc.).
                with sqlite3.connect(upgraded) as history:
                    history.execute("DELETE FROM django_migrations WHERE app IN ('api', 'account')")
                    for app in ('account', 'api'):
                        history.execute(
                            "INSERT INTO django_migrations(app,name,applied) VALUES (?, '0001_initial', CURRENT_TIMESTAMP)",
                            (app,),
                        )
                migrate(upgraded)
            migrate(output)
            report = copy_current_data(upgraded, output)
            output.with_suffix('.report.json').write_text(json.dumps({
                'backup': str(source), 'output': str(output),
                'tables': report, 'row_count': sum(report.values()),
                'integrity': 'ok', 'foreign_keys': 'ok', 'data_comparison': 'identical to upgraded backup',
            }, indent=2) + '\n')
            print(f'Validated {len(report)} tables and {sum(report.values())} rows. Staged database: {output}')
    except BaseException:
        output.unlink(missing_ok=True)
        raise


if __name__ == '__main__':
    main()
