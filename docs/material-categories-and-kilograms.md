# Raw material categories and kilogram workflows

Bottle, bottle-with-cap and plastic definitions use a reusable category. Migration
0020 creates A through G; the Add button next to the category selector creates H
or any other category without changing code. Select material type, category, then
enter the material name and other information. Migration 0022 assigns existing definitions without a category to the explicit
Uncategorized category for review. Migration 0023 then assigns those legacy
materials to existing category A, as requested; it preserves other category
assignments. API validation and a database constraint require
a category for every bottle, bottle-with-cap and plastic material. Existing A–G
assignments remain unchanged.

Purchase lines can be filtered by category. A purchase still stores the specific
material, and stock is kept separately for each material. Stock lists show and
filter both material type and category. Packing has independent category filters
for bottles and plastic, followed by material and purchase-lot selection. The
bottle capacity determines bottle count; plastic and carton capacities do not
need to match the bottle or each other. Package counts and inventory availability
are still checked.

Production uses kg for output, water and transfers. Ingredients stocked in kg can
be entered in kg or g: 1,000 g = 1 kg. The server converts before checking stock,
allocating purchase lots and calculating costs. Inventory quantities retain four
decimal places in kg (0.1 g). Editing and deletion restore the canonical kg amount.
Materials stocked in pieces retain their configured piece unit.

Storage tank capacity is stored in kg, independently of the density of its current
contents. Transfers are checked against produced kg and available tank kg.
Packing entry, balances and movement displays use kg as well. Exact entered kg
are retained for packing and its reversal.

Migration 0021 copies historical water values to kg using the existing water
basis of 1 kg/L and snapshots tank capacity as its previous liter capacity times
its configured density. Existing liter fields and density snapshots remain as
internal compatibility fields for historical inventory, costing, sales and
returns. They are no longer entered or displayed in production and storage.
Existing bottle definitions with volume sizes remain supported in packing; their
kg equivalent uses the selected tank's density.

Apply with `python manage.py migrate`. The migrations preserve historical
materials, purchases, production and packing records.


The raw material stock list includes Add Stock. It opens the purchase-item form
with received status fixed, then returns to stock after saving. This creates a
received purchase with its vendor, date, currency, material, quantity, optional
package count and unit price; it uses the existing accounting and inventory
workflow rather than creating stock without a purchase cost layer.
