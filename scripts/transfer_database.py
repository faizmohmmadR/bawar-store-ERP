#!/usr/bin/env python3
"""Export ERP data or import it into a migrated, dedicated target database.

Set DB_ENGINE=sqlite for export and DB_ENGINE=mysql for import. Import replaces
application data, so use a new, dedicated MySQL database and acknowledge this
with --replace-data. Migration history and generated permission metadata remain.
"""
import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


@contextmanager
def mute_fixture_signals():
    # This is an offline command, never an HTTP request. Some ERP accounting
    # receivers do not honour raw=True; importing must preserve saved journals.
    from django.db.models import signals
    muted = [signals.pre_save, signals.post_save, signals.pre_delete,
             signals.post_delete, signals.m2m_changed]
    originals = [(signal, signal.receivers) for signal in muted]
    try:
        for signal, _ in originals:
            signal.receivers = []
            signal.sender_receivers_cache.clear()
        yield
    finally:
        for signal, receivers in originals:
            signal.receivers = receivers
            signal.sender_receivers_cache.clear()


def import_fixture(path, connection):
    from django.apps import apps
    from django.core.management import call_command
    from django.db import transaction
    records = json.loads(path.read_text())
    if not isinstance(records, list) or not records:
        raise ValueError('Expected a non-empty Django JSON fixture.')
    expected = {}
    for record in records:
        model = apps.get_model(record['model'])
        if model._meta.label_lower in {'contenttypes.contenttype', 'auth.permission'}:
            raise ValueError('Use a fixture exported by this script (without generated metadata).')
        expected[model._meta.label_lower] = expected.get(model._meta.label_lower, 0) + 1
    preserved = {'django_content_type', 'auth_permission', 'django_migrations'}
    existing = set(connection.introspection.table_names())
    tables = sorted({model._meta.db_table for model in apps.get_models(include_auto_created=True)} & existing - preserved)
    # Disable FK enforcement outside the transaction (required by SQLite), then
    # verify all relationships before committing. DELETE is transactional; no TRUNCATE.
    with mute_fixture_signals(), connection.constraint_checks_disabled():
        with transaction.atomic():
            with connection.cursor() as cursor:
                for table in tables:
                    cursor.execute(f'DELETE FROM {connection.ops.quote_name(table)}')
            call_command('loaddata', str(path), verbosity=0)
            for label, count in expected.items():
                actual = apps.get_model(label)._base_manager.count()
                if actual != count:
                    raise ValueError(f'Row count mismatch for {label}: expected {count}, got {actual}.')
            connection.check_constraints(table_names=tables)
    return sum(expected.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest='action', required=True)
    export = subparsers.add_parser('export')
    export.add_argument('--output', type=Path, required=True)
    restore = subparsers.add_parser('import')
    restore.add_argument('--input', type=Path, required=True)
    restore.add_argument('--replace-data', action='store_true')
    args = parser.parse_args()
    sys.path.insert(0, str(ROOT))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    import django
    django.setup()
    from django.core.management import call_command
    from django.db import connection
    if args.action == 'export':
        output = args.output.resolve()
        if output.exists():
            parser.error('Output exists; use a new filename to preserve the existing export.')
        output.parent.mkdir(parents=True, exist_ok=True)
        # Export may contain password hashes, auth tokens and personal information.
        descriptor = os.open(output, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.close(descriptor)
        try:
            call_command('dumpdata', use_base_manager=True, use_natural_foreign_keys=True,
                         exclude=['contenttypes', 'auth.permission'], output=str(output), verbosity=0)
        except BaseException:
            output.unlink(missing_ok=True)
            raise
        print(f'Exported data to {output}. Media files must be copied separately.')
    else:
        if connection.vendor != 'mysql':
            parser.error('Import requires DB_ENGINE=mysql. The active SQLite database will not be replaced.')
        if not args.replace_data:
            parser.error('Use a new dedicated MySQL database and pass --replace-data to acknowledge replacing its application data.')
        if not args.input.is_file():
            parser.error('Input fixture does not exist.')
        from django.db.migrations.executor import MigrationExecutor
        executor = MigrationExecutor(connection)
        if executor.migration_plan(executor.loader.graph.leaf_nodes()):
            parser.error('Run manage.py migrate against the target MySQL database before importing.')
        rows = import_fixture(args.input.resolve(), connection)
        print(f'Imported and verified {rows} records. Existing migration history and generated permissions were preserved.')


if __name__ == '__main__':
    main()
