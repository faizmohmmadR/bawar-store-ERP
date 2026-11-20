"""Register ERP models in Django admin."""
from django.contrib import admin

from api.admin.common import SoftDeleteModelAdmin
from api.models.data.customers import Customer
from api.models.data.fiscal_year import FiscalYear
from api.models.data.inventory_ledger import InventoryBalance, StockMovement
from api.models.data.product_packaging import ProductBarcode, ProductPackaging, ProductPrice
from api.models.data.products import Product, ProductCategory
from api.models.data.purchases import Purchase, PurchaseItem
from api.models.data.sales import Sales, SalesItems
from api.models.data.stock import Stock
from api.models.data.uom import UnitCategory, UnitOfMeasure
from api.models.data.vendors import Vendor
from api.models.data.warehouse import Warehouse


@admin.register(Customer)
class CustomerAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'name', 'phone', 'email', 'is_active')
    search_fields = ('name', 'phone', 'email')


@admin.register(Vendor)
class VendorAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'name', 'phone', 'email', 'is_active')
    search_fields = ('name', 'phone', 'email')


@admin.register(UnitCategory)
class UnitCategoryAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'code', 'name')


@admin.register(UnitOfMeasure)
class UnitOfMeasureAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'code', 'name', 'symbol', 'category', 'is_category_reference')
    list_filter = ('category',)
    search_fields = ('code', 'name', 'symbol')


@admin.register(Warehouse)
class WarehouseAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'code', 'name', 'is_default', 'is_active')


@admin.register(FiscalYear)
class FiscalYearAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'name', 'start_date', 'end_date', 'status', 'is_current')
    search_fields = ('name',)


@admin.register(ProductCategory)
class ProductCategoryAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'name')
    search_fields = ('name',)


class ProductPackagingInline(admin.TabularInline):
    model = ProductPackaging
    extra = 0


@admin.register(Product)
class ProductAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'name', 'sku', 'barcode', 'base_uom', 'is_active', 'average_cost')
    search_fields = ('name', 'sku', 'barcode')
    list_filter = ('is_active', 'costing_method', 'track_batch', 'track_expiry')
    autocomplete_fields = ('base_uom', 'category')
    inlines = [ProductPackagingInline]


@admin.register(ProductPackaging)
class ProductPackagingAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'product', 'name', 'qty_in_base', 'for_purchase', 'for_sale', 'is_active')
    search_fields = ('name', 'barcode', 'product__name')


@admin.register(ProductBarcode)
class ProductBarcodeAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'barcode', 'product', 'packaging', 'is_primary')


@admin.register(ProductPrice)
class ProductPriceAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'product', 'packaging', 'price_type', 'amount', 'currency', 'is_active')


@admin.register(Stock)
class StockAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'product', 'warehouse', 'condition', 'piece_amount', 'buy_price')
    list_filter = ('condition',)


@admin.register(InventoryBalance)
class InventoryBalanceAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'product', 'warehouse', 'quantity_on_hand', 'quantity_reserved', 'average_cost')


@admin.register(StockMovement)
class StockMovementAdmin(SoftDeleteModelAdmin):
    list_display = (
        'id', 'occurred_at', 'movement_type', 'product', 'warehouse',
        'base_quantity', 'transaction_quantity', 'conversion_factor',
    )
    list_filter = ('movement_type',)


class PurchaseItemInline(admin.TabularInline):
    model = PurchaseItem
    extra = 0


@admin.register(Purchase)
class PurchaseAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'invoice_number', 'vendor', 'warehouse', 'status', 'total_amount', 'currency')
    list_filter = ('status', 'currency')
    search_fields = ('invoice_number', 'bill_number', 'vendor__name')
    inlines = [PurchaseItemInline]


class SalesItemsInline(admin.TabularInline):
    model = SalesItems
    extra = 0


@admin.register(Sales)
class SalesAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'invoice_number', 'customer', 'status', 'total_amount', 'currency')
    list_filter = ('status', 'currency')
    search_fields = ('invoice_number',)
    inlines = [SalesItemsInline]
