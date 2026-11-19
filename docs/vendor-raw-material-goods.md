# Raw-material goods issued to vendors

The raw-material sales form supports either a customer or a vendor. Selecting a vendor records a sale to that vendor; the form has no purchase-return operation selector. Existing purchase-return documents remain supported by the backend for historical compatibility:

- **Sale to vendor:** sell raw-stock materials (including bottles by piece). Recognize sales revenue and inventory cost.
- **Existing/API purchase return:** return raw-stock materials to the vendor at the agreed credit price. Reverse inventory at its saved moving-average cost, with any price difference recorded as stock-adjustment expense or other income. This does not create sales revenue.

Both operations use the existing raw-stock quantity, optional package-count and cost snapshot rules. Draft/cancelled documents do not issue inventory or create vendor credit. Free vendor sales issue goods as an expense and create no supplier credit; a purchase return must carry a value.

## Supplier settlement

The goods document funds supplier credit (debit 1320). A sale credits sales revenue and separately debits COGS/credits inventory. A return credits inventory, with any price variance balanced through expense/income.

The system applies available supplier credit to the vendor's oldest received purchase bills in the **same currency**, debiting accounts payable (2000) and crediting supplier advance (1320). It never creates a cash/bank/sarafi movement. Existing credit-application accounting records realized FX when a purchase and the credit have different historical exchange rates. Any unapplied amount remains supplier credit and can settle later purchases.

Funding and applications reuse the supplier-credit allocation engine. The generated funding record is linked one-to-one to its raw-goods source; it is excluded from standalone cash-payment editing/listing and cash-flow reports. Purchase payment history links applications back to the goods document. Vendor finance includes the goods credit once, without counting applications twice. Credit allocations and journals use the existing two-decimal settlement precision; inventory quantities and unit prices retain their existing precision.

Editing the goods quantity/value replaces its credit allocations. Cancelling/deleting restores inventory and releases the allocations, reopening the affected purchase balances. The party cannot change after creation. Bill cash receipts and customer sales returns are blocked for vendor goods; corrections use the original vendor document. Existing customer sales continue to use customer receivables and customer payments.

Purchase-return values are excluded from sales invoice totals in trade reports. Vendor sales are treated as settled through supplier credit, with no customer receivable; their revenue/COGS remain in profit and loss. Cash reports exclude goods-funded credit.

## Checks

`manage.py test api.tests.test_vendor_raw_material_sales api.tests.test_free_transactions api.tests.test_raw_material_sales --settings=backend.test_settings --noinput`

`npm run test:trade` in frontend covers customer/free forms and vendor sale/return validation and payloads.

## Kilograms and pieces

Raw-material sales and vendor returns use kg/pieces buttons and one quantity input. Prices follow the selected unit. The form never asks for kg and pieces together. Selecting another unit clears the previous quantity and price; clicking the active unit keeps the entered values.

Automatic conversion uses the optional **Actual weight per piece (kg)** setting on raw-material add/edit. This is the weight of the raw item, not bottle fill capacity. Kg stock can also use its recorded kg / piece-count ratio. The alternate unit is disabled when neither conversion basis is available.

Piece-based stock sold in kg is converted to whole pieces using the saved weight. Quantities that represent fractional pieces are rejected. Kg stock sold in pieces is reduced by its converted weight and, where tracked, its piece count. Native-unit sales reduce their native quantity normally. Existing measured-count API clients remain supported, but the sales form no longer uses that second quantity input.

Edits and returns retain the original saved physical conversion and cost. Existing saved kg/liter quantity fields hold physical snapshots. The optional raw-material weight is added by migration 0025.
