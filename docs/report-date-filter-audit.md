# Report date-filter audit

## Fixed behavior

The shared date parser interprets calendar dates in `REPORT_TIME_ZONE` (Asia/Kabul in this project). A date-only end filter includes the entire day. Explicit ISO timestamps retain their exact time. Both `date_from`/`date_to` and `start_date`/`end_date` are accepted. One-sided ranges stay open-ended; invalid dates, reversed ranges, invalid periods and invalid fiscal-year selections return validation errors instead of silently broadening the report.

Transaction lists now apply their business event date: sales, raw-material purchases, expenses, salary/advance payroll, payments, loans and repayments, withdrawals, commissions, exchanges, production, packing, equipment, attendance, journal/account entries, stock movements and FX revaluations. Employee leave filters use overlap with the selected period. Customer/vendor/product master records are not filtered by their creation date; party financial summaries use their transaction dates.

Operational/base/per-currency reports, report history, daily ledgers and GL reports share inclusive range handling. DateField values (equipment acquisition and attendance dates) retain their business calendar date instead of shifting to the previous UTC date. Customer/vendor transaction histories and GL account lines also use the shared parser.

All-time history no longer falls back to today. Receivable history supports missing boundaries. AR/AP and loan-balance history use stored AFN amounts, currency-exchange history uses the saved deal rate, and equipment history uses booked acquisition-journal AFN totals (or conversion at acquisition for older records without a journal). Withdrawals now contribute to cash-out totals as well as their breakdown and drill-down. Existing accounting definitions for other report metrics are retained.

Product monthly grouping uses business-local months and supports all-time/one-sided periods. The existing calendar-year monthly chart structure remains unchanged. Frontend calendar-based month/year selections still submit Gregorian ISO boundaries through the existing calendar preference utilities.

Attendance lists and summaries now receive identical date, status and search filters. Weekly ranges are anchored to the chosen day rather than today's date; month ranges use the selected calendar. Report date pickers constrain the start/end choices to prevent reversed selections.

## Validation and limits

- Backend suite: 223 tests, 221 passed and two existing/environment-specific skips; UserWarning treated as an error.
- 19 new tests cover local-day boundaries, explicit timestamps, one-sided/all-time ranges, invalid filters, report endpoint consistency, AR history, equipment dates, expense history, attendance summaries, withdrawals, monthly grouping AFN history amounts, GL line boundaries and open-ended operational/journal ledgers. All registered history section queries are checked with bounded and open ranges.
- Seven frontend calendar tests and the shared API tests pass.
- Frontend production build, strict Django checks and migration drift checks pass.
- Tests use isolated SQLite databases. No browser walkthrough or live hosting-server/MySQL data comparison was performed.

## Deploy

Upload the updated backend `api/services/`, `api/utils/date_filters.py`, and changed `api/views/data/` files: `base.py`, `attendance.py`, `customer_user.py`, `customers.py`, `vendors.py`, `journal.py`, `reports.py`, and `daily_ledger.py`. No model/schema change or new migration is required for this date-filter work.

Upload the newly built contents of `frontend/dist/`, including hidden files, to the frontend host. Restart the Python application. Check a known transaction at the beginning/end of a selected day and compare its report total with its history. Existing pending migrations from earlier features, if any, must still be applied normally.
