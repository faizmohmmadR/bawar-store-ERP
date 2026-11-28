# API workflow audit — 2026-10-18

## Result

The tested backend workflows pass after fixing six backend defects and the direct
attendance form routes. This does **not** establish that every UI interaction is
correct: the frontend still has existing type-check and lint failures.

All data entry used Django's isolated test database. The working database, user
accounts, environment files and operational records were not changed by this audit.
Document uploads used a temporary media directory that was removed afterward.

## Workflow coverage

| Area | What was exercised |
| --- | --- |
| Authentication | Login through the real login endpoint, Knox token authentication, profile and users list; anonymous requests rejected across 48 registered list sections |
| Customers, suppliers | API creation, retrieval and updates using form-shaped payloads |
| Employees and payroll | Required contract start, employee creation/edit, monthly gross pay with overtime and monetary deductions, exact net salary; existing suite also covers daily/manual pay and balances |
| Attendance and leave | Create attendance with check-in/out and fractional break, assert work/overtime hours, submit and approve leave |
| Raw materials and purchases | Reusable categories, material definitions, purchases, foreign-currency costs and resulting stock layers |
| Production and storage | Ingredient consumption, kg/g conversion, FIFO costs, tank transfers and limits; existing suite checks edits/deletions and restoration |
| Packing | Packaging consumption and costing, different bottle/plastic/carton sizes, kg entry, editing and deletion |
| Sales and payments | Finished stock, raw material and tank-fill sales, multiple currencies, payments, stock movements, accounting and deletion reversal |
| Expenses and withdrawals | Decimal-amount entry, expense update/delete, owner withdrawal against a real GL account |
| Equipment | Acquisition and annual depreciation; assert resulting net book value |
| Loans | Loan receipt/giving, repayment and updated paid balance |
| Accounting | Operational account creation, balanced manual journal entry, rejection of an unbalanced journal, report endpoints and production-flow journal/report consistency |
| Notifications | Create alert and mark it read |
| Documents | Multipart sale document upload, owner-filtered listing and deletion |
| API lists and form metadata | Authenticated GET and OPTIONS on all 48 registered list sections, including stock, batches, adjustments, returns, fiscal years, exchange/revaluation, permissions, activity logs and daily ledger |
| Shared frontend behavior | Calendar formatting tests and Dari/Pashto decimal digit input tests |

The new `api/tests/test_section_api_audit.py` adds five integration scenarios.
The production-to-reports scenario executes the existing `seed_production_flow`
command **inside the test database**, then tests document entry. These scenarios
supplement the existing business-rule tests; a list/metadata check is not equivalent
to exercising every write action in that section.

## Defects fixed

1. Attendance list/detail/filter requests failed because `AttendanceViewSet` had no queryset. Added an employee-aware queryset.
2. Employee leave list/detail/approval requests had the same missing-queryset problem. Added the leave queryset.
3. Loan-payment lists/details had no queryset. Added the loan-payment queryset.
4. Activity-log lists and statistics had no queryset. Added the activity-log queryset.
5. Operational account creation/editing failed because `AccountWriteSerializer.Meta` declared no fields. Defined the writable account fields explicitly.
6. Withdrawal validation unconditionally raised an empty validation error whenever a request user existed. Removed this broken branch; endpoint permissions and GL-account/currency validation remain active.
7. Direct attendance Add/Edit and Add Leave routes rendered dialog components without required open/close/record props. Added route wrappers that open the forms, load the edit record and navigate back after saving/closing.

## Verification

- Full backend suite: **170 tests run — 169 passed, 1 existing skip**.
- The existing skipped test concerns the removed finished-goods Purchase module.
- Production frontend build: passed.
- Calendar tests: 7 passed.
- Numeric-input tests: 3 passed.
- New attendance route component lint: passed.
- Django system checks: passed.
- Migration drift check: no changes detected.
- Whitespace/diff checks: passed.

Reproduce:

```sh
DEBUG=False venv/bin/python manage.py test --noinput
DEBUG=False venv/bin/python manage.py check
DEBUG=False venv/bin/python manage.py makemigrations --check --dry-run
```

From `frontend`:

```sh
npm run build
npm run test:calendar
npm run test:numeric
npm run typecheck
npm run lint
```

## Remaining findings and limits

- Frontend type checking still reports **319 TypeScript diagnostics**. Largest groups: accounts (89), loans (49), expenses (36), returns (34), loaners (17), sales (16). The three missing-prop diagnostics in attendance routes were resolved. Some diagnostic groups include legacy files that are not mounted as current routes.
- Whole-project lint still reports **148 errors and 69 warnings**. Most are existing typing/style issues; hook dependency warnings need individual review. Rules were not weakened to make checks pass.
- Vite reports the existing large-main-bundle warning. DRF still emits a Decimal `min_value` warning.
- APIClient sends real requests through Django URL routing, authentication, permissions, middleware, serializers, persistence and business services. UI-shaped payloads and API responses were tested; no authenticated browser walkthrough was performed.
- Every page's rendering, interactive layout, all role combinations, printing, hardware attendance integration, actual email delivery, external services, concurrent traffic, and destructive backup/restore operations remain unverified.
- Passing these tests is evidence for the listed cases, not a guarantee that every possible input, existing working record or production deployment is correct.
