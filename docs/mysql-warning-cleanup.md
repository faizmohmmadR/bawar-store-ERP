# MySQL/MariaDB warning cleanup

Product barcodes now use an unconditional unique constraint supported by both database families. Missing barcodes are stored as NULL so multiple unbarcoded products remain valid. The API rejects duplicates, including barcodes on soft-deleted products; the database enforces uniqueness too.

`api/migrations/0002_mysql_product_barcode_uniqueness.py` checks existing non-empty barcodes using the target database's collation, converts empty strings to NULL, removes the former conditional constraint and adds the supported unique constraint. If duplicate barcodes already exist on MariaDB (which skipped the former constraint), migration stops with a descriptive error; it never renames or deletes products. Resolve the duplicate assignments before retrying.

A new incremental migration is necessary because the consolidated initial migration has already been applied on the server. Do not delete, fake, or reset the server database for this change.

The packing serializer's Decimal minimum now uses Decimal instead of float. Permission list queries also have deterministic ordering, avoiding unordered-pagination warnings. Backup compatibility detection recognises migrations added after consolidation, and legacy staging normalises empty barcodes before copying into the new schema.

## Server deployment

Upload the updated backend files, including:

- `api/models/data/products.py`
- `api/serializers/data/products.py`
- `api/serializers/data/packing.py`
- `api/views/data/permissions.py`
- `api/migrations/0002_mysql_product_barcode_uniqueness.py`
- `account/sqlite_restore.py`
- `scripts/rebuild_sqlite_backup.py`

From the application directory with the cPanel virtual environment active:

```bash
DEBUG=False DB_ENGINE=mysql python manage.py migrate
DEBUG=False DB_ENGINE=mysql python -W error::UserWarning manage.py check --database default --fail-level WARNING
DEBUG=False DB_ENGINE=mysql python manage.py migrate --check
```

Stop if a command fails; restart the Python application in cPanel after successful checks. No data reimport is needed.

## Validation

All model checks passed with offline MySQL 8.0 and MariaDB 10.11 capability profiles. These are simulated backend feature checks, not live-server execution. Local SQLite migration, strict Django checks and migration drift checks passed. The backend suite runs with UserWarning treated as an error. The server commands above are still required to verify the actual MariaDB installation.
