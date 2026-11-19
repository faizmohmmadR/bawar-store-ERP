# Returned bottles and packing

Stock → Return to Pack moves filled bottles out of sellable stock into returned inventory. Enter only the bottle count. No packaging materials are consumed during the return.

There is one returned balance per bottle stock item. Repeated returns increase that existing balance, including after it has been fully used. Each receipt has a separate dated history event, preserving its quantity, saved cost, source references, notes and user. The returned list shows cumulative returned, packed and remaining counts, current value, expiry, first return date and latest return date. Return history shows each date/time and associated packing runs.

Packing → New Packing shows the storage source first, followed by the normal packaging-material rows, ending with Carton. The Carton plastic row is removed from the form.

A separate Returned for Packing section appears immediately after the normal carton row. Choose the returned bottle item, its bottle count, a carton material and the number of cartons to use. This section has no plastic, empty-bottle, cap or label inputs. Its carton quantity is suggested from the selected carton capacity and can be adjusted to the actual quantity used.

New bottles and returned bottles use independent packaging. Normal carton/plastic suggestions apply only to newly bottled tank liquid. The returned section consumes only its own carton quantity and deducts exactly the selected count from returned stock. Both sections may use the same carton material, and the combined raw-stock requirement is checked.

The returned section shows the carton unit cost, carton quantity × unit cost, carried bottle value and section total. The overall packing summary includes both normal packaging costs and the returned carton cost, plus the saved returned bottle value. Carton output carries its own cost, matching existing stock valuation, so the value is not counted twice.

A mixed run saves separate bottle and carton outputs for returned packing. This allows the returned section to select a different bottle item from the new production section without changing either item's identity or quantities. For example, 4 new bottles and 6 returned bottles produce separate outputs of 4 and 6 and deduct exactly 6 from the returned balance. Tank liquid and empty bottles apply only to the 4 newly filled bottles.

Returned bottles carry their saved inventory value forward. Additional returns update the remaining balance's weighted average. Reversing packing restores its original returned value and count, even if other returns have since arrived. Earliest expiry is preserved. Internal transfers under the existing Inventory GL account do not create opening-equity or expense entries.

Editing reverses the prior operation before applying its replacement in one transaction. Invalid quantities, insufficient materials and expired sources are rejected. Deleting an untouched packing run restores its returned count and materials; outputs already sold, moved or returned block reversal. Breakage for runs with returned bottles requires the original liquid/bottle provenance rather than assuming a single new bottle vendor.

Migration 0016 combines existing returns for the same stock item, preserves their individual dates and snapshots as history events, and reconnects packing runs to the combined balance. Legacy history-only returns remain historical and never increase physical inventory; a new actual return is needed to move those bottles from current stock.

Migration 0017 adds the independent returned carton and bottle output types. Existing packing history and older material types remain readable.

## Correcting a returned quantity

Use Edit on the Returned for Packing list. Enter the corrected cumulative total, including bottles already packed, and an optional correction reason. The form previews the resulting remaining count.

A reduction returns only unused bottles to finished stock at their saved returned-pool cost and expiry. An increase takes only the additional quantity from current finished stock. The total cannot be reduced below the number already packed; the relevant packing run must be reversed first. A zero total is supported when none have been packed.

Every actual quantity change saves a dated correction event with its signed change, previous/corrected totals, reason and user. Existing return receipts are retained. Stale totals and insufficient available stock reject the correction atomically. History-only entries can be corrected without moving stock.
