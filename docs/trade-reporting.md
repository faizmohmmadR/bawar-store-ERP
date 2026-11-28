# Sales, purchase, and expense reporting

The main business report and per-currency report show sales and received raw-material purchase bills independently of loans.

## Invoice settlement

The selected period chooses invoices by `sale_date` or `purchase_date`. Draft/cancelled sales and purchases are excluded; inventory purchases must be received to appear as purchase invoices. Each invoice's paid amount comes from its active `Payment` records linked by both content type and object id, up to the report end. Payments before the report start still settle a selected-period invoice; payments after the report end do not. Unpaid is the nonnegative remainder, calculated per invoice before summing. Paid + unpaid equals the invoice total.

Native amounts use the bill's currency. Consolidated AFN paid/unpaid allocations use the invoice's saved AFN-to-native value ratio, rounded to four decimals; actual payment-date FX cash values are shown separately. Returns dated in the period are displayed separately from gross invoice settlement totals.

## Payment-period cash

Cash received/paid in the selected period uses `payment_date` and stored payment amounts/base values, including payments on older or other bills. Payments are split between selected invoices and other invoices. Purchase prepayments on pending purchases are counted as cash payments, even though inventory has not yet been received. Deleted documents and payments are excluded. Legacy intermediary credit settles supplier bills but is separately identified as non-cash; its resulting loan is reported under financing.

Click total, paid, or unpaid to see matching invoices with their paid and remaining amounts. Click payment history to see payment-date cash records.

## Expenses and other information

Direct expense documents and salary payments are shown individually and as total operating payments. Expense categories remain visible. Advances, return refunds, owner withdrawals, and equipment acquisitions have their own cash-outflow breakdown. These cash movements and loan repayments are not treated as operating expenses merely because money left the business.

Sales/purchase payments, expenses, equipment cash acquisitions, advances, refunds, withdrawals, and loan cash movements contribute to cash flow. Production/packing inventory costs remain available as operational information and are not added again to cash expenses. Profit and P&L costs come from posted accounting journals in both consolidated AFN and currency reports, rather than deducting inventory purchases directly from revenue. Loans remain in a separate collapsed financing section.

No schema migration is required.
