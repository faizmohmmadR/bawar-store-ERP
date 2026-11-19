# Stock by selected packaging material

All packaging material selections are optional. New packing runs create independent outputs for the exact bottle, carton and plastic materials selected. When no bottle material is selected, the selected stock product supplies its bottle size and the filled count is calculated automatically; finished bottles retain liquid and incidental material costs in a product identified by tank and fill size, independent of customizable production names. No empty bottle stock is consumed. The product has a unique link to its raw material, and each product/condition has one stock balance. Repeated runs and manual inflows increase that same balance. Names and capacities do not identify stock: different material IDs remain separate even when their names or sizes match.

Stock quantities are counts of the selected material's unit. A run producing 80 bottles while consuming 10 cartons and 20 plastic packs adds 80 bottles, 10 cartons and 20 plastic packs. The stock list shows the raw material name, matching bottle capacity and package size. The filled bottle count still follows liquid mass/volume and bottle capacity; consumed extra bottles do not create additional filled bottles. Caps, labels and carton plastic remain recorded consumption rather than additional stock outputs.

To prevent duplicated valuation, carton and plastic outputs carry their own packaging cost. Bottle output carries liquid, bottle and the other consumed components. The output costs sum to the original run cost. Each output owns a separate lot and cost snapshot. Run totals retain the full production cost per bottle.

Packing edit/delete reverses all outputs atomically. Any output already sold or moved blocks reversal. Cumulative rounding prevents repeated small changes from accumulating rounding drift.

Stock > Add stock by material adds a manual inflow lot with AFN unit cost and optional expiry/notes. Bottle counts must be whole bottles; carton and plastic counts accept up to four decimal places to support fractional package balances. It reuses the material's product and stock row, and does not consume raw materials or tank contents. The stock list shows average AFN cost per bottle, carton or plastic pack, combining manual inflows and packing outputs. The endpoint requires add_stock permission. It is not a purchase and does not create vendor debt.

Migration 0007 adds the product link and traceable output table. Existing historical runs and their single combined inventory lots are retained so previously sold stock is not recast. Their legacy reversal remains supported. New runs, or edits to reversible old runs, use the new outputs.

Packing material/category selection does not require choosing a category first. Piece-based stock with no active purchase is offered using its saved AFN unit cost, including remaining stock whose material definition is archived. Kg stock is offered when it has a positive piece count. Packing uses the current moving weighted average, converting kg stock value to cost per piece; recorded source allocations support reversal.

Stock list valuation is now based on remaining lots. Each product/condition retains separate packing and manual inflow lots with their original unit costs. The displayed average is `sum(remaining quantity × lot unit cost) / sum(remaining quantity)`, including expired on-hand stock; availability is shown separately. The list exposes on-hand quantity, average cost per correct material unit, on-hand value, batch/cost counts and earliest expiry. The batch dialog lists source notes, remaining quantities and AFN/USD unit costs. Product and condition filters are enforced by the API.

Sales select physical lots in FEFO order, while their cost snapshot uses the moving weighted average of the product/condition pool at issue time. Each lot retains its original receipt price separately in `receipt_unit_cost`; its current `unit_cost` follows the pool average. Returns, manual inflows, write-offs, packing reversals and condition moves refresh the pool without changing earlier sale or adjustment cost snapshots. A later receipt blends with the remaining pool value rather than an old cached stock price. USD stock values remain current-rate reporting equivalents; the AFN pool cost is the inventory valuation source.


### Sales and returns after separate packaging stock

Material-linked stock is sold in its own unit: carton, plastic, or bottle. Bottle stock also supports kilograms when its mass/capacity is configured. A carton stock unit is one carton; it never consumes bottles or another packaging stock row. Legacy combined products retain their configured bottles per carton. Sales availability excludes expired lots.

Sales use FEFO allocations for physical traceability and save the pool's AFN issue cost on each allocation. Increasing a sale merges existing allocations; decreasing it recalculates the remaining sold cost. Partial returns record the exact allocation, quantity, and saved AFN issue cost. Repeated returns cannot exceed the original quantity; reducing/deleting a return removes stock from its recorded lots and is refused if those quantities are unavailable. Remove returns before changing sale quantities/status or reversing a sale.

The stock list displays the most recently received unit cost, including a depleted latest receipt. Inventory value continues to use the remaining quantities and original costs of all on-hand lots. Carton and plastic capacity is the bottle capacity multiplied by the package count.


### Editing a stock count

Stock edit accepts the full physical on-hand quantity, including expired lots and zero. Increasing adds a new manual lot. Decreasing creates manual-correction adjustments against on-hand batches in FEFO order, using each batch's original cost; sold quantities and sale allocations are retained. The correction updates inventory value and accounting through the adjustment journal. The edit form displays physical on-hand quantities; sales selectors continue to display sellable quantities only.

### Plastic purchases and packing

Plastic definitions default to kg, with an editable inventory unit. Bottles per plastic package is an optional positive whole capacity (for example, 3 bottles per plastic). Matching bottle weight is not required.

Kg purchase lines accept an optional whole piece count. To use kg plastic in packing, record its physical piece count as well as its weight. Packing selects from available pieces and accepts the actual whole pieces used; the initial plastic suggestion is `ceil(filled bottles / bottles per plastic)`. Users can override the suggested quantity, and that actual quantity controls consumption and cost. Without a configured capacity, enter plastic pieces manually. Leaving plastic blank creates no plastic consumption or output.

The packing cost per piece is remaining raw stock value divided by remaining pieces. For example, 10 kg at 100 AFN/kg with 200 pieces costs 5 AFN/piece. Using 20 pieces costs 100 AFN and consumes 1 kg, leaving 9 kg and 180 pieces. Edits and deletions restore the recorded quantities and costs through the existing reversal flow.

Full filled-package costs on packing forms and details use the section total (liquid, bottles and every selected packaging component) divided by filled bottle count, actual carton count or actual plastic count. These are alternative unit views of the same total, so they must not be added together. Omitted package types display no unit cost. Inventory output allocations continue to divide that total without duplicating value. Returned bottles with their own output retain their own carried cost and any selected new carton cost.

### Named finished products

Packing accepts `output_products`, with one choice per bottle/carton/plastic output (and `returned_carton` when separate). Each choice contains `product` or `product_name`. Raw material consumption remains on run components; output stock belongs to the chosen product, independently of consumed materials and production names. New products have an explicit `packaging_type` and no raw-material link. Existing material-linked products remain selectable in their matching type. Unspecified choices retain historical API behavior.

`stocks/output-products/?kind=bottle|carton|plastic` lists compatible existing products, including products with zero stock. `stocks/add-material/` accepts `packaging_type` plus `product` or `product_name`, quantity, AFN unit cost and optional expiry. Raw material is optional for named stock; older raw-material inflows continue to work. Bottle capacity in kg is optional on direct new products and is filled when packing first defines the size. Subsequent incompatible bottle sizes are rejected. Names are trimmed and case-insensitive lookup reuses an existing named product of the same type.

Direct inflows and packing receipts share the selected product/condition balance and weighted-average valuation. Bottle quantities remain whole bottles; carton/plastic direct balances may be fractional. Packing edit restores product choices from output records. Reversal removes only that run's output lots and restores its actual raw consumption. Named bottle products retain return/repacking support. Migration 0021 adds the product type and name/type uniqueness while leaving existing inventory and raw-material identities intact.

The packing form has no manual filled-bottle-count field. A selected bottle material or stock product must define the fill size; quantities that cannot fill a whole number of bottles are rejected. New named outputs use the selected bottle material size or a previously defined product size.

### Optional stock destinations in packing

The packing form requires at least one `output_products` entry (existing product or new name for bottle, carton, or plastic). Other destinations may stay blank. Passing `[]` via the API still saves no finished-stock products (rare unstocked runs). Omitting the key retains historical automatic material-linked outputs for older API clients. Raw materials and tank quantity are still consumed and their cost stays on the packing run.

Only selected named output types create named stock. With a bottle destination, omitted carton/plastic costs stay in the bottle output. Without a bottle destination, section value is apportioned across selected carton/plastic outputs by their material costs (quantity if all costs are zero), with the last row receiving the rounding remainder. Returned-bottle sections follow the same explicit-selection rule when destinations are provided. Editing restores previous destinations; clearing named destinations and saving without `output_products` recreates material-linked stock. Deleting an unstocked run restores consumed materials and returned-source balances/expiry without searching for an invented finished lot.
