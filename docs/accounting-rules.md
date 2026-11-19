# Accounting rules (locked)

These decisions are final. Do not reopen them during the multi-currency
refactor. This document is the contract for Phases 0–8.

The system is still in development. Accounting architecture must be corrected
before production launch.

---

## Locked business decisions

1. Supported currencies: **AFN**, **USD**, **KDR**.
2. **AFN is the functional / reporting currency.**
3. Real money remains currency-specific.

  Examples: Cash AFN, Cash USD, Cash KDR.

4. A USD expense must affect **Cash USD only**.

   Example: $100 USD expense, rate 87.20 AFN/USD.

   Correct journal:

   - Dr Expense 100 USD
   - Cr Cash USD 100 USD

   AFN equivalent: 8,720 AFN (reporting / historical conversion only).

   **Cash AFN must not change.**

5. **Do not create a fake Base Chart of Accounts.**

   Never create Base Cash, Base Expense, Base AR, Base AP, Base Sales,
   Base Inventory, or any equivalent duplicate reporting ledger.

6. **Journal lines are the authoritative accounting source of truth.**

   Operational fields such as `amount_base`, `total_amount_base`, and
   `exchange_rate` may remain on source documents for audit, UI, performance,
   or historical reference. Accounting reports must ultimately be based on
   journal lines.

7. **Historical exchange rates are immutable.**

   If a transaction was recorded at 1 USD = 87.20 AFN, changing today's rate
   to 90.00 must never modify that historical journal line or its AFN
   equivalent.

8. **Currency exchange is a separate transaction type.**

   Only an actual currency exchange may move two currency-specific cash
   accounts.

9. Foreign-currency settlement may create **realized FX gain/loss**.

10. Period-end revaluation may create **unrealized FX gain/loss**.

11. **Branches are isolated systems / tenants.**

    A branch user must not access another branch's data. Isolation is enforced
    server-side.

12. **Frontend filtering is never a security boundary.**

---

## Rate convention

Exchange rates always mean:

> 1 unit of transaction currency = X AFN

Examples:

- USD = 87.20
- AFN = 1

Do not mix inverse rate conventions. AFN exchange rate is always 1.

Store the historical rate on the journal line at posting time. Never
recalculate historical lines using a later rate.

---

## Chart of accounts (target)

Currency-specific accounts remain only where they represent physically or
operationally distinct monetary accounts:

- Cash AFN / Cash USD / Cash KDR
- Bank AFN / Bank USD / Bank KDR
- Sarafi / exchange accounts where appropriate

Ordinary accounting accounts must **not** be duplicated per currency:

- Transportation Expense
- Sales
- Accounts Receivable
- Accounts Payable
- Inventory
- Salary Expense
- Rent Expense

Currency lives on the **journal line**, not as `Transportation Expense USD`.

**Phase 1 and Phase 2 must not merge the Chart of Accounts.** The current
system has a full CoA per branch per currency. That structure stays until
Phase 5. Until then, consolidated AFN reports group by a stable identity
(account code / role), never by inventing Base accounts.

---

## Journal currency rules

Do **not** require every journal to contain exactly one currency.

**Normal operational journals** (sale, purchase, expense, normal payment,
normal receipt) should normally use one transaction / native currency.

Example — USD expense:

- Dr Expense 100 USD
- Cr Cash USD 100 USD

**Multi-currency journals are allowed only** for explicitly supported types:

- Currency exchange
- Realized FX settlement
- Period-end FX revaluation
- Other explicitly approved accounting adjustments

Use the existing journal / source-type architecture (content type + source
document) rather than inventing a parallel enum unless one already exists.

---

## Double-entry validation

Do **not** implement a universal check:

> sum(native debit) == sum(native credit)

across different currencies. That is meaningless for:

- Dr Cash AFN 87,200 AFN
- Cr Cash USD 1,000 USD

Rules:

- **Single-currency journal:** native debit total must equal native credit total.
- **Permitted multi-currency journal:** the functional (AFN) equation must
  balance, including explicit realized FX gain/loss lines where applicable.

Journal line constraints:

- `debit >= 0`, `credit >= 0`
- not both debit and credit positive on the same line
- `base_debit >= 0`, `base_credit >= 0`
- not both base debit and base credit positive on the same line
- `exchange_rate` must be positive
- AFN rate = 1

Use `Decimal`. Never `float` for accounting amounts.

---

## Reporting distinction

**Historical transaction conversion** (P&L recognition):

- $100 × 87.20 = 8,720 AFN
- This is the transaction-date AFN equivalent stored on the journal line.

**Period-end Balance Sheet valuation** (monetary items only):

- $10,000 × closing rate 90 = 900,000 AFN
- This is the reporting-date valuation. It is an **additional** revaluation
  journal. It must not rewrite original transaction rates.

P&L preserves historical recognition. Balance Sheet monetary items support
period-end revaluation.

Never display an AFN equivalent as physical Cash AFN unless the transaction
actually used AFN cash.

Inventory and other non-monetary items are **not** revalued like cash.

---

## Realized vs unrealized FX

**Realized FX** (Phase 3B) — settlement of a monetary item at a different
rate than the original booking.

Example:

- Invoice 1,000 USD at 87.20 → book value 87,200 AFN
- Payment 1,000 USD at 90.00 → cash functional value 90,000 AFN
- Realized FX gain = 2,800 AFN
- Original invoice rate remains 87.20

Applies to AR settlement, AP settlement, foreign-currency loans, and other
monetary settlements. This is **not** a Currency Exchange document unless
the business event is actually exchanging currencies.

**Unrealized FX** (Phase 4) — period-end revaluation of open monetary
foreign-currency balances.

Example:

- Cash USD 10,000
- Historical carrying value 872,000 AFN
- Closing rate 90.00 → closing value 900,000 AFN
- Unrealized FX gain = 28,000 AFN

Revaluation journals must be identifiable, reversible where appropriate,
traceable to the reporting period and closing rate, and **idempotent**.

---

## Currency exchange (Phase 3)

First-class document, not an expense / sale / purchase.

Example — 1,000 USD → 87,200 AFN:

- Cr Cash USD 1,000 USD
- Dr Cash AFN 87,200 AFN

If the USD carrying / book value differs from the amount used in the
exchange, recognize realized FX gain/loss. Reverse direction (AFN → USD)
must also be supported.

---

## AR / AP subledger

Even after CoA merge, AR/AP balances remain by:

- branch
- customer / supplier
- currency

The GL may use a single Accounts Receivable account per branch. The
subsidiary ledger stays customer + currency.

---

## Posted history

Prefer states such as DRAFT / POSTED / REVERSED.

Do not silently edit posted accounting history. Corrections use reversal or
adjustment journals. Every journal must be traceable to its source
transaction.

---

## Branch isolation

The backend derives / validates branch access from the authenticated user
and the allowed `X-Branch-Id` context.

- Branch staff are locked to their home branch.
- A client-supplied `branch_id` is never trusted as a security boundary.
- HQ / company-wide consolidated reporting is permission-controlled.
- A normal branch user must not receive company-wide data.

---

## Absolute prohibitions

Never:

- create Base Cash / Base Expense / Base AR / Base AP
- post USD expenses into Cash AFN
- rewrite historical exchange rates
- use today's rate for yesterday's transactions
- use float for accounting calculations
- use frontend branch filtering as security
- trust an arbitrary client `branch_id`
- duplicate accounting entries merely for reporting
- revalue Inventory as Cash in this work
- silently rewrite posted accounting history
- invent exchange rates during migration
- run destructive accounting migrations without validation
- create duplicate FX entries when revaluation is rerun
- confuse realized FX with unrealized FX

---

## Current system (Phase 0 audit)

Confirmed by repository inspection. Do not assume this remains true after
later phases.

### Chart of accounts

- `GLAccount` is unique on `(branch, currency, code)`.
- `ensure_branch_gl_accounts` clones the full template
  (`DEFAULT_GL_ACCOUNTS` in `api/models/data/journal.py`) for every
  supported currency on each branch.
- Roles resolve through `api/constants/gl_roles.py` and
  `api/services/accounting/coa.py` (`gl_for_source` / `get_gl_for_role`).

### Journal line (before Phase 1)

`JournalLine` currently has:

- `gl_account`
- `debit`
- `credit`
- `description`

It does **not** yet have `currency`, `exchange_rate`, `base_debit`, or
`base_credit`. Native amounts are implied by the GL account's currency.

### Posting

- `api/services/accounting/sync.py` builds lines from source documents.
- `api/services/accounting/posting.py` `replace_journal_for_source` writes
  the journal atomically and currently validates **native** debit = credit.
- Posting selects the CoA for the **transaction currency**. A USD expense
  posts to Cash USD (code 1000, currency=USD), not Cash AFN.
- Signals: `api/signals/journals.py`.
- Operational `*_base` / `exchange_rate` are populated by
  `api/services/currency_conversion.py` from `ExchangeRate`
  (`1 from_currency = rate AFN`, `date__lte` transaction datetime).

### Reports (before Phase 2)

- Trial Balance / P&L / Balance Sheet (`api/services/accounting/reports.py`)
  filter `JournalLine` by `gl_account__currency`. Opening the USD book shows
  native USD; it is not an AFN converter.
- Consolidated AFN operational report
  (`api/services/financial_reports.get_base_currency_report`) overlays ledger
  P&L / cash / AR / AP in AFN. Operational cash in/out breakdowns still use
  stored `*_base` fields.
- `financial_reports.py` may serialize totals through `float()` at the JSON
  boundary after Decimal math (Phase 8). GL posting never uses float.

### Missing capabilities (later phases)

None — Phases 0–8 of the multi-currency accounting refactor are complete.

Done: Journal-line functional amounts (Phase 1),
ledger-based AFN Trial Balance (Phase 2), Currency Exchange document (Phase 3),
realized FX on AR/AP/loan settlement (Phase 3B), period-end FX revaluation
(Phase 4), Chart of Accounts merge (Phase 5), frontend form polish (Phase 6),
branch security audit (Phase 7), stabilization (Phase 8).

### Branch isolation (started)

- `api/utils/branch_scope.py`, `X-Branch-Id` middleware,
  `BranchScopedMixin`, and per-viewset `get_queryset` filters.
- `filter_queryset_by_branch` returns `qs.none()` when no branch can be
  resolved — it must not leak all-branch data.
- Phase 7 is a full backend audit. Frontend filters are not security.

---

## Implementation order

0. Tests + this document (no model changes except test infrastructure)
1. JournalLine currency / rate / base fields + posting + safe backfill
2. Ledger-based reporting (native + AFN consolidated)
3. Currency Exchange document
3B. Realized FX on settlement
4. Period-end revaluation / unrealized FX
5. Chart of Accounts cleanup
6. Frontend labels and native / AFN report modes
7. Branch security audit + tests
8. Stabilization (Decimal, atomic posting, full suite)

## Phase 1 status

JournalLine now stores:

- `currency` — native currency of the line
- `exchange_rate` — historical rate (1 unit of currency = X AFN; AFN = 1)
- `base_debit` / `base_credit` — AFN equivalent at that historical rate
- `needs_rate_review` — set when a historical line cannot be mapped without inventing a rate

Posting (`replace_journal_for_source`) fills these from the source document.
Chart of Accounts is unchanged (still one full chart per branch per currency).

Use JournalLine `needs_rate_review` to find lines whose historical AFN rate
could not be backfilled without inventing a rate.
Do not treat `base_debit` / `base_credit` as Cash AFN.

## Phase 2 status

Accounting statements read JournalLine:

- Native mode: `JournalLine.currency` + `debit`/`credit`
- AFN consolidated mode: `base_debit`/`base_credit` grouped by account **code**
  (Transportation USD and Transportation AFN combine in reporting; no Base CoA)

API: `?mode=native|base` on trial balance, P&L, and balance sheet.

Daily Transaction Book defaults to journal lines (native amount, rate, AFN equivalent).
Year-end close still uses the native AFN book (unchanged on purpose).

## Phase 3 status

`CurrencyExchange` is a first-class document (`api/models/data/currency_exchange.py`).

Example — 1,000 USD → 87,200 AFN:

- Cr Cash USD 1,000 USD
- Dr Cash AFN 87,200 AFN

Native Dr=Cr is not required. AFN/base amounts must balance.

If FROM-currency cash carrying differs from the AFN value received, the
document posts realized FX gain (4300) or loss (5350) in the AFN book.
This is exchange-document FX, not AR/AP settlement (Phase 3B).

Statuses: DRAFT (no journal), POSTED (auto journal), REVERSED (journal removed).
Posted amounts cannot be edited; reverse instead.

API: `/api/currency-exchanges/`. UI: Accounting → Currency Exchange.

Do not start Phase 3B until these tests pass.

## Phase 3B status

Sale / purchase / loan payments recognize **realized FX** when the settlement
rate differs from the original invoice or loan carrying rate.

Example — invoice 1,000 USD @ 87.20, payment 1,000 USD @ 90.00:

- Dr Cash USD 1,000 (base 90,000 at settlement rate)
- Cr AR USD 1,000 (base 87,200 at invoice carrying rate)
- Cr Realized FX Gain 2,800 AFN

The original invoice `exchange_rate` / `*_base` are never rewritten.

AP settlement and foreign-currency loan collections/repayments use the same
rule (payable: higher settlement rate → FX loss).

Module: `api/services/accounting/fx.py`. Same GL codes as Phase 3 exchange FX
(4300 / 5350). This is still not period-end revaluation (Phase 4).

## Phase 4 status

`FxRevaluation` is a first-class period-end document
(`api/models/data/fx_revaluation.py`).

Example — Cash USD 10,000 booked at 87.20 (carrying 872,000 AFN), closing 90.00:

- Native Cash USD stays 10,000
- AFN carrying rises to 900,000 via a **base-only** line on Cash USD
- Cr Unrealized FX Gain 28,000 AFN (4400)

Inventory (1100) is never revalued. Monetary accounts only: cash/bank/sarafi,
AR, advances, loans receivable, AP, loans payable.

Idempotent: unique `(branch, as_of_date)`; re-running replaces the same journal.

API: `/api/fx-revaluations/`. UI: Accounting → FX Revaluation.
GL: 4400 unrealized gain / 5400 unrealized loss.

## Phase 5 status

Chart of Accounts is currency-specific only for real money books:

- Cash `1000`, Bank `1050`, Sarafi `1060` — one GL per branch **and** currency
- All other system GLs (Inventory, AR, AP, expenses, revenue, equity, FX P&L,
  loans, advances, etc.) — **one per branch** in home currency (AFN)

Currency of a transaction lives on `JournalLine`, not as cloned “Expense USD”
accounts. Migration `0051_coa_merge_generic_accounts` remaps FKs and journal
lines onto the home-currency generic, then deletes foreign-currency duplicates.

Resolution: `get_gl_account` / `ensure_branch_gl_accounts` in
`api/services/accounting/coa.py`. Merge helper:
`api/services/accounting/coa_merge.py`.

## Phase 6 status

Frontend matches the books:

- Expense / sale / payment forms show amount + currency, live **exchange rate**,
  and **AFN equivalent (reporting)** — never presented as Cash AFN.
- Detail pages show the stored historical rate / AFN equivalent.
- Manual journals: entry-level native currency; GL picker uses
  `posting_currency` (currency-specific cash books + AFN generics); payload
  sends line `currency`. Serializer validates **line** currency, not GL FK
  currency equality.
- Reports (TB / P&L / BS) label Native vs AFN Equivalent / Reporting.
- CoA copy clarifies cash/bank/sarafi vs shared generic GLs.

## Phase 7 status

Branch isolation is enforced server-side (frontend filters are not security):

- Customer/vendor export & account-history actions use `get_object()` (no IDOR).
- Inventory batches / allocations / adjustments scoped by warehouse/sale branch.
- Sales/purchase/return line items scoped via parent order branch.
- Payment `for_sale` / `for_purchase` assert order accessibility.
- Journal `for_source` filtered by branch.
- Operational daily ledger sets report-branch context before querying.
- Report helpers for returns / payroll / advances / loans / marketing
  honor `apply_report_branch_filter`.
- Expense / currency-exchange updates cannot re-stamp another branch
  for branch staff.

## Phase 8 status

Stabilization:

- `api/services/accounting/*` uses `Decimal` only (no `float()` in posting/FX/reports).
- Daily ledger and contact-history aggregates accumulate in `Decimal`; float is
  JSON-boundary serialization only.
- Expense / currency-exchange / marketing / payroll / loan payment
  writes use explicit `transaction.atomic` so source + journal stay together
  (signals still re-raise on posting failure).
- No `rebuild_journals` management command (no silent rewrite of posted history).
- Operational report helpers may still cast to float at the API boundary after
  Decimal math (same pattern as before; not used for GL posting).

