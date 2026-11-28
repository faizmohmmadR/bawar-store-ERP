# Calendar preference across the ERP

Settings → Preferences selects Gregorian, Afghanistan Solar Hijri (Afghan month names), or Lunar Hijri. The shared date picker and date/time input use this preference for day, month, and year selection. The date/time input keeps time as a separate control and sends a Gregorian ISO value to the existing API.

Shared table rendering now formats ISO values in date columns (`date`, `*_date`, `*_at`, and `date_*`) through the selected calendar. Custom date cells continue to use `ListDate` or `useFormatAppDate`. Remaining direct timestamps and raw date ranges were updated in raw-material details, fiscal-year screens, and leave management.

Monthly and yearly report presets resolve the selected calendar's start of month/year and send explicit Gregorian ISO ranges. This applies to dashboard, financial reports, accounting reports, party balances, and attendance month ranges. Explicit fiscal-year selection retains its stored fiscal-year boundaries. Fiscal-year identifiers and transaction references are not reinterpreted as date values.

Shared print timestamps, party report date ranges, invoices, journals, daily ledger, and list date helpers use the preference as their default. Existing timestamp parsing now preserves hours/minutes instead of replacing timestamp times with noon. Date-only values retain their calendar day.

Payroll periods have a saved calendar so a Solar Hijri year is not stored as though it were Gregorian. See [employee-payroll.md](employee-payroll.md). Contract salary-accrual calculations retain their existing business rules; choosing a display calendar does not change historical wages.

Validation:

- `npm run test:calendar`: seven tests covering three-calendar round trips, Afghan month names, leap dates, timestamp preservation, settings-driven formatting, report boundaries, and payroll period conversion.
- Full Django suite: 148 tests, 147 passed and one skipped.
- Production frontend build passes; targeted calendar/payroll lint checks pass.
- Existing project-wide TypeScript failures remain; comparison against the preceding task's diagnostic output found no new errors.
- No authenticated browser walkthrough was performed.

API dates and stored business dates remain Gregorian ISO values. Date display and period selection are converted at the UI/request boundary. Server-side legacy PDF/Excel endpoints, which are not called by the current frontend, keep their existing export behavior.
