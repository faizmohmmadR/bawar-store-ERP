# Product UOM & Inventory Engine

## What changed

This ERP was rebuilt from a detergent **production** starter into a **supermarket/trading** product system:

- Removed: raw materials, raw-material stock, production processes, storage tanks, packing runs, damaged packing flows
- Added: Unit of Measure engine, product packaging, warehouses, immutable stock movements, product purchases

## Core concepts

1. Every **Product** has one **base UOM** (piece, gram, ml, …).
2. **ProductPackaging** rows define purchase/sale units with `qty_in_base` (e.g. Carton = 12 bottles).
3. All inventory is stored and moved in **base units** via `StockMovement` + `InventoryBalance`.
4. Historical transactions snapshot `conversion_factor` so later packaging edits do not rewrite history.
5. Costing default is **AVCO** (weighted average) in AFN per base unit.

## Deploy / reset (fresh copy)

```bash
# from project root, with venv active
rm -f db.sqlite3
python manage.py migrate
python manage.py seed_uom_inventory
python manage.py shell -c "
from account.models import User
u, _ = User.objects.get_or_create(email='admin@local.test', defaults={'is_superuser':True,'is_staff':True})
u.is_superuser=u.is_staff=True
u.set_password('admin123'); u.save(); print(u.email)
"
```

Default seed includes Main warehouse, UOMs (piece/kg/g/L/ml/m/cm), and demo products (water, rice, oil).

## Key API endpoints

| Prefix | Purpose |
|--------|---------|
| `/api/unit-categories/` | Measurement categories |
| `/api/units-of-measure/` | Units |
| `/api/warehouses/` | Warehouses |
| `/api/products/` | Products (+ `packagings_data` on write) |
| `/api/purchases/` | Product purchases (receive posts stock) |
| `/api/inventory-balances/` | On-hand balances + packaging breakdown |
| `/api/stock-movements/` | Ledger (+ `adjust`, `transfer`, `open-package`, `resolve-barcode`) |
| `/api/sales/` | Sales with packaging lines (confirmed posts delivery) |

## Demo flow

1. Create/use **Mineral Water** (base = Bottle).
2. Packaging: Bottle=1, Carton=12; prices 120 / 1350 AFN.
3. Purchase 10 cartons @ 1200 → stock **120** bottles, unit cost **100**.
4. Sell 2 cartons + 5 bottles → stock **91**.
5. Check `/api/inventory-balances/` and `/api/stock-movements/`.

## Frontend apps

- **Products** → `/products`
- **Purchases** → `/purchases`
- **Stock** → `/stock` (balances)
- Production/raw-material launcher tiles removed

## Tests

```bash
python manage.py test api.tests.test_uom_inventory_engine --settings=backend.test_settings
```

Covers carton/bottle, nested packs, weight, variable weight, volume, AVCO/prices, package open, warehouse transfer, historical factor, incompatible UOM, concurrency.
