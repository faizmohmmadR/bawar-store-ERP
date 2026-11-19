# Migration reset and backup restore — 2026-10-18

The active SQLite database was rebuilt from `backups/backup_2026-10-18_05-35-28.db`. That backup ended at API migration 0015; it was upgraded in isolation through 0025 before its data was copied into a clean current schema. The supplied backup file was not overwritten.

## Migration layout

- `account/migrations/0001_initial.py` contains the current user schema.
- `api/migrations/0001_initial.py` contains the current ERP schema, constraints, indexes, and A–G category seeds.
- Other project migration files were removed. Django and third-party package migrations are unchanged. Django tracks migrations per app, so the two project apps each need their own initial migration.

This resets migration history. Other installations with the former history must also be staged and rebuilt; do not run the new initial migrations against their old database and assume that updates have been applied.

## Restore and recovery

Local recovery files are in `backups/migration-reset-20261018/` (excluded from version control because they contain private data):

- `before-reset.sqlite3` and `immediately-before-replacement.sqlite3`: recovery copies of the previous active database.
- `legacy-migrations.zip`: the historical migration code required to upgrade the supplied older backup.
- `upgraded-backup.sqlite3`: the backup after historical migrations.
- `restored-current-schema.sqlite3`: the validated database used for replacement.
- JSON reports record restored table counts and API checks.

The final active database contains 1,599 rows across 63 data tables, excluding migration history. Rows and all column values were compared in both directions with the upgraded backup before replacement. Foreign keys and SQLite integrity checks passed. The upgrade added the new schema's seed/default records; previous active data newer than the supplied backup remains only in the recovery copies.

To stage another restore without changing the active database:

```bash
DEBUG=False DB_ENGINE=sqlite venv/bin/python scripts/rebuild_sqlite_backup.py \
  --backup backups/backup_2026-10-18_05-35-28.db \
  --legacy-archive backups/migration-reset-20261018/legacy-migrations.zip \
  --output /tmp/erp-restored-review.sqlite3
```

Choose an unused output path. For backups made after this reset, omit `--legacy-archive`. The script keeps current migration history, verifies matching tables and columns, copies all data including relationship tables and authentication records, preserves ID sequence high-water marks, and refuses invalid relationships. It does not copy media files; attachment files remain in `media/`.

The backup screen continues to merge only missing records. SQLite backups now use the online backup API, and SQLite restores stage schema upgrades before merging within a transaction. The old archive must remain available at the recovery path for the backup screen to upgrade older backups. Existing rows are preserved by merge restores; they are not overwritten. The full replacement performed for this task used the separately validated staging database instead.

## Validation

- Backend suite: 180 tests, 179 passed and one existing skip.
- Six new restore tests cover snapshots, exact copying, ID sequences, migration history, incompatible schemas, merge preservation, and transaction rollback.
- List endpoints across 49 sections passed against restored data; available detail records also passed.
- Django checks, pending-migration check, and migration drift check passed.
- Frontend production build passed with the existing bundle-size warning.
- No browser walkthrough was performed.
