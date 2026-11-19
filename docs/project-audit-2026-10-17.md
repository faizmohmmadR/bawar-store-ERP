# Project audit — 2026-10-17

Scope: project-wide automated backend and frontend checks, with targeted source review of raw materials, purchases, stock reconciliation, production storage, and the application route composition. The frontend contains 178 page TSX files and 123 component TSX files; backend Python files total 261 across `api`, `account`, and `backend`. These counts include supporting files, not just independently accessible screens.

## Fixes made

- `api/views/data/raw_materials.py`: purchase create and update previously converted incoming quantities/prices directly to Decimal before serializer validation. Invalid strings and non-finite or excessive values could raise unhandled exceptions. Validate numeric fields and the accumulated total through the existing serializer fields before calculating/saving purchases. Validate paid amounts before converting them as well.
- `api/tests/test_raw_material_stock.py`: added create/update regression coverage for malformed quantities, prices, and paid amounts (24 invalid requests). Each request must return HTTP 400 and preserve existing purchase count and stock.
- `frontend/src/pages/payments/shared/EditPaymentPage.tsx`: moved the loading return below all hooks. Loading followed by successful data retrieval previously changed the number of hooks executed, which can crash payment editing.
- `frontend/tsconfig.app.json`: removed `ignoreDeprecations: "6.0"`, which the installed TypeScript version rejects and which prevented type checking.
- `frontend/package.json`: added `npm run typecheck` for application and Vite configuration checks.
- `frontend/tailwind.config.ts`: replaced the CommonJS plugin require with an ES module import, addressing its lint error.

## Remaining findings

1. **Frontend type checking fails with 327 diagnostics.** Vite successfully bundles the app, but does not establish TypeScript correctness. Examples in the requested areas:
   - `src/components/raw-material-processes/ChangeProductionStatusDialog.tsx:59`: numeric value passed where a string is expected.
   - `src/pages/raw-material-sales/RawMaterialSaleDetails.tsx:68`: `Sale` does not declare `final_total`.
   - `src/pages/raw-material-sales/RawMaterialSaleList.tsx:317`: number/string identifier passed to string state.
   - `src/pages/stock/AddDamagedStock.tsx:256`: autocomplete option does not satisfy `StockOption` (missing required `id`).
   - `src/pages/stock/ExpiringStockList.tsx:28`: three number/string mismatches.
   - Other examples include missing dialog props on attendance routes, an undefined `signup` context member, and missing API response types. Some affected source files may not be reachable from current routes; diagnostics alone do not prove a runtime failure.
2. **Lint still fails with 160 errors and 69 warnings.** Many errors are explicit `any` types; there are also empty interfaces and other rule violations. Hook dependency warnings require individual review because stale values can affect page behavior. Rules have not been disabled to hide findings.
3. **Default backend startup failed in this execution environment:** python-decouple received `DEBUG=release`, which is not a supported boolean. All backend checks here use the process override `DEBUG=False`. Environment files were not modified. Verify the process environment and deployment configuration before normal startup.
4. **Large frontend bundle:** the main JavaScript asset is about 2.46 MB (657 kB gzip), and Vite emits a chunk-size warning. Route-level lazy loading is worth reviewing for initial loading performance.
5. **Backend serializer warning:** DRF reports that a DecimalField `min_value` should be a Decimal instance. This warning does not fail the suite.

The largest type-diagnostic groups are accounts (89), loans (49), expenses (36), returns (34), loaners (17), and sales (16). They need API-contract and component-prop review; broad casts would conceal the underlying mismatches.

## Validation and reproduction

Run from the repository root:

```sh
DEBUG=False venv/bin/python manage.py test --noinput
DEBUG=False venv/bin/python manage.py makemigrations --check --dry-run
```

Run from `frontend`:

```sh
npm run build
npm run typecheck
npm run lint
```

The final backend suite runs 135 tests: 134 pass and one is skipped. The targeted raw-material stock suite passes all 16 tests, including the new malformed-input regression. The migration check reports no changes detected. The production build passes after the frontend changes. Lint and typecheck remain failing as described above.

Existing backend tests exercise purchase stock reconciliation, FIFO production costing, stock consumption, foreign-currency purchase costing, tank capacity limits, production status transitions, packing deductions and updates, raw-material sales, and accounting. Passing tests only establish behavior covered by their assertions.

## Coverage limits

No authenticated browser walkthrough or screenshot inspection was performed. Responsive layout, RTL appearance, every section's interactive behavior, user-role combinations, printing, uploads, and live network behavior remain unverified. Automated compilation and lint scan frontend source broadly, but are not a manual review of every file or page. Backend tests use an isolated test database and do not validate existing operational records or concurrent production traffic. The pre-existing changes in `frontend/.env` were preserved.
