# Trash bulk actions

Select records using the row checkboxes or the table's select-all checkbox. Choose Restore selected or Delete selected permanently. The confirmation dialog shows the selected count and record names. Each action accepts up to 100 records, including mixed types; selections clear when records leave the current search/filter results.

The existing restore and permanent-delete endpoints accept either the original `{model, id}` payload or an `{items: [{model, id}, ...]}` batch. The backend validates every selection before starting and applies the existing per-model restore/delete logic. Each item has its own transaction. Protected, missing, active or invalid records are reported individually, while successful records are processed. The response contains `results`, `errors`, `succeeded` and `failed`. Duplicate selections and batches exceeding 100 records are rejected. Existing authentication and settings permissions apply to both formats.

The page removes successful selections, refreshes cached lists and displays individual failures for review. Permanent deletions still require explicit confirmation. Labels are provided in English, Dari and Pashto.

Deploy `api/views/data/trash.py` to the backend and the rebuilt contents of `frontend/dist/` to the frontend, including hidden files. Restart the Python application. There is no schema change or new migration for this feature.

Validation: 204 backend tests ran, with 202 passing and two existing/environment-specific skips. Seven new bulk API tests cover mixed types, restore, protected/active records, input validation, permissions and single-record compatibility. The frontend build and targeted page lint pass. No browser walkthrough was performed.
