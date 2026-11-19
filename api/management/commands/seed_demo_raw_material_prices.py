"""Explicitly fictional opening-stock costs for a test database."""
import csv
from decimal import Decimal, ROUND_HALF_UP

from django.core.management.base import BaseCommand
from django.db import transaction

from api.models.data.raw_materials import RawMaterialStock

DEMO_MARKER = '[TEST DATA: SAMPLE PRICE]'


def sample_unit_price(material):
    """Deterministic test values, not market estimates or supplier quotes."""
    name = material.name.casefold()
    kind = material.material_type
    if kind == 'chemistry':
        if any(word in name for word in ('خوشبویی', 'خوشبوي', 'fragrance', 'perfume')):
            price = Decimal('650')
        elif any(word in name for word in ('رنګ', 'رنگ', 'colour', 'color', 'dye')):
            price = Decimal('450')
        else:
            price = Decimal('150')
    elif kind in ('bottle', 'bottle_with_cap'):
        size = material.capacity_liters or material.capacity_kg or Decimal('1')
        price = Decimal('6') + Decimal('2') * Decimal(str(size))
        if kind == 'bottle_with_cap':
            price += Decimal('1')
    else:
        price = Decimal({
            'cap': '1', 'cap_label': '1.25', 'label': '0.75', 'label_double': '1.50',
            'plastic': '4', 'carton': '12', 'carton_plastic': '100',
            'boiler': '40', 'other': '50',
        }.get(kind, '50'))
    if material.unit == 'g':
        price /= Decimal('1000')
    return price.quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)


class Command(BaseCommand):
    help = 'TEST DATA ONLY: fill missing raw stock prices with explicitly fictional AFN costs.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Write sample prices; default only reports.')
        parser.add_argument('--report', help='Optional CSV audit of assigned sample costs.')

    @transaction.atomic
    def handle(self, *args, **options):
        stocks = RawMaterialStock.objects.filter(last_purchase_price__lte=0).select_related('raw_material').order_by('id')
        if options['apply']:
            stocks = stocks.select_for_update()
        rows = []
        for stock in stocks:
            price = sample_unit_price(stock.raw_material)
            rows.append({
                'raw_material_id': stock.raw_material_id,
                'raw_material_name': stock.raw_material.name,
                'unit': stock.raw_material.unit,
                'quantity': str(stock.quantity),
                'old_price_afn': str(stock.last_purchase_price),
                'sample_price_afn': str(price),
                'price_source': 'FICTIONAL TEST OPENING COST; NOT A PURCHASE',
            })
            if options['apply']:
                stock.last_purchase_price = price
                # No purchase date: this is an opening-stock sample cost.
                stock.save(update_fields=['last_purchase_price', 'updated_at'])
                material = stock.raw_material
                note = f'{DEMO_MARKER} Fictional opening cost {price} AFN/{material.unit}; not a supplier price.'
                material.description = '\n'.join(filter(None, [material.description, note]))
                material.save(update_fields=['description', 'updated_at'])
        if options.get('report'):
            with open(options['report'], 'w', encoding='utf-8-sig', newline='') as report:
                writer = csv.DictWriter(report, fieldnames=[
                    'raw_material_id', 'raw_material_name', 'unit', 'quantity',
                    'old_price_afn', 'sample_price_afn', 'price_source',
                ])
                writer.writeheader()
                writer.writerows(rows)
        self.stdout.write(f"TEST DATA: {'applied' if options['apply'] else 'dry run'} sample prices to {len(rows)} items; existing positive prices and stock quantities preserved.")
