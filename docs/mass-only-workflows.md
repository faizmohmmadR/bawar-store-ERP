# Mass-only entry and display

Raw-material and product Add/Edit forms use a combined kg/gr field. Grams convert
exactly to canonical kilograms. Raw-material lists/details show kg sizes. The
volume-basis, ml/L and density inputs have been removed from these forms.

Tank sales default to kg. The volume toggle, volume balances and volume-specific
price/quantity labels are removed from sales forms. Historical tank sales are
converted for editing and display using their saved kg quantity; the corresponding
unit price change proportionally, preserving their totals.

Stock details, operational reports and
invoices use mass or count units. Newly generated packed-product names use kg.
Unused volume-entry widgets and frontend volume helpers have been removed.

Products now store an explicit four-decimal `bottle_capacity_kg`. Migration 0024
backfills it from each product's existing capacity and density. New kg inputs retain
the exact mass even where a legacy volume conversion would be rounded. Packed-stock
kg-to-piece conversion prefers this canonical mass.

Historical volume fields remain internal compatibility data for existing stock,
production, packing, sales, returns and accounting movements. They have not been
dropped or reinterpreted as kilograms. Legacy API payloads remain supported for
existing integrations and regression coverage.

Some raw-material/package definitions only have an old volume size, with no
material-specific density or kg capacity. Those kg values are not guessed from
volume. Their current history stays usable, and their next edit requires an explicit
kg/gr size. At implementation time, 13 existing definitions needed this entry.
Existing material/product names are preserved; names containing old size text are
not automatically renamed.

Verification: full backend suite 171 tests (170 passed, 1 existing skip); frontend
production build; four mass-entry/display/round-trip tests; targeted form lint;
Django system and migration drift checks. Existing unrelated frontend type-check
errors remain.
