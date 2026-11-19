# Multi-Currency Accounting Logic Report
## Netro ERP — for external review (ChatGPT / auditor)

**Purpose of this document:** Explain exactly how this ERP handles accounts and currencies, case by case, so an independent reviewer can check whether the logic is correct.

**Context:** The system is still in development. AFN is the functional/reporting currency. Supported currencies: **AFN, USD, KDR**.

---

## 1. Core principles (locked)

1. **AFN is the functional / reporting currency.** All consolidated financial statements are in AFN.
2. **Real money stays currency-specific.** Physical cash/bank in USD is never mixed into Cash AFN.
3. **No fake “Base” Chart of Accounts.** We do **not** create Base Cash, Base Expense, Base AR, etc. AFN equivalents live on journal lines for reporting only.
4. **Journal lines are the source of truth** for accounting reports (not operational document fields alone).
5. **Historical exchange rates are immutable.** Changing today’s rate must never rewrite old journal lines.
6. **Branches are isolated** server-side (tenant-like). Frontend filters are not security.
7. **All money math uses Decimal**, never float.

### Rate convention

```
1 unit of transaction currency = X AFN
```

Examples:
- USD = 87.20 → 1 USD = 87.20 AFN  
- AFN = 1 always  

Each journal line stores: native `debit`/`credit`, `currency`, `exchange_rate`, and `base_debit`/`base_credit` (AFN equivalent at posting time).

---

## 2. Chart of Accounts design

### 2.1 Two kinds of GL accounts

| Kind | Examples | How many per branch | Where currency lives |
|------|----------|---------------------|----------------------|
| **Currency-specific (real money books)** | Cash (1000), Bank (1050), Sarafi (1060) | **One account per currency** (Cash AFN, Cash USD, Cash KDR, …) | On the **GL account** itself (`GLAccount.currency`) |
| **Generic (shared chart)** | Operating Expenses, Sales, AR, AP, Inventory, FX Gain/Loss, etc. | **One account per branch** (stored under home currency AFN on the GL row) | On the **journal line** (`JournalLine.currency`) |

Display names are generic (**“Cash”**, not “Cash AFN”), but the books remain separate per currency. You identify them by the Currency column (؋ AFN, $ USD, …).

### 2.2 Why Chart of Accounts often shows only one Cash

The CoA list **defaults the currency filter to AFN**.  
Cash/Bank/Sarafi for USD/KDR **do exist**, but appear when you:

- set Currency filter to **All**, or  
- select **USD** / **KDR**.

This is filtering, not “only one cash account in the system.”

### 2.3 Posting account resolution

When posting a USD expense:

- **Expense** → resolve the single generic Expense GL for the branch (AFN chart row).  
- **Cash** → resolve **Cash USD** (currency-specific GL for USD).  

A USD expense must **never** credit Cash AFN.

---

## 3. Journal rules

### 3.1 Normal operational journals (sale, purchase, expense, normal payment)

Usually **one native currency** for the whole journal.

**Balance rule:**  
`sum(native debit) == sum(native credit)` in that currency.

AFN side must also balance:  
`sum(base_debit) == sum(base_credit)`.

### 3.2 Multi-currency journals (allowed only for special types)

Allowed for:

- Currency exchange  
- Realized FX on settlement  
- Period-end FX revaluation  
- Explicitly approved adjustments  

**Do NOT** require `sum(native debit) == sum(native credit)` across different currencies (meaningless).  

**Do** require the **AFN (functional) equation** to balance, including FX gain/loss lines.

### 3.3 Line constraints

- Debit ≥ 0, credit ≥ 0; not both positive on one line  
- Same for base_debit / base_credit  
- Exchange rate > 0; AFN rate = 1  

---

## 4. Exact behavior by case

### Case A — AFN expense (cash)

**Example:** Pay 5,000 AFN operating expense from Cash AFN.

| Line | Account | Currency | Debit | Credit | Rate | AFN Debit | AFN Credit |
|------|---------|----------|-------|--------|------|-----------|------------|
| 1 | Operating Expenses | AFN | 5,000 | — | 1 | 5,000 | — |
| 2 | Cash | AFN | — | 5,000 | 1 | — | 5,000 |

**Effects:**
- Cash AFN ↓ 5,000  
- Cash USD / KDR unchanged
- Expense recognized 5,000 AFN historically  

---

### Case B — USD expense (cash) — critical case

**Example:** Pay $50 USD expense; rate 87.20.

| Line | Account | Currency | Debit | Credit | Rate | AFN Debit | AFN Credit |
|------|---------|----------|-------|--------|------|-----------|------------|
| 1 | Operating Expenses | USD | 50 | — | 87.20 | 4,360 | — |
| 2 | Cash | USD | — | 50 | 87.20 | — | 4,360 |

**Effects:**
- **Cash USD** ↓ $50 only  
- **Cash AFN must NOT change**  
- P&L shows 4,360 AFN expense (historical conversion for reporting)  
- The 4,360 AFN is **not** a movement of Cash AFN  

This is the rule users often confuse: AFN on the line is **reporting equivalent**, not cash AFN.

---

### Case C — Sale in USD (AR / cash)

**Example:** Sale $100 USD on credit; rate 87.20.

The sale form accepts each unit price in the invoice currency; line prices and the
invoice total are stored in that currency, with the AFN equivalent snapshotted for reporting.

Typical pattern (simplified):

| Line | Account | Currency | Debit | Credit | AFN |
|------|---------|----------|-------|--------|-----|
| 1 | Accounts Receivable | USD | 100 | — | 8,720 |
| 2 | Sales Revenue | USD | — | 100 | 8,720 |

If cash sale instead of AR: Debit **Cash USD** 100, Credit Sales 100.

**Effects:**
- One generic AR / Sales account; line currency = USD  
- Cash only moves if payment method is cash in that currency’s cash book  

---

### Case D — Currency exchange (only way to move two cash books)

**Example:** Sell $100 USD to buy AFN at 87.20 → receive 8,720 AFN.

| Line | Account | Currency | Debit | Credit | Rate | AFN |
|------|---------|----------|-------|--------|------|-----|
| 1 | Cash | AFN | 8,720 | — | 1 | 8,720 |
| 2 | Cash | USD | — | 100 | 87.20 | 8,720 |

**Effects:**
- Cash AFN ↑ 8,720  
- Cash USD ↓ 100  
- Native totals differ by currency (OK)  
- AFN totals balance  

This is a **separate document type** (Currency Exchange), not a normal expense.

---

### Case E — Settlement with realized FX gain/loss

**Example:**
- Invoice booked: 1,000 USD at 87.20 → AR book value 87,200 AFN  
- Later payment: 1,000 USD received at cash rate 90.00 → cash AFN-equivalent 90,000  

Difference 2,800 AFN = **realized FX** (gain or loss depending on AR vs AP direction).

Pattern (conceptual):
- Clear AR at historical AFN  
- Receive Cash USD at settlement rate AFN equivalent  
- Difference → Realized FX Gain/Loss (P&L)

**Important:** Original invoice journal lines are **not rewritten**. Settlement posts a new journal.

---

### Case F — Period-end FX revaluation (unrealized)

**Applies to:** monetary items (cash, AR, AP, loans, etc.) in foreign currency.  

**Does NOT apply to:** inventory and other non-monetary items.

**Example:** Cash USD balance $10,000 booked at various historical rates; closing rate 90.

System posts an **additional** revaluation journal to Unrealized FX Gain/Loss so the Balance Sheet AFN valuation matches closing rate — **without** changing historical transaction rates on old lines.

---

### Case G — Inventory / non-monetary

Inventory stays at historical cost in reporting.  
**Do not revalue inventory** like cash at period end.

---

### Case H — Mixed-currency generic GL (e.g. Operating Expenses)

Generic Expense can have:
- Line 1: 50 USD  
- Line 2: 5,000 AFN  
- Line 3: 200 KDR

**UI / ledger rules:**
- Each line shows its own currency, rate, native debit/credit, AFN debit/credit  
- **Do not** sum native amounts across currencies into one “total”  
- For mixed accounts: summary cards and running balance use **AFN reporting totals**  
- For single-currency cash books (Cash USD): summary uses **native USD**, with AFN shown as equivalent  

---

## 5. Reporting distinction

| Concept | Meaning | When used |
|---------|---------|-----------|
| **Historical conversion** | Native × rate at transaction date, stored on the line | P&L recognition, journal detail |
| **Period-end valuation** | Monetary balances × closing rate via revaluation journal | Balance Sheet monetary items |
| **Cash AFN** | Actual AFN cash book | Only when AFN cash really moved |

Never present an AFN equivalent as if Cash AFN moved, unless Cash AFN was actually posted.

---

## 6. Double-entry validation summary

| Journal type | Native balance check | AFN balance check |
|--------------|----------------------|-------------------|
| Single-currency operational | Required | Required |
| Multi-currency (exchange / FX / reval) | Not across currencies | Required (incl. FX lines) |

---

## 7. Frontend display contract (what users see)

### Journal entry detail / lines table
Columns: GL Account | Currency | Debit | Credit | Exchange Rate | AFN Debit | AFN Credit | Description  

- Native amounts labeled with currency code  
- AFN columns = reporting equivalents  
- One totals block (not duplicated)  
- Mixed journals: show “Mixed” and emphasize AFN totals  

### GL account detail
- Cash USD: native USD running balance + AFN columns per line  
- Mixed generic GL: running balance / summary in AFN  

### Chart of Accounts list
- Currency column: symbol + code on one row (e.g. `$ USD`)  
- If lines on that account used multiple currencies: **Mixed** badge same row  
- Filter defaults to AFN; use **All** to see Cash USD / KDR

---

## 8. What we deliberately do NOT do

1. Create “Base Cash” / “Base Expense” duplicate ledgers  
2. Credit Cash AFN when paying a USD expense from Cash USD  
3. Recalculate old journals when today’s rate changes  
4. Treat AFN equivalent as physical Cash AFN  
5. Revalue inventory like foreign cash  
6. Require native debit = native credit across different currencies on FX journals  
7. Trust frontend-only branch filtering for security  

---

## 9. Questions for the reviewer (ChatGPT)

Please answer:

1. Is keeping **Cash/Bank/Sarafi per currency** and **one generic CoA per branch** (currency on the journal line) a sound design for a multi-currency SME ERP with AFN as functional currency?  
2. Is Case B (USD expense affecting only Cash USD, with AFN only as reporting equivalent) correct under standard multi-currency accounting?  
3. Is separating **historical rate on the line** vs **period-end revaluation journal** the right approach?  
4. Is it correct that **currency exchange** is the only normal operational way to move two cash books?  
5. Are the realized vs unrealized FX treatments (settlement vs revaluation) conceptually correct?  
6. Any flaws or missing edge cases (partial payments, multi-currency invoices, bank fees in third currency, etc.)?  
7. Any better alternative that still avoids a fake Base CoA and keeps real cash books separate?  

---

## 10. Short one-paragraph summary

This ERP uses AFN as the reporting currency. Real cash/bank/sarafi accounts exist once per currency per branch. All other GLs exist once per branch; transaction currency is stored on each journal line with an immutable historical rate and AFN equivalent. A USD cash expense hits Cash USD only; AFN figures on that journal are for reporting, not Cash AFN. Moving money between currencies requires a currency-exchange document. Settlements can post realized FX; period-end revaluation posts unrealized FX for monetary items only. Reports read journal lines, never invent Base accounts, and never rewrite history when rates change.

## Clarifications (post-audit hardening)

These points refine the design without changing the architecture:

1. **Currency exchange** may also post realized FX when the FC carrying AFN value differs from the deal AFN amount.
2. **AR/AP subledger** keeps balances by **party + currency + branch**. Overall AFN uses historical document `*_base` / `exchange_rate`, never today’s live rate.
3. **Posted auto / source-linked journals** cannot be silently edited or deleted. Correct via the source document or a reversing/adjustment journal.
4. **Manual journals** remain single-currency; multi-currency postings go through Currency Exchange / settlement FX / revaluation documents.
5. **P&L** uses historical line `base_*`; **Balance Sheet** monetary AFN includes period-end revaluation journals.
6. **Branch staff** are locked to their home branch server-side. HQ consolidated reports (no active branch) are intentional for admins only.

### Residual hardening applied

- Block PATCH/DELETE of automatic or source-linked journal entries
- Stamp / lock GL account branch on update; block currency/branch change when lines exist
- Reject journal lines whose GL belongs to another branch
- Scope activity logs by actor user’s branch for branch staff
- Stamp draft FX revaluation branch via `resolve_branch_for_write`
- Customer/vendor finance `overall` AFN from historical document bases
