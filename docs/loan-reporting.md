# Loan reporting

The business performance report, dashboard, base summary, and per-currency report include a loan section. Each loan figure opens report history with the selected period and currency. Repayment history includes its payment account, reference, bill number, bill attachment, and a link to the repayment page.

- Principal given/received is the face value of loans recorded during the selected period. It includes opening balances and intermediary credit loans.
- Cash lent/borrowed excludes opening balances and loans linked to an intermediary payment. These records create debt without moving cash at origination.
- Collections on loans given and repayments on loans received use each repayment's payment date, including payments on older loans.
- Outstanding receivable/payable includes all active loans originated by the report end, even if originated before the report start. Only active repayments dated on or before the cutoff reduce principal. The start date does not limit outstanding balances.
- AFN activity uses stored transaction base amounts. AFN outstanding principal uses the remaining native principal multiplied by the loan's original booked AFN value per native unit, rounded per loan to two decimals. Repayment-date FX differences affect cash and realized FX, not the amount of principal extinguished. These operational principal balances do not incorporate later GL FX revaluations.
- Per-currency figures remain in native currency. Date-only cutoffs include the full business day in `REPORT_TIME_ZONE`. Deleted loans and repayments are excluded.
- Loan principal is financing; it is excluded from sales income and operating expenses. Existing accounting journals determine realized FX and profit.

No schema migration is required for these report changes.
