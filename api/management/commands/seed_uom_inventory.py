"""Seed UOM categories/units, Main warehouse, and demo supermarket products."""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from api.models.data.product_packaging import ProductPackaging, ProductPrice
from api.models.data.products import Product, ProductCategory
from api.models.data.uom import UnitCategory, UnitOfMeasure
from api.models.data.warehouse import Warehouse
from api.services.default_permissions import initialize_default_permissions


class Command(BaseCommand):
    help = 'Seed units of measure, main warehouse, and demo products'

    @transaction.atomic
    def handle(self, *args, **options):
        initialize_default_permissions()
        cats = {}
        for code, name in [
            (UnitCategory.CODE_COUNT, 'Count'),
            (UnitCategory.CODE_WEIGHT, 'Weight'),
            (UnitCategory.CODE_VOLUME, 'Volume'),
            (UnitCategory.CODE_LENGTH, 'Length'),
            (UnitCategory.CODE_OTHER, 'Other'),
        ]:
            cats[code], _ = UnitCategory.objects.get_or_create(code=code, defaults={'name': name})

        units = {}
        specs = [
            ('piece', 'Piece', 'pc', UnitCategory.CODE_COUNT, True, 1, 0),
            ('kg', 'Kilogram', 'kg', UnitCategory.CODE_WEIGHT, True, 1, 3),
            ('g', 'Gram', 'g', UnitCategory.CODE_WEIGHT, False, Decimal('0.001'), 0),
            ('L', 'Liter', 'L', UnitCategory.CODE_VOLUME, True, 1, 3),
            ('ml', 'Milliliter', 'ml', UnitCategory.CODE_VOLUME, False, Decimal('0.001'), 0),
            ('m', 'Meter', 'm', UnitCategory.CODE_LENGTH, True, 1, 3),
            ('cm', 'Centimeter', 'cm', UnitCategory.CODE_LENGTH, False, Decimal('0.01'), 0),
        ]
        for code, name, symbol, cat, is_ref, ratio, places in specs:
            units[code], _ = UnitOfMeasure.objects.update_or_create(
                code=code,
                defaults={
                    'name': name,
                    'symbol': symbol,
                    'category': cats[cat],
                    'is_category_reference': is_ref,
                    'ratio_to_reference': ratio,
                    'decimal_places': places,
                },
            )

        wh, _ = Warehouse.objects.get_or_create(
            code='MAIN',
            defaults={'name': 'Main Warehouse', 'is_default': True, 'is_active': True},
        )
        if not wh.is_default:
            wh.is_default = True
            wh.save(update_fields=['is_default'])

        grocery, _ = ProductCategory.objects.get_or_create(name='Grocery')

        # Mineral water: base bottle, carton of 12
        water, _ = Product.objects.update_or_create(
            sku='WATER-500',
            defaults={
                'name': 'Mineral Water 500ml',
                'base_uom': units['piece'],
                'category': grocery,
                'barcode': '1000001',
                'track_inventory': True,
                'is_active': True,
                'reorder_level': 24,
            },
        )
        bottle, _ = ProductPackaging.objects.update_or_create(
            product=water, name='Bottle',
            defaults={
                'uom': units['piece'], 'qty_in_base': 1, 'is_base': True,
                'for_purchase': True, 'for_sale': True, 'for_stock': True,
                'is_default_sale': True, 'barcode': '1000001',
            },
        )
        carton, _ = ProductPackaging.objects.update_or_create(
            product=water, name='Carton',
            defaults={
                'uom': units['piece'], 'qty_in_base': 12, 'is_base': False,
                'for_purchase': True, 'for_sale': True, 'for_stock': True,
                'is_default_purchase': True, 'barcode': '1000002',
            },
        )
        ProductPrice.objects.update_or_create(
            product=water, packaging=bottle, price_type=ProductPrice.PRICE_RETAIL, currency=1,
            defaults={'amount': Decimal('120'), 'is_active': True},
        )
        ProductPrice.objects.update_or_create(
            product=water, packaging=carton, price_type=ProductPrice.PRICE_RETAIL, currency=1,
            defaults={'amount': Decimal('1350'), 'is_active': True},
        )
        ProductPrice.objects.update_or_create(
            product=water, packaging=carton, price_type=ProductPrice.PRICE_PURCHASE, currency=1,
            defaults={'amount': Decimal('1200'), 'is_active': True},
        )
        water.default_purchase_packaging = carton
        water.default_sales_packaging = bottle
        water.save(update_fields=['default_purchase_packaging', 'default_sales_packaging'])

        # Rice: base gram, retail packet 1000g, sack 50000g
        rice, _ = Product.objects.update_or_create(
            sku='RICE-G',
            defaults={
                'name': 'Rice',
                'base_uom': units['g'],
                'category': grocery,
                'track_inventory': True,
                'is_active': True,
                'quantity_decimal_places': 0,
            },
        )
        rice_base, _ = ProductPackaging.objects.update_or_create(
            product=rice, name='Gram',
            defaults={
                'uom': units['g'], 'qty_in_base': 1, 'is_base': True,
                'for_purchase': True, 'for_sale': True, 'for_stock': True,
            },
        )
        ProductPackaging.objects.update_or_create(
            product=rice, name='Kilogram',
            defaults={
                'uom': units['kg'], 'qty_in_base': 1000, 'is_base': False,
                'for_purchase': True, 'for_sale': True, 'for_stock': True,
                'is_default_sale': True,
            },
        )
        ProductPackaging.objects.update_or_create(
            product=rice, name='Sack 50kg',
            defaults={
                'uom': units['kg'], 'qty_in_base': 50000, 'is_base': False,
                'for_purchase': True, 'for_sale': True, 'for_stock': True,
                'is_default_purchase': True, 'is_variable_weight': False,
            },
        )
        rice.default_purchase_packaging = rice.packagings.get(name='Sack 50kg')
        rice.default_sales_packaging = rice.packagings.get(name='Kilogram')
        rice.save(update_fields=['default_purchase_packaging', 'default_sales_packaging'])

        # Cooking oil: base ml
        oil, _ = Product.objects.update_or_create(
            sku='OIL-ML',
            defaults={
                'name': 'Cooking Oil',
                'base_uom': units['ml'],
                'category': grocery,
                'track_inventory': True,
                'is_active': True,
            },
        )
        ProductPackaging.objects.update_or_create(
            product=oil, name='Milliliter',
            defaults={
                'uom': units['ml'], 'qty_in_base': 1, 'is_base': True,
                'for_purchase': True, 'for_sale': True, 'for_stock': True,
            },
        )
        ProductPackaging.objects.update_or_create(
            product=oil, name='Liter',
            defaults={
                'uom': units['L'], 'qty_in_base': 1000, 'is_base': False,
                'for_purchase': True, 'for_sale': True, 'for_stock': True,
                'is_default_sale': True,
            },
        )
        ProductPackaging.objects.update_or_create(
            product=oil, name='Container 20L',
            defaults={
                'uom': units['L'], 'qty_in_base': 20000, 'is_base': False,
                'for_purchase': True, 'for_sale': True, 'for_stock': True,
                'is_default_purchase': True,
            },
        )

        self.stdout.write(self.style.SUCCESS(
            f'Seeded UOMs, warehouse {wh.code}, products: {water.name}, {rice.name}, {oil.name}'
        ))
