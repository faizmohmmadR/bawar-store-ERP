# Employee balances and payroll adjustments

Employee lists show contact information and contract/status in paired general-information cells. Accrued salary, pay rate, paid amount, remaining amount, overtime, and deductions have separate columns. The balances are cumulative; month/year filters are available on the payroll list and financial summary API.

## Contract accrual

For monthly or daily employees with a contract start date:

```
through date = contract end date when set, otherwise today
contract days = max(0, through date − contract start date + 1)
daily rate = current monthly salary ÷ 30, or the current daily salary
total salary = contract days × daily rate, rounded once to two decimals
payable = total salary + recorded bonus + overtime − recorded deductions
remaining = payable − salary payments − advances
```

- Both start and through dates are included. Partial months count by their actual days. Monthly salaries use the existing 30-day payroll basis; for example, salary 3,000 over 31 contract days produces a total of 3,100.
- A contract end date is used even when it is in the future, making this the full contract total. Without an end date, only days through today are included. Dates use the configured reporting timezone (Asia/Kabul).
- Payments before the contract starts and future-dated payments do not enter the cumulative balance. Payments after contract end can still settle an outstanding balance.
- Deleted payrolls are excluded. A negative remaining amount represents an overpayment/advance against future accrual.
- The employee's current rate is used for all contract days; historical salary-rate changes are not stored by this feature.
- Missing contract start dates and the manual `other` salary type show no inferred total. Daily employees use their daily rate for all contract days. This total does not imply attendance on those days; recorded payroll deductions adjust the remaining balance separately.
- The summary exposes `elapsed_days` and `daily_rate` alongside `accrued_salary` (the API field for total salary). Complete-month metadata is retained for compatibility but is not used to calculate salary totals.
- Pay-period summary fields (`total_paid`, `total_remaining`, etc.) remain separate from the new cumulative fields (`accrued_salary`, `lifetime_paid`, `lifetime_remaining`).

## Adjustments

Payroll create/edit pages accept bonus, overtime amount, and a separate monetary salary deduction. The payment-before-adjustments and net payment are displayed separately. Daily payrolls also accept absence days and calculate rate × eligible days on the server. Advances do not accept salary adjustments.

`salary_deduction` stores the monetary deduction; `deductions` is the computed total including absence deductions. `gross_amount` preserves a manual payment before adjustments. It is nullable so existing manual payroll records retain their original net payment until explicitly edited. Editing their adjustments infers their original gross once, avoiding repeated additions/subtractions.

The API recalculates net amounts before populating base-currency fields and posting the accounting journal. Negative adjustments, deductions above earnings, and absence days above working days are rejected. Existing payroll salary types and daily pay rates are preserved when editing through the UI.

## Employee history

Each employee's detail page includes a financial summary and paginated history of all non-deleted salary and advance payments. Rows show period, payment date, payment type, gross amount, bonus/overtime, deductions, net paid, and notes, with a link to payroll details.

API routes:

- `GET /api/employees/{id}/financial_summary/`
- `GET /api/employees/{id}/payroll_history/?page=1&page_size=10`
- `GET /api/payrolls/?employee={id}&month=february&year=2026&payroll_type=salary&page_size=25`

Payroll changes invalidate employee-list balances, employee summary/history, and payroll detail caches. English, Dari, and Pashto labels are included.

## Database and validation

Migration `api.0016_payroll_salary_adjustments` adds nullable `gross_amount` and zero-default `salary_deduction`. It was applied to the local database after an SQLite backup under `/tmp/mirbatzada-before-payroll-adjustments-20261017-220920.sqlite3`. Other installations must apply the migration before using these changes:

```sh
python manage.py migrate
```

The complete backend suite passed (148 tests: 147 passed, one skipped). Added regression tests cover accrual anniversaries, contract end limits, adjustments, advances, excluded payments, legacy edits, monthly/daily absence deductions, historical pay-basis preservation, accounting journal totals, employee scoping, history pagination, and calendar-specific payroll periods. The production frontend build passes. Targeted ESLint checks pass. Project-wide type checking still reports pre-existing errors outside the employee/payroll files reviewed here. A browser-based visual walkthrough was not performed.

## Calendar preference

Payroll period selection follows Settings → Preferences: Gregorian, Afghanistan Solar Hijri, or Lunar Hijri. `period_calendar` preserves the calendar used by each record; existing payrolls default to Gregorian. Month keys remain canonical ordinal keys (`january` for month 1 through `december` for month 12), with the year interpreted in `period_calendar`. UI labels use the actual month names in the selected calendar. A period created under another calendar displays its converted start/end dates, because its month boundaries can differ.

Month/year filters and employee period summaries include `period_calendar` to separate periods correctly. Cumulative balances still include all calendars. The unique payroll-period constraint now includes the calendar. Migration `api.0017_payroll_period_calendar` was applied locally after a backup at `/tmp/mirbatzada-before-payroll-calendar-20261017-222839.sqlite3`; deploy it on other installations as well.
