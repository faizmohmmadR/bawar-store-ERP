# Free sales and raw-material purchases

Sales (finished stock, tank fills, or raw materials) and raw-material purchases have a Paid/Free transaction type. Existing invoices remain Paid. Free invoices still require a customer/vendor and valid item quantities; prices, discounts, commissions and invoice totals are zero. Free is separate from the stock/tank/raw-material source selector.

Confirmed free sales deduct inventory using the same quantity validation and saved inventory costs as paid sales. The journal debits expense 5220 (Free Goods Distribution) and credits inventory 1100. It creates no revenue or customer receivable. Inventory costs, including known zero costs, remain fixed when journals are refreshed. Sales returns restore inventory and reverse distribution expense, with no cash refund. A return in a later reporting period can produce a credit in distribution expense.

Received free purchases add quantities at zero acquisition cost and create no vendor payable or payment journal. When blended with existing stock, moving weighted average spreads the unchanged stock value over the larger quantity. A known zero-cost receipt remains usable in production, packing and raw-material sales. Later paid purchases blend their cost into remaining quantities normally. This records acquisition cost; it does not introduce an estimated fair value for donated goods.

Free invoices cannot receive bill payments. General customer/vendor payments remain available for advances. Reverse linked bill payments before changing an invoice to Free. Changing Free to Paid requires positive line prices; invoices with returns must have their returns removed before changes to type, items or status.

Trade summaries count free invoices separately from paid/partial/unpaid invoices. They contribute quantity and inventory movements but zero monetary purchase/sales totals. Distribution cost appears as an operating expense in ledger profit and loss. Sales detail quantities show the exact selected selling unit, rather than decomposing a quantity into cartons and loose bottles.

Checks: `npm run test:trade` in frontend; Django `api.tests.test_free_transactions` with `--settings=backend.test_settings --noinput`.
