# Moving weighted-average inventory review

The inventory changes use:

`new average = (remaining quantity × current average + incoming quantity × incoming cost) / combined quantity`

Example: receive 100 kg at 10 AFN, consume 80 kg, then receive 20 kg at 30 AFN. The resulting stock is 40 kg at 20 AFN. Averaging all historical purchases would incorrectly produce 13.333333 AFN.

## Implemented behavior

- Raw-material receipts combine with the remaining balance, including opening stock. Receipt corrections carry the previous receipt value so price-only edits work correctly.
- Production and packing consume current pooled costs. Legacy purchase selectors do not select a different price or restrict availability to one receipt.
- Kilogram packaging consumption reduces both weight and package count. Editing a run previews the same restored quantity and value used when saving.
- Finished stock has one current average per product and condition. Physical lots remain available for expiry handling and traceability; their current costs share the pool average. Original receipt costs are saved separately.
- Sales and adjustments retain issue-cost snapshots. Later receipts cannot silently reprice earlier sale costs. Returns blend their saved issue value back into the current balance.
- Packing output reversal removes the original output value. This is a reversal of a known production receipt, rather than an ordinary sale or write-off.
- Legacy stock-only opening balances are preserved before direct receipts, stock counts, transfers, write-offs, and return traces create batches.
- Unit costs retain six decimal places. Display/report monetary amounts retain their existing rounding.
- Purchase history remains visible and is labelled as history, separately from the current weighted-average price.

Tank liquid already calculates available value from production transfers and saved packing/sale costs; that service was retained.

## Database rollout

Migrations 0011–0013 are prepared. They preserve original receipt costs and historical issue information before pooling the remaining finished inventory and increasing unit-cost precision. They have been exercised by isolated in-memory SQLite tests, not applied to the application database.

Back up the intended database, review the migration plan, then run the normal project migration command before starting this code against that database. Do not roll back the data-conversion migration expecting the former per-lot valuations to be restored automatically.

Existing positive raw-material prices are treated as the opening valuation. If those prices were previously repaired using lifetime purchases, their actual remaining-stock valuation needs a separate reconciliation. Historical purchase quantities alone cannot safely reconstruct a consumed or mixed opening balance. The repair command now defaults to a dry run and only fills missing prices when received quantities exactly reconcile with stock on hand; it does not overwrite positive prices or guess consumed-stock values.

## Verification

- `manage.py test api.tests.test_moving_weighted_average api.tests.test_raw_material_sales --noinput`: **23 passed**, isolated SQLite.
- `npm run test:production`: **6 passed**.
- `npm run build`: passed (existing large-chunk warning).
- `makemigrations --check --dry-run`: no model drift.
- `git diff --check`: passed.
- TypeScript check: 273 diagnostics in both HEAD baseline and working tree; no added diagnostic signatures.
- Full backend suite is not green: the final run of 345 tests has 29 failures, 5 errors, and 2 skips. The unchanged HEAD baseline has 325 tests with 9 failures, 4 errors, and 2 skips; the 21 additional failing cases assert the replaced pricing/selection contract. Remaining inventory failures assert the previous FIFO/selected-purchase pricing contract, including an index into the now-empty selectable purchase list. Reporting failures also occur in the unchanged baseline. These legacy assertions were retained, rather than deleted or skipped; independent tests exercise the new contract.

Automatic approval review rejected a proposed broad rewrite of the older tests because it could conceal regressions. Separate acceptance tests were added instead. No claim is made that the entire existing suite passes or that browser interaction has been manually exercised.

The user's existing changes were preserved. `frontend/.env` was not read or modified by this review. No application records were inserted, migrations applied to the application database, commits created, or changes pushed.
