# Automatic document numbers

The former generator scanned only active documents and did not reserve its result. Soft-deleted invoices still occupied their database unique keys, so the generator could suggest an already-used number (for example `R26-0001`). Concurrent requests could also receive the same suggestion.

The replacement uses `DocumentNumberSequence` and a transaction with `select_for_update()` to reserve each number. MySQL/MariaDB row locks serialize reservations for the same document type and year. Existing and soft-deleted documents are included when reconciling the counter, so imported data or manually assigned higher numbers advance it automatically. The allocator also recognises old purchase prefixes and case/padding differences that can compare equal under MySQL collations. Counters prevent reuse after a document is permanently deleted, provided the counter data is retained. Failed operations can leave gaps; numbers are not promised to be gapless.

Coverage: sale invoices, raw material purchase invoices, production numbers, equipment serials, stock transfers, inventory batches, returns and packing runs. Existing document numbers remain unchanged. New return and packing numbers also use the shared sequence (`RET26-0001`, `PK26-0001`). Return and packing numbers are read-only in their API serializers. The return dialog no longer generates a timestamp number in the browser.

Legacy SQLite backup staging now applies incremental migrations after the archived schema upgrade, so restored databases include the counter table. Counters are also included in normal database exports. Older imports without counters bootstrap from the document history on first use.

## Deploy

Upload the updated backend `api/` directory, including `models/__init__.py`, `models/data/document_number_sequence.py`, `services/document_numbers.py`, the changed return/packing models and serializers, and `migrations/0003_document_number_sequences.py`. Include preceding migrations, particularly `0002_mysql_product_barcode_uniqueness.py`, if not yet deployed. Also upload the updated `scripts/rebuild_sqlite_backup.py`.

The Decimal warning fix is in `api/serializers/data/packing.py` (all Decimal minimum values use `Decimal('0.0001')`). Upload that file and restart the backend to replace any older cached code.

From the server application directory, with its virtual environment active:

```bash
DEBUG=False DB_ENGINE=mysql python manage.py migrate
DEBUG=False DB_ENGINE=mysql python -W error::UserWarning manage.py check --database default --fail-level WARNING
DEBUG=False DB_ENGINE=mysql python manage.py migrate --check
```

Restart the Python application in cPanel after successful migration/checks. No data reset or reimport is required. Deploy the freshly built contents of `frontend/dist/` for the return-dialog change.

## Validation

Regression checks cover soft-deleted purchase invoices, independently reserved numbers, hard deletion, imported higher numbers, legacy prefixes/casing, separate years/types, rollback and every allocator. A live MySQL/MariaDB concurrent-reservation test is included and skipped when running on SQLite. Offline MySQL/MariaDB model checks, strict local Django checks, migration drift checks and the frontend production build also pass. Actual concurrent requests on the hosting server were not tested here.
