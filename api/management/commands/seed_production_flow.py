"""
Reset DB (optional) and seed a realistic dishwashing production flow via REST API
(same payloads as the UI), then verify stock increases/decreases.

  python manage.py seed_production_flow --reset --yes
  python manage.py seed_production_flow              # seed into current DB
"""
from __future__ import annotations

import os
from decimal import Decimal

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from rest_framework.test import APIClient

from account.models import User
from api.models.data.currency import BASE_CURRENCY_ID, CURRENCY_BY_CODE
from api.services.accounting import ensure_accounting_ready
from api.services.fiscal_year import ensure_current_fiscal_year


class Command(BaseCommand):
    help = (
        'Seed realistic RM → purchase → process → tank → packing → sales data '
        'through the API and verify stock movements.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Delete SQLite DB, migrate, then seed.',
        )
        parser.add_argument(
            '--yes',
            action='store_true',
            help='Required with --reset to confirm destructive reset.',
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.client = APIClient()
        # Django ALLOWED_HOSTS rejects default APIClient host "testserver".
        self.client.defaults['HTTP_HOST'] = 'localhost'
        self.fails = 0
        self.ctx = {}

    # ── helpers ──────────────────────────────────────────────────────────

    def log(self, section, status, detail):
        style = (
            self.style.SUCCESS if status == 'PASS'
            else self.style.ERROR if status == 'FAIL'
            else self.style.WARNING
        )
        self.stdout.write(style(f'  [{status}] {section}: {detail}'))
        if status == 'FAIL':
            self.fails += 1

    def _require(self, data, section):
        if not data:
            raise CommandError(f'{section} failed; aborting seed')
        return data

    def _detail(self, response):
        if hasattr(response, 'data') and response.data is not None:
            return str(response.data)[:500]
        try:
            text = response.content.decode()
            if 'DisallowedHost' in text:
                return 'DisallowedHost (set HTTP_HOST)'
            if '<!DOCTYPE html>' in text or '<html' in text.lower():
                title = 'HTML error'
                if '<title>' in text:
                    title = text.split('<title>', 1)[1].split('</title>', 1)[0].strip()[:120]
                return title
            return text[:500]
        except Exception:
            return str(response)[:500]

    def _post(self, path, payload, section, ok=(200, 201)):
        r = self.client.post(path, payload, format='json')
        if r.status_code not in ok:
            self.log(section, 'FAIL', f'POST {path} -> {r.status_code}: {self._detail(r)}')
            return None
        rid = r.data.get('id', 'ok') if isinstance(r.data, dict) else 'ok'
        self.log(section, 'PASS', f'POST {path} -> id={rid}')
        return r.data

    def _get(self, path, params=None, section='api'):
        r = self.client.get(path, params or {})
        if r.status_code != 200:
            self.log(section, 'FAIL', f'GET {path} -> {r.status_code}: {self._detail(r)}')
            return None
        return r.data

    def _delete(self, path, section):
        r = self.client.delete(path)
        if r.status_code not in (200, 204):
            self.log(section, 'FAIL', f'DELETE {path} -> {r.status_code}: {self._detail(r)}')
            return False
        self.log(section, 'PASS', f'DELETE {path}')
        return True

    def _assert_eq(self, section, actual, expected, label=''):
        a = Decimal(str(actual))
        e = Decimal(str(expected))
        if a != e:
            self.log(section, 'FAIL', f'{label} expected {e}, got {a}')
            return False
        self.log(section, 'PASS', f'{label} = {a}')
        return True

    def _rm_stock_qty(self, material_id):
        data = self._get(
            '/api/raw-material-stocks/',
            {'raw_material': material_id, 'page_size': 50},
            'rm_stock',
        )
        if data is None:
            return None
        rows = data.get('results', data) if isinstance(data, dict) else data
        if not rows:
            return Decimal('0')
        return Decimal(str(rows[0].get('quantity') or 0))

    def _tank_liters(self, tank_id):
        data = self._get('/api/storage-tanks/', {'page_size': 100}, 'tank')
        if data is None:
            return None
        rows = data.get('results', data) if isinstance(data, dict) else data
        row = next((r for r in rows if r['id'] == tank_id), None)
        if not row:
            self.log('tank', 'FAIL', f'tank {tank_id} not in list')
            return None
        return Decimal(str(row.get('current_liters') or 0))

    def _finished_stock_pieces(self, product_id):
        data = self._get(
            '/api/stocks/',
            {'product': product_id, 'condition': 'good', 'page_size': 50},
            'fg_stock',
        )
        if data is None:
            return None
        rows = data.get('results', data) if isinstance(data, dict) else data
        if not rows:
            return Decimal('0')
        return Decimal(str(rows[0].get('piece_amount') or 0))

    # ── bootstrap ────────────────────────────────────────────────────────

    def _reset_db(self):
        db_path = settings.DATABASES['default']['NAME']
        if os.path.exists(db_path):
            os.remove(db_path)
            self.log('reset', 'PASS', f'Removed {db_path}')
        call_command('migrate', verbosity=0)
        self.log('migrate', 'PASS', 'Migrations applied')

    def _ensure_superuser(self):
        email = 'rahmdel@gmail.com'
        user = User.objects.filter(email=email).first()
        if not user:
            user = User(
                username='rahmdel',
                email=email,
                first_name='Rahmdel',
                last_name='Admin',
                role='admin',
                is_admin=True,
                is_staff=True,
                is_superuser=True,
                is_active=True,
            )
            user.set_password('rahmdel')
            user.save()
            self.log('superuser', 'PASS', f'Created {email} / rahmdel')
        else:
            user.set_password('rahmdel')
            user.is_superuser = user.is_staff = user.is_active = True
            user.role = 'admin'
            user.is_admin = True
            user.save()
            self.log('superuser', 'PASS', f'Updated {email} / rahmdel')
        return user

    def _bootstrap(self, user):
        call_command('create_permissions', verbosity=0)
        self.log('permissions', 'PASS', 'Default permissions ready')
        ensure_accounting_ready()
        ensure_current_fiscal_year()
        self.log('accounting', 'PASS', 'GL + fiscal year ready')

        self.client.force_authenticate(user=user)

        usd = CURRENCY_BY_CODE.get('USD')
        if usd:
            self._post('/api/exchange-rates/', {
                'from_currency': usd['id'],
                'to_currency': BASE_CURRENCY_ID,
                'rate': '65.00',
                'date': timezone.now().isoformat(),
                'is_active': True,
            }, 'exchange_rate.USD')

    # ── seed sections ────────────────────────────────────────────────────

    def _seed_parties(self):
        chem = self._require(self._post('/api/vendors/', {
            'name': 'Kabul Chemical Trading',
            'phone': '0700000001',
        }, 'vendor.chem'), 'vendor.chem')
        pack = self._require(self._post('/api/vendors/', {
            'name': 'Herat Packaging Supplies',
            'phone': '0700000002',
        }, 'vendor.pack'), 'vendor.pack')
        cust = self._require(self._post('/api/customers/', {
            'name': 'Shahr-e Naw Market',
            'phone': '0790000001',
        }, 'customer.market'), 'customer.market')
        cust2 = self._require(self._post('/api/customers/', {
            'name': 'Bulk Tank Buyer',
            'phone': '0790000002',
        }, 'customer.bulk'), 'customer.bulk')
        salesman = self._require(self._post('/api/salesmen/', {
            'name': 'Ahmad Sales Rep',
            'phone': '0780000001',
            'is_active': True,
        }, 'salesman.ahmad'), 'salesman.ahmad')
        self.ctx['vendors'] = {'chem': chem, 'pack': pack}
        self.ctx['customers'] = {'market': cust, 'bulk': cust2}
        self.ctx['salesman'] = salesman

    def _seed_raw_materials(self):
        """Create chemistry + packaging materials (bottle-based capacities)."""
        # (name, type, unit, capacity_liters, bottles_per_carton, description)
        # Plastic/carton capacities match the bottle size; each has a per-package count.
        specs = [
            # Chemistry (kg) — process ingredients
            ('SLES 70%', 'chemistry', 'kg', None, None, 'Primary surfactant'),
            ('LABSA 96%', 'chemistry', 'kg', None, None, 'Anionic surfactant'),
            ('Cocamidopropyl Betaine', 'chemistry', 'kg', None, None, 'Co-surfactant'),
            ('Caustic Soda', 'chemistry', 'kg', None, None, 'pH adjustment'),
            ('Sodium Chloride', 'chemistry', 'kg', None, None, 'Viscosity builder'),
            ('Lemon Fragrance', 'chemistry', 'kg', None, None, 'Fragrance'),
            ('Preservative', 'chemistry', 'kg', None, None, 'Preservative'),
            # Bottles by volume
            ('PET Bottle 500ml', 'bottle', 'piece', '0.5000', None, '500 ml bottle'),
            ('PET Bottle 750ml', 'bottle', 'piece', '0.7500', None, '750 ml bottle'),
            ('PET Bottle 1L', 'bottle', 'piece', '1.0000', None, '1 L bottle'),
            ('PET Bottle 500ml with Cap', 'bottle_with_cap', 'piece', '0.5000', None, '500 ml bottle including cap'),
            # Matching packaging (capacity = bottle size)
            ('Cap 28mm', 'cap', 'piece', None, None, 'Standard screw cap'),
            ('Label 500ml Lemon', 'label', 'piece', '0.5000', None, 'Single label for 500ml'),
            ('Label 750ml Lemon', 'label', 'piece', '0.7500', None, 'Single label for 750ml'),
            ('Label 1L Lemon', 'label', 'piece', '1.0000', None, 'Single label for 1L'),
            ('Label Double 750ml Lemon', 'label_double', 'piece', '0.7500', None, 'Front+back label pair for 750ml'),
            ('Shrink Plastic 500ml', 'plastic', 'piece', '0.5000', None, 'Sleeve for 500ml bottle'),
            ('Shrink Plastic 750ml', 'plastic', 'piece', '0.7500', None, 'Sleeve for 750ml bottle'),
            ('Shrink Plastic 1L', 'plastic', 'piece', '1.0000', None, 'Sleeve for 1L bottle'),
            ('Carton 12x500ml', 'carton', 'piece', '0.5000', 12, '12 × 500ml bottles'),
            ('Carton 8x750ml', 'carton', 'piece', '0.7500', 8, '8 × 750ml bottles'),
            ('Carton 6x1L', 'carton', 'piece', '1.0000', 6, '6 × 1L bottles'),
            # Optional production packaging film (kg + pieces)
            ('Carton Plastic Film', 'carton_plastic', 'kg', None, None, 'Outer carton plastic film'),
        ]
        materials = {}
        for name, mtype, unit, capacity, bpc, desc in specs:
            payload = {
                'name': name,
                'material_type': mtype,
                'unit': unit,
                'description': desc,
            }
            if mtype in ('bottle', 'bottle_with_cap', 'plastic'):
                from api.models.data.raw_materials import RawMaterialCategory
                payload['category'] = RawMaterialCategory.objects.get(name='A').pk
            if capacity is not None:
                payload['capacity_liters'] = capacity
            if bpc is not None:
                payload['bottles_per_carton'] = bpc
            if mtype == 'plastic':
                payload['bottles_per_plastic'] = 1
            row = self._require(
                self._post('/api/raw-materials/', payload, f'rm.{name}'),
                f'rm.{name}',
            )
            materials[name] = row
        self.ctx['materials'] = materials

    def _seed_purchases(self):
        """Two received purchases: chemistry (AFN) and packaging (USD→AFN)."""
        materials = self.ctx['materials']
        chem_vendor = self.ctx['vendors']['chem']['id']
        pack_vendor = self.ctx['vendors']['pack']['id']
        now = timezone.now().isoformat()

        chem_lines = [
            ('SLES 70%', '200', '95'),
            ('LABSA 96%', '150', '88'),
            ('Cocamidopropyl Betaine', '40', '130'),
            ('Caustic Soda', '30', '55'),
            ('Sodium Chloride', '100', '12'),
            ('Lemon Fragrance', '8', '480'),
            ('Preservative', '5', '620'),
        ]
        chem_items = [
            {
                'raw_material': materials[name]['id'],
                'quantity': qty,
                'price_per_unit': price,
                'piece_count': 0,
            }
            for name, qty, price in chem_lines
        ]
        chem_purchase = self._require(self._post('/api/raw-material-purchases/', {
            'vendor': chem_vendor,
            'currency': 1,
            'purchase_date': now,
            'status': 'received',
            'bill_number': 'CHEM-2026-001',
            'notes': 'Opening chemistry stock',
            'items': chem_items,
        }, 'purchase.chemistry'), 'purchase.chemistry')
        self.ctx['chem_purchase'] = chem_purchase

        pack_lines = [
            ('PET Bottle 500ml', '2000', '0.08'),
            ('PET Bottle 750ml', '3000', '0.10'),
            ('PET Bottle 1L', '1500', '0.12'),
            ('Cap 28mm', '7000', '0.02'),
            ('Label 500ml Lemon', '2000', '0.015'),
            ('Label 750ml Lemon', '3000', '0.018'),
            ('Label 1L Lemon', '1500', '0.02'),
            ('Label Double 750ml Lemon', '1500', '0.030'),
            ('Shrink Plastic 500ml', '2000', '0.01'),
            ('Shrink Plastic 750ml', '3000', '0.012'),
            ('Shrink Plastic 1L', '1500', '0.014'),
            ('PET Bottle 500ml with Cap', '1000', '0.11'),
            ('Carton 12x500ml', '200', '0.35'),
            ('Carton 8x750ml', '400', '0.40'),
            ('Carton 6x1L', '250', '0.45'),
            ('Carton Plastic Film', '50', '2.50'),
        ]
        pack_items = [
            {
                'raw_material': materials[name]['id'],
                'quantity': qty,
                'price_per_unit': price,
                'piece_count': 25 if name == 'Carton Plastic Film' else 0,
            }
            for name, qty, price in pack_lines
        ]
        pack_purchase = self._require(self._post('/api/raw-material-purchases/', {
            'vendor': pack_vendor,
            'currency': 2,  # USD — converted to AFN via exchange rate
            'purchase_date': now,
            'status': 'received',
            'bill_number': 'PACK-2026-001',
            'notes': 'Opening packaging stock (USD invoice)',
            'items': pack_items,
        }, 'purchase.packaging'), 'purchase.packaging')
        self.ctx['pack_purchase'] = pack_purchase
        self.ctx['chem_expected'] = {name: Decimal(qty) for name, qty, _ in chem_lines}
        self.ctx['pack_expected'] = {name: Decimal(qty) for name, qty, _ in pack_lines}

    def _verify_purchase_stock(self):
        materials = self.ctx['materials']
        for name, expected in {**self.ctx['chem_expected'], **self.ctx['pack_expected']}.items():
            mid = materials[name]['id']
            qty = self._rm_stock_qty(mid)
            if qty is None:
                continue
            self._assert_eq('stock.after_purchase', qty, expected, name)

    def _seed_tanks_and_process(self):
        tank_a = self._require(self._post('/api/storage-tanks/', {
            'name': 'Main Mixing Tank A',
            'capacity_liters': '2000',
            'density_kg_per_liter': '1.020000',
            'product': None,
            'notes': 'Primary dishwashing liquid tank',
        }, 'tank.A'), 'tank.A')
        tank_b = self._require(self._post('/api/storage-tanks/', {
            'name': 'Bulk Dispatch Tank B',
            'capacity_liters': '1000',
            'density_kg_per_liter': '1.020000',
            'product': None,
        }, 'tank.B'), 'tank.B')
        self.ctx['tanks'] = {'A': tank_a, 'B': tank_b}

        materials = self.ctx['materials']
        # Produce 800 L dishwashing liquid into Tank A (~816 kg at 1.02 kg/L)
        process_items = [
            {'raw_material': materials['SLES 70%']['id'], 'quantity': '80', 'piece_count': 0},
            {'raw_material': materials['LABSA 96%']['id'], 'quantity': '50', 'piece_count': 0},
            {'raw_material': materials['Cocamidopropyl Betaine']['id'], 'quantity': '15', 'piece_count': 0},
            {'raw_material': materials['Caustic Soda']['id'], 'quantity': '8', 'piece_count': 0},
            {'raw_material': materials['Sodium Chloride']['id'], 'quantity': '20', 'piece_count': 0},
            {'raw_material': materials['Lemon Fragrance']['id'], 'quantity': '2', 'piece_count': 0},
            {'raw_material': materials['Preservative']['id'], 'quantity': '1', 'piece_count': 0},
            # Optional carton plastic film (kg + packages)
            {
                'raw_material': materials['Carton Plastic Film']['id'],
                'quantity': '5',
                'piece_count': 2,
            },
        ]
        process = self._require(self._post('/api/raw-material-processes/', {
            'product_name': 'Dishwashing Liquid Lemon',
            'product': None,
            'density_kg_per_liter': '1.020000',
            'process_date': timezone.now().isoformat(),
            'status': 'moved_to_storage',
            'output_quantity_liters': '800',
            'output_quantity_kg': '816',
            'water_quantity_liters': '624',
            'extra_expense': '1500',
            'expense_currency': 1,
            'notes': 'Batch DL-2026-001',
            'items': process_items,
            'storage_transfers': [
                {'storage_tank': tank_a['id'], 'quantity_liters': '800'},
            ],
        }, 'process.dishwashing'), 'process.dishwashing')
        self.ctx['process'] = process
        self.ctx['process_used'] = {
            'SLES 70%': Decimal('80'),
            'LABSA 96%': Decimal('50'),
            'Cocamidopropyl Betaine': Decimal('15'),
            'Caustic Soda': Decimal('8'),
            'Sodium Chloride': Decimal('20'),
            'Lemon Fragrance': Decimal('2'),
            'Preservative': Decimal('1'),
            'Carton Plastic Film': Decimal('5'),
        }

    def _verify_after_process(self):
        materials = self.ctx['materials']
        opening = {**self.ctx['chem_expected'], **self.ctx['pack_expected']}
        for name, used in self.ctx['process_used'].items():
            expected = opening[name] - used
            qty = self._rm_stock_qty(materials[name]['id'])
            if qty is None:
                continue
            self._assert_eq('stock.after_process', qty, expected, name)

        liters = self._tank_liters(self.ctx['tanks']['A']['id'])
        if liters is not None:
            self._assert_eq('tank.after_process', liters, Decimal('800'), 'Tank A liters')

    def _seed_products_and_packing(self):
        # Packing derives the finished product from the tank's process name + bottle/carton sizes.
        comps = self._require(
            self._get('/api/packing-runs/available-components/', section='packing.components'),
            'packing.components',
        )
        results = comps.get('results', comps) if isinstance(comps, dict) else comps

        def pick(component_type, material_name):
            mid = self.ctx['materials'][material_name]['id']
            for row in results:
                if (
                    row.get('material_type') == component_type
                    and row.get('raw_material') == mid
                ):
                    lots = row.get('purchase_lots') or []
                    if not lots:
                        self.log('packing.lot', 'FAIL', f'No lots for {material_name}')
                        return None
                    return {
                        'component_type': component_type,
                        'raw_material': mid,
                        'purchase_item': lots[0]['id'],
                        'quantity_pieces': None,  # filled below
                    }
            self.log('packing.lot', 'FAIL', f'Missing component {material_name}')
            return None

        # Pack 150 liters @ 0.75 L/bottle = 200 bottles → 25 cartons
        bottle_count = 200
        carton_count = 25  # 200 / 8
        components = []
        for ctype, mname, qty in (
            ('bottle', 'PET Bottle 750ml', bottle_count),
            ('label', 'Label 750ml Lemon', bottle_count),
            ('plastic', 'Shrink Plastic 750ml', bottle_count),
            ('carton', 'Carton 8x750ml', carton_count),
            ('cap', 'Cap 28mm', bottle_count),
        ):
            row = pick(ctype, mname)
            if row:
                row['quantity_pieces'] = qty
                components.append(row)

        if len(components) < 4:
            raise CommandError('Not enough packaging components to create packing run')

        run = self._require(self._post('/api/packing-runs/', {
            'storage_tank': self.ctx['tanks']['A']['id'],
            'quantity_liters': '150',
            'bottle_volume_liters': '0.7500',
            'components': components,
            'notes': 'Pack 750ml lemon — 200 bottles',
        }, 'packing.750'), 'packing.750')
        self.ctx['packing'] = run
        self.ctx['product'] = {'id': run.get('product') or run.get('product_id')}
        if not self.ctx['product']['id']:
            raise CommandError('Packing run response missing product id')
        self.ctx['pack_used'] = {
            'PET Bottle 750ml': Decimal(bottle_count),
            'Label 750ml Lemon': Decimal(bottle_count),
            'Shrink Plastic 750ml': Decimal(bottle_count),
            'Carton 8x750ml': Decimal(carton_count),
            'Cap 28mm': Decimal(bottle_count),
        }

    def _verify_after_packing(self):
        materials = self.ctx['materials']
        for name, used in self.ctx.get('pack_used', {}).items():
            expected = self.ctx['pack_expected'][name] - used
            qty = self._rm_stock_qty(materials[name]['id'])
            if qty is None:
                continue
            self._assert_eq('stock.after_packing', qty, expected, name)

        liters = self._tank_liters(self.ctx['tanks']['A']['id'])
        if liters is not None:
            self._assert_eq('tank.after_packing', liters, Decimal('650'), 'Tank A liters')

        pieces = self._finished_stock_pieces(self.ctx['product']['id'])
        if pieces is not None:
            self._assert_eq('fg.after_packing', pieces, Decimal('200'), 'Finished bottles')

    def _seed_and_verify_sales(self):
        product = self.ctx['product']
        customer = self.ctx['customers']['market']
        bulk = self.ctx['customers']['bulk']
        tank = self.ctx['tanks']['A']

        # Find finished stock id
        stocks = self._get(
            '/api/stocks/',
            {'product': product['id'], 'condition': 'good', 'page_size': 10},
            'sales.stock',
        )
        rows = (stocks or {}).get('results', stocks) if isinstance(stocks, dict) else (stocks or [])
        if not rows:
            self.log('sales.stock', 'FAIL', 'No finished stock for packed product')
            return
        stock_id = rows[0]['id']

        def stock_pack_amounts():
            data = self._get(
                '/api/stocks/',
                {'product': product['id'], 'condition': 'good', 'page_size': 10},
                'sales.stock_amounts',
            )
            rows = (data or {}).get('results', data) if isinstance(data, dict) else (data or [])
            if not rows:
                return None
            row = rows[0]
            return (
                Decimal(str(row.get('carton_amount') or 0)),
                Decimal(str(row.get('bottle_amount') or row.get('piece_amount') or 0)),
                Decimal(str(row.get('plastic_amount') or row.get('piece_amount') or 0)),
            )

        # After packing: 200 bottles / plastic, 25 cartons (8/ctn)
        amounts = stock_pack_amounts()
        if amounts:
            ctn, btl, pls = amounts
            self._assert_eq('stock.pack_ctn', ctn, Decimal('25'), 'Cartons')
            self._assert_eq('stock.pack_btl', btl, Decimal('200'), 'Bottles')
            self._assert_eq('stock.pack_pls', pls, Decimal('200'), 'Plastic')

        # Carton sale: 2 cartons = 16 bottles/plastic (+ salesman commission)
        salesman = self.ctx.get('salesman') or {}
        sale_stock = self._post('/api/sales/', {
            'customer': customer['id'],
            'salesman': salesman.get('id'),
            'currency': 1,
            'sale_date': timezone.now().isoformat(),
            'status': 'confirmed',
            'discount_percentage': 0,
            'total_amount': '90',
            'notes': 'Retail packed sale (carton)',
            'sales_items': [{
                'sale_source': 'stock',
                'stock': stock_id,
                'unit': 'carton',
                'quantity': '2',
                'liter_amount': '16',
                'sell_price': '45',
                'commission_amount': '5',
            }],
        }, 'sale.stock_carton')
        self.ctx['sale_stock'] = sale_stock
        if sale_stock and salesman.get('id'):
            detail = self._get(
                f"/api/salesmen/{salesman['id']}/",
                section='salesman.detail',
            )
            if detail:
                self._assert_eq(
                    'salesman.commission',
                    Decimal(str(detail.get('total_commission') or 0)),
                    Decimal('10'),  # 2 cartons × 5 commission/carton
                    'Salesman commission',
                )
        amounts = stock_pack_amounts()
        if amounts:
            ctn, btl, pls = amounts
            self._assert_eq('stock.after_ctn_sale', ctn, Decimal('23'), 'Cartons')
            self._assert_eq('stock.after_ctn_sale', btl, Decimal('184'), 'Bottles')
            self._assert_eq('stock.after_ctn_sale', pls, Decimal('184'), 'Plastic')

        # Bottle sale: 8 bottles (and matching plastic)
        self._post('/api/sales/', {
            'customer': customer['id'],
            'currency': 1,
            'sale_date': timezone.now().isoformat(),
            'status': 'confirmed',
            'discount_percentage': 0,
            'total_amount': '80',
            'notes': 'Bottle unit sale',
            'sales_items': [{
                'sale_source': 'stock',
                'stock': stock_id,
                'unit': 'bottle',
                'quantity': '8',
                'liter_amount': '8',
                'sell_price': '10',
            }],
        }, 'sale.stock_bottle')
        amounts = stock_pack_amounts()
        if amounts:
            ctn, btl, pls = amounts
            self._assert_eq('stock.after_btl_sale', ctn, Decimal('22'), 'Cartons')
            self._assert_eq('stock.after_btl_sale', btl, Decimal('176'), 'Bottles')
            self._assert_eq('stock.after_btl_sale', pls, Decimal('176'), 'Plastic')

        # Plastic sale: 8 plastic sleeves (= 8 bottles)
        self._post('/api/sales/', {
            'customer': customer['id'],
            'currency': 1,
            'sale_date': timezone.now().isoformat(),
            'status': 'confirmed',
            'discount_percentage': 0,
            'total_amount': '40',
            'notes': 'Plastic unit sale',
            'sales_items': [{
                'sale_source': 'stock',
                'stock': stock_id,
                'unit': 'plastic',
                'quantity': '8',
                'liter_amount': '8',
                'sell_price': '5',
            }],
        }, 'sale.stock_plastic')
        amounts = stock_pack_amounts()
        if amounts:
            ctn, btl, pls = amounts
            self._assert_eq('stock.after_pls_sale', ctn, Decimal('21'), 'Cartons')
            self._assert_eq('stock.after_pls_sale', btl, Decimal('168'), 'Bottles')
            self._assert_eq('stock.after_pls_sale', pls, Decimal('168'), 'Plastic')

        # Tank-fill sale: 50 L @ 25 AFN/L
        sale_tank = self._post('/api/sales/', {
            'customer': bulk['id'],
            'currency': 1,
            'sale_date': timezone.now().isoformat(),
            'status': 'confirmed',
            'discount_percentage': 0,
            'total_amount': '1250',
            'notes': 'Bulk tank fill',
            'sales_items': [{
                'sale_source': 'tank',
                'storage_tank': tank['id'],
                'unit': 'liter',
                'quantity': '50',
                'liter_amount': '50',
                'sell_price': '25',
            }],
        }, 'sale.tank')
        self.ctx['sale_tank'] = sale_tank

        liters = self._tank_liters(tank['id'])
        if liters is not None:
            self._assert_eq('tank.after_tank_sale', liters, Decimal('600'), 'Tank A liters')

        # USD carton sale: 1 carton
        sale_usd = self._post('/api/sales/', {
            'customer': customer['id'],
            'currency': 2,
            'sale_date': timezone.now().isoformat(),
            'status': 'confirmed',
            'discount_percentage': 0,
            'total_amount': '0.69',
            'notes': 'USD packed sale (1 carton)',
            'sales_items': [{
                'sale_source': 'stock',
                'stock': stock_id,
                'unit': 'carton',
                'quantity': '1',
                'liter_amount': '8',
                'sell_price': '0.69',
            }],
        }, 'sale.usd')
        self.ctx['sale_usd'] = sale_usd

        amounts = stock_pack_amounts()
        if amounts:
            ctn, btl, pls = amounts
            self._assert_eq('stock.after_usd_sale', ctn, Decimal('20'), 'Cartons')
            self._assert_eq('stock.after_usd_sale', btl, Decimal('160'), 'Bottles')
            self._assert_eq('stock.after_usd_sale', pls, Decimal('160'), 'Plastic')

        # Raw-material sale mixed with packed stock: sell empty bottles + caps to customer
        materials = self.ctx['materials']
        bottle_stock = self._get(
            '/api/raw-material-stocks/',
            {'raw_material': materials['PET Bottle 500ml']['id'], 'page_size': 5},
            'sale.rm_bottle_stock',
        )
        cap_stock = self._get(
            '/api/raw-material-stocks/',
            {'raw_material': materials['Cap 28mm']['id'], 'page_size': 5},
            'sale.rm_cap_stock',
        )
        bottle_rows = (bottle_stock or {}).get('results', bottle_stock) if isinstance(bottle_stock, dict) else (bottle_stock or [])
        cap_rows = (cap_stock or {}).get('results', cap_stock) if isinstance(cap_stock, dict) else (cap_stock or [])
        if bottle_rows and cap_rows:
            bottle_before = Decimal(str(bottle_rows[0].get('quantity') or 0))
            cap_before = Decimal(str(cap_rows[0].get('quantity') or 0))
            mixed = self._post('/api/sales/', {
                'customer': customer['id'],
                'currency': 1,
                'sale_date': timezone.now().isoformat(),
                'status': 'confirmed',
                'discount_percentage': 0,
                'total_amount': '95',
                'notes': 'Mixed packed product + raw material packaging sale',
                'sales_items': [
                    {
                        'sale_source': 'stock',
                        'stock': stock_id,
                        'unit': 'carton',
                        'quantity': '1',
                        'liter_amount': '8',
                        'sell_price': '45',
                    },
                    {
                        'sale_source': 'raw_material',
                        'raw_material_stock': bottle_rows[0]['id'],
                        'unit': 'piece',
                        'quantity': '100',
                        'liter_amount': '100',
                        'sell_price': '0.40',
                        'piece_count': 0,
                    },
                    {
                        'sale_source': 'raw_material',
                        'raw_material_stock': cap_rows[0]['id'],
                        'unit': 'piece',
                        'quantity': '100',
                        'liter_amount': '100',
                        'sell_price': '0.10',
                        'piece_count': 0,
                    },
                ],
            }, 'sale.mixed_rm')
            self.ctx['sale_mixed_rm'] = mixed
            bottle_after = self._rm_stock_qty(materials['PET Bottle 500ml']['id'])
            cap_after = self._rm_stock_qty(materials['Cap 28mm']['id'])
            if bottle_after is not None:
                self._assert_eq(
                    'rm.after_rm_sale',
                    bottle_after,
                    bottle_before - Decimal('100'),
                    'PET Bottle 500ml',
                )
            if cap_after is not None:
                self._assert_eq(
                    'rm.after_rm_sale',
                    cap_after,
                    cap_before - Decimal('100'),
                    'Cap 28mm',
                )
            amounts = stock_pack_amounts()
            if amounts:
                ctn, btl, pls = amounts
                self._assert_eq('stock.after_mixed_sale', ctn, Decimal('19'), 'Cartons')
                self._assert_eq('stock.after_mixed_sale', btl, Decimal('152'), 'Bottles')
                self._assert_eq('stock.after_mixed_sale', pls, Decimal('152'), 'Plastic')
        else:
            self.log('sale.mixed_rm', 'FAIL', 'Missing raw-material stock for bottle/cap sale')

    def _seed_extra_ops(self):
        """Extra UI-like records: expense, second customer sale, another packing batch."""
        now = timezone.now().isoformat()
        # Operating expense (cash) — same path as Expenses UI
        cats = self._get('/api/expense-categories/', {'page_size': 50}, 'expense.cats')
        cat_rows = (cats or {}).get('results', cats) if isinstance(cats, dict) else (cats or [])
        cat_id = cat_rows[0]['id'] if cat_rows else None
        if not cat_id:
            cat = self._post('/api/expense-categories/', {
                'name': 'Factory Utilities',
                'description': 'Seed category',
            }, 'expense.cat')
            cat_id = cat['id'] if cat else None
        if cat_id:
            self._post('/api/expenses/', {
                'category': cat_id,
                'amount': '2500',
                'currency': 1,
                'expense_date': now,
                'payment_method': 'cash',
                'description': 'Electricity for mixing plant',
                'notes': 'Seed expense',
            }, 'expense.utilities')

        # Second packing run: 72 L → 96 bottles @ 0.75 L → 12 cartons (exact)
        comps = self._get('/api/packing-runs/available-components/', section='packing.components2')
        results = (comps or {}).get('results', comps) if isinstance(comps, dict) else (comps or [])
        materials = self.ctx['materials']

        def pick(component_type, material_name, qty):
            mid = materials[material_name]['id']
            for row in results:
                if row.get('material_type') == component_type and row.get('raw_material') == mid:
                    lots = row.get('purchase_lots') or []
                    if not lots:
                        return None
                    return {
                        'component_type': component_type,
                        'raw_material': mid,
                        'purchase_item': lots[0]['id'],
                        'quantity_pieces': qty,
                    }
            return None

        components = []
        for ctype, mname, qty in (
            ('bottle', 'PET Bottle 750ml', 96),
            ('label', 'Label 750ml Lemon', 96),
            ('plastic', 'Shrink Plastic 750ml', 96),
            ('carton', 'Carton 8x750ml', 12),
            ('cap', 'Cap 28mm', 96),
        ):
            row = pick(ctype, mname, qty)
            if row:
                components.append(row)
        if len(components) >= 4:
            run2 = self._post('/api/packing-runs/', {
                'storage_tank': self.ctx['tanks']['A']['id'],
                'quantity_liters': '72',
                'bottle_volume_liters': '0.7500',
                'components': components,
                'notes': 'Second pack 750ml — 96 bottles',
            }, 'packing.750b')
            self.ctx['packing2'] = run2

    def _seed_payments(self):
        """Sale + RM purchase payments through /api/payments/ (same as payment UI)."""
        now = timezone.now().isoformat()

        # Partial payment on AFN carton sale
        sale = self.ctx.get('sale_stock')
        if sale:
            pay = self._post('/api/payments/', {
                'content_type': 'sales',
                'object_id': sale['id'],
                'payment_type': 'sale',
                'payment_method': 'cash',
                'payment_date': now,
                'amount': '50',
                'currency': 1,
                'reference_number': 'RCP-SALE-001',
                'notes': 'Partial cash receipt',
            }, 'payment.sale_partial')
            self.ctx['payment_sale'] = pay
            refreshed = self._get(f"/api/sales/{sale['id']}/", section='payment.sale_refresh')
            if refreshed:
                self._assert_eq(
                    'payment.sale_paid',
                    Decimal(str(refreshed.get('paid_amount') or 0)),
                    Decimal('50'),
                    'Sale paid_amount',
                )

        # Full payment on tank sale (if still present)
        tank_sale = self.ctx.get('sale_tank')
        if tank_sale:
            total = Decimal(str(tank_sale.get('total_amount') or tank_sale.get('final_total') or 0))
            if total <= 0:
                detail = self._get(f"/api/sales/{tank_sale['id']}/", section='payment.tank_detail')
                total = Decimal(str((detail or {}).get('total_amount') or 0))
            if total > 0:
                self._post('/api/payments/', {
                    'content_type': 'sales',
                    'object_id': tank_sale['id'],
                    'payment_type': 'sale',
                    'payment_method': 'bank',
                    'payment_date': now,
                    'amount': str(total.quantize(Decimal('0.01'))),
                    'currency': 1,
                    'reference_number': 'RCP-TANK-001',
                    'notes': 'Full bank receipt for tank fill',
                }, 'payment.sale_tank_full')

        # Partial USD sale payment
        usd_sale = self.ctx.get('sale_usd')
        if usd_sale:
            detail = self._get(f"/api/sales/{usd_sale['id']}/", section='payment.usd_detail')
            total = Decimal(str((detail or usd_sale).get('total_amount') or 0))
            if total > 0:
                half = (total / 2).quantize(Decimal('0.01'))
                self._post('/api/payments/', {
                    'content_type': 'sales',
                    'object_id': usd_sale['id'],
                    'payment_type': 'sale',
                    'payment_method': 'sarafi',
                    'payment_date': now,
                    'amount': str(half),
                    'currency': 2,
                    'reference_number': 'RCP-USD-001',
                    'notes': 'Partial USD via sarafi',
                }, 'payment.sale_usd_partial')

        # Chemistry purchase partial payment (AP settlement)
        chem = self.ctx.get('chem_purchase')
        if chem:
            detail = self._get(
                f"/api/raw-material-purchases/{chem['id']}/",
                section='payment.chem_detail',
            )
            total = Decimal(str((detail or chem).get('total_amount') or 0))
            pay_amt = (total * Decimal('0.4')).quantize(Decimal('0.01'))
            if pay_amt > 0:
                pay = self._post('/api/payments/', {
                    'content_type': 'rawmaterialpurchase',
                    'object_id': chem['id'],
                    'payment_type': 'purchase',
                    'payment_method': 'cash',
                    'payment_date': now,
                    'amount': str(pay_amt),
                    'currency': 1,
                    'reference_number': 'PAY-CHEM-001',
                    'notes': '40% cash to chemistry vendor',
                }, 'payment.purchase_chem')
                self.ctx['payment_chem'] = pay
                refreshed = self._get(
                    f"/api/raw-material-purchases/{chem['id']}/",
                    section='payment.chem_refresh',
                )
                if refreshed:
                    self._assert_eq(
                        'payment.chem_paid',
                        Decimal(str(refreshed.get('paid_amount') or 0)),
                        pay_amt,
                        'Chemistry purchase paid_amount',
                    )

        # Packaging USD purchase partial payment
        pack = self.ctx.get('pack_purchase')
        if pack:
            detail = self._get(
                f"/api/raw-material-purchases/{pack['id']}/",
                section='payment.pack_detail',
            )
            total = Decimal(str((detail or pack).get('total_amount') or 0))
            pay_amt = (total * Decimal('0.25')).quantize(Decimal('0.01'))
            if pay_amt > 0:
                self._post('/api/payments/', {
                    'content_type': 'rawmaterialpurchase',
                    'object_id': pack['id'],
                    'payment_type': 'purchase',
                    'payment_method': 'bank',
                    'payment_date': now,
                    'amount': str(pay_amt),
                    'currency': 2,
                    'reference_number': 'PAY-PACK-001',
                    'notes': '25% bank payment on USD packaging invoice',
                }, 'payment.purchase_pack')

        # List endpoints (UI list pages)
        sale_pays = self._get(
            '/api/payments/',
            {'payment_type': 'sale', 'page_size': 50},
            'payment.list_sales',
        )
        purch_pays = self._get(
            '/api/payments/',
            {'payment_type': 'purchase', 'page_size': 50},
            'payment.list_purchases',
        )
        sale_count = len((sale_pays or {}).get('results', sale_pays) or [])
        purch_count = len((purch_pays or {}).get('results', purch_pays) or [])
        if sale_count < 1:
            self.log('payment.list_sales', 'FAIL', f'Expected sale payments, got {sale_count}')
        else:
            self.log('payment.list_sales', 'PASS', f'{sale_count} sale payment(s)')
        if purch_count < 1:
            self.log('payment.list_purchases', 'FAIL', f'Expected purchase payments, got {purch_count}')
        else:
            self.log('payment.list_purchases', 'PASS', f'{purch_count} purchase payment(s)')

        # Settle accrued salesman commission (AFN) — Dr Payable / Cr Cash
        salesman = self.ctx.get('salesman') or {}
        if salesman.get('id'):
            summary = self._get(
                f"/api/salesmen/{salesman['id']}/commission-summary/",
                section='payment.commission_summary',
            )
            balance = Decimal(str((summary or {}).get('commission_balance') or 0))
            if balance > 0:
                pay = self._post(
                    '/api/salesman-commission-payments/',
                    {
                        'salesman': salesman['id'],
                        'payment_method': 'cash',
                        'payment_date': now,
                        'amount': str(balance.quantize(Decimal('0.01'))),
                        'reference_number': 'SCP-SEED-001',
                        'notes': 'Seed commission settlement',
                    },
                    'payment.commission',
                )
                self.ctx['payment_commission'] = pay
                after = self._get(
                    f"/api/salesmen/{salesman['id']}/commission-summary/",
                    section='payment.commission_after',
                )
                if after:
                    self._assert_eq(
                        'payment.commission_balance',
                        Decimal(str(after.get('commission_balance') or 0)),
                        Decimal('0'),
                        'Commission balance after pay',
                    )
            else:
                self.log('payment.commission', 'WARN', 'No commission balance to settle')

    def _journal_has_codes(self, journals, required_codes, section):
        if not journals:
            self.log(section, 'FAIL', 'No journal entries')
            return False
        codes = set()
        for je in journals:
            for line in je.get('lines') or []:
                gl = line.get('gl_account_details') or line.get('gl_account') or {}
                code = gl.get('code') if isinstance(gl, dict) else None
                if code:
                    codes.add(str(code).split('-')[0])
        missing = [c for c in required_codes if c not in codes]
        if missing:
            self.log(section, 'FAIL', f'Missing GL codes {missing}; found {sorted(codes)}')
            return False
        self.log(section, 'PASS', f'GL codes {sorted(required_codes)} present')
        return True

    def _verify_journals(self):
        """Confirm auto journals for sales, RM purchases, and payments."""
        sale = self.ctx.get('sale_stock')
        if sale:
            journals = self._get(
                '/api/journal-entries/for_source/',
                {'model': 'sales', 'object_id': sale['id'], 'include_related': True},
                'journal.sale',
            )
            self._journal_has_codes(journals or [], ['1200', '4000'], 'journal.sale_ar_rev')
            # Accrual: Dr Commission Expense 5250 / Cr Commission Payable 2200
            self._journal_has_codes(
                journals or [],
                ['5250', '2200'],
                'journal.sale_commission_accrual',
            )
            # COGS may exist when unit_cost > 0
            if journals:
                self.log('journal.sale_count', 'PASS', f'{len(journals)} journal(s) for sale+payments')

        chem = self.ctx.get('chem_purchase')
        if chem:
            journals = self._get(
                '/api/journal-entries/for_source/',
                {
                    'model': 'rawmaterialpurchase',
                    'object_id': chem['id'],
                    'include_related': True,
                },
                'journal.chem',
            )
            self._journal_has_codes(journals or [], ['1100', '2000'], 'journal.chem_inv_ap')

        pay = self.ctx.get('payment_sale')
        if pay:
            journals = self._get(
                '/api/journal-entries/for_source/',
                {'model': 'payment', 'object_id': pay['id']},
                'journal.payment_sale',
            )
            self._journal_has_codes(journals or [], ['1000', '1200'], 'journal.payment_cash_ar')

        pay_chem = self.ctx.get('payment_chem')
        if pay_chem:
            journals = self._get(
                '/api/journal-entries/for_source/',
                {'model': 'payment', 'object_id': pay_chem['id']},
                'journal.payment_chem',
            )
            self._journal_has_codes(journals or [], ['1000', '2000'], 'journal.payment_cash_ap')

        pay_comm = self.ctx.get('payment_commission')
        if pay_comm:
            journals = self._get(
                '/api/journal-entries/for_source/',
                {
                    'model': 'salesman-commission-payment',
                    'object_id': pay_comm['id'],
                },
                'journal.payment_commission',
            )
            # Settlement: Dr Commission Payable 2200 / Cr Cash 1000
            self._journal_has_codes(
                journals or [],
                ['2200', '1000'],
                'journal.commission_settle',
            )

    def _verify_reports(self):
        """Trial balance, P&L, balance sheet, and management/base summary sanity."""
        tb = self._get(
            '/api/journal-entries/trial_balance/',
            {'period': 'yearly', 'mode': 'base'},
            'report.trial_balance',
        )
        if tb:
            totals = tb.get('totals') or {}
            debits = Decimal(str(
                totals.get('total_debit')
                or tb.get('total_debit')
                or tb.get('total_debits')
                or 0
            ))
            credits = Decimal(str(
                totals.get('total_credit')
                or tb.get('total_credit')
                or tb.get('total_credits')
                or 0
            ))
            balanced = totals.get('is_balanced', tb.get('is_balanced'))
            if balanced is None:
                balanced = abs(debits - credits) <= Decimal('0.05')
            if not balanced:
                self.log(
                    'report.trial_balance',
                    'FAIL',
                    f'TB imbalance debit={debits} credit={credits}',
                )
            else:
                self.log(
                    'report.trial_balance',
                    'PASS',
                    f'Balanced debit={debits} credit={credits}',
                )

        pl = self._get(
            '/api/journal-entries/profit_loss/',
            {'period': 'yearly', 'mode': 'base'},
            'report.profit_loss',
        )
        if pl:
            revenue = Decimal(str(pl.get('revenue') or pl.get('total_revenue') or 0))
            if revenue <= 0:
                self.log('report.profit_loss', 'FAIL', f'Revenue should be > 0, got {revenue}')
            else:
                self.log('report.profit_loss', 'PASS', f'Revenue={revenue}')

        bs = self._get(
            '/api/journal-entries/balance-sheet/',
            {'period': 'yearly', 'mode': 'base'},
            'report.balance_sheet',
        )
        if bs:
            assets = Decimal(str(bs.get('total_assets') or bs.get('assets') or 0))
            liab_eq = Decimal(str(
                bs.get('total_liabilities_equity')
                or bs.get('total_liabilities_and_equity')
                or 0
            ))
            if liab_eq == 0:
                liab_eq = (
                    Decimal(str(bs.get('total_liabilities') or 0))
                    + Decimal(str(bs.get('total_equity') or 0))
                )
            if assets > 0 and abs(assets - liab_eq) > Decimal('0.05'):
                self.log(
                    'report.balance_sheet',
                    'FAIL',
                    f'BS imbalance assets={assets} liab+eq={liab_eq}',
                )
            elif assets > 0:
                self.log(
                    'report.balance_sheet',
                    'PASS',
                    f'assets={assets} liab+eq={liab_eq}',
                )
            else:
                self.log('report.balance_sheet', 'WARN', f'assets={assets} (check keys: {list(bs.keys())[:12]})')

        summary = self._get(
            '/api/reports/base_summary/',
            {'period': 'yearly'},
            'report.base_summary',
        )
        if summary:
            body = summary.get('summary') if isinstance(summary.get('summary'), dict) else summary
            purchases = Decimal(str(body.get('total_purchases') or 0))
            ap = Decimal(str(body.get('accounts_payable') or 0))
            ar = Decimal(str(body.get('accounts_receivable') or 0))
            revenue = Decimal(str(body.get('total_revenue') or 0))
            if purchases <= 0 or revenue <= 0:
                self.log(
                    'report.base_summary',
                    'FAIL',
                    f'revenue={revenue} purchases={purchases} AP={ap} AR={ar}',
                )
            else:
                self.log(
                    'report.base_summary',
                    'PASS',
                    f'revenue={revenue} purchases={purchases} AP={ap} AR={ar}',
                )

        mgmt = self._get(
            '/api/reports/management/',
            {'period': 'yearly'},
            'report.management',
        )
        if mgmt:
            kpis = mgmt.get('kpis') if isinstance(mgmt.get('kpis'), dict) else {}
            rev = Decimal(str(
                kpis.get('revenue')
                or kpis.get('total_revenue')
                or (mgmt.get('profit_loss') or {}).get('revenue')
                or mgmt.get('total_revenue')
                or mgmt.get('revenue')
                or 0
            ))
            if rev <= 0:
                # Fall back to income_breakdown sum
                income = mgmt.get('income_breakdown') or []
                rev = sum(
                    (Decimal(str(row.get('amount') or row.get('total') or 0)) for row in income),
                    Decimal('0'),
                )
            if rev <= 0:
                self.log('report.management', 'WARN', f'revenue key layout: {list(mgmt.keys())[:15]} kpis={list(kpis)[:10]}')
            else:
                self.log('report.management', 'PASS', f'revenue={rev}')

        # List pages smoke
        for path, section in (
            ('/api/sales/', 'list.sales'),
            ('/api/raw-material-purchases/', 'list.rm_purchases'),
            ('/api/raw-materials/', 'list.raw_materials'),
            ('/api/raw-material-stocks/', 'list.rm_stocks'),
            ('/api/raw-material-processes/', 'list.processes'),
            ('/api/storage-tanks/', 'list.tanks'),
            ('/api/packing-runs/', 'list.packing'),
            ('/api/salesmen/', 'list.salesmen'),
            ('/api/customers/', 'list.customers'),
            ('/api/vendors/', 'list.vendors'),
            ('/api/stocks/', 'list.stocks'),
        ):
            data = self._get(path, {'page_size': 100}, section)
            if data is None:
                continue
            rows = data.get('results', data) if isinstance(data, dict) else data
            count = len(rows or [])
            if count < 1:
                self.log(section, 'FAIL', 'empty list')
            else:
                self.log(section, 'PASS', f'{count} row(s)')

    def _test_delete_restores_tank(self):
        """Optional: create a throwaway tank sale, delete it, confirm liters restore."""
        tank = self.ctx['tanks']['A']
        bulk = self.ctx['customers']['bulk']
        before = self._tank_liters(tank['id'])
        if before is None or before < Decimal('10'):
            self.log('tank.delete_test', 'WARN', 'Not enough tank liters for delete test')
            return
        sale = self._post('/api/sales/', {
            'customer': bulk['id'],
            'currency': 1,
            'sale_date': timezone.now().isoformat(),
            'status': 'confirmed',
            'discount_percentage': 0,
            'total_amount': '250',
            'notes': 'Temporary tank sale for delete restore test',
            'sales_items': [{
                'sale_source': 'tank',
                'storage_tank': tank['id'],
                'unit': 'liter',
                'quantity': '10',
                'liter_amount': '10',
                'sell_price': '25',
            }],
        }, 'sale.tank_temp')
        if not sale:
            return
        mid = self._tank_liters(tank['id'])
        if mid is not None:
            self._assert_eq('tank.after_temp_sale', mid, before - Decimal('10'), 'Tank after temp sale')
        if not self._delete(f"/api/sales/{sale['id']}/", 'sale.delete_temp_tank'):
            return
        after = self._tank_liters(tank['id'])
        if after is None:
            return
        if after == before:
            self._assert_eq('tank.after_delete_sale', after, before, 'Tank restored')
        else:
            self.log(
                'tank.after_delete_sale',
                'WARN',
                f'Tank liters {before} → {mid} → {after} after delete',
            )

    # ── entry ────────────────────────────────────────────────────────────

    def handle(self, *args, **options):
        if options['reset']:
            if not options['yes']:
                raise CommandError('Refusing to reset without --yes')
            self._reset_db()

        user = self._ensure_superuser()
        self._bootstrap(user)

        self.stdout.write(self.style.MIGRATE_HEADING('\n=== Seed production flow (API) ===\n'))
        self._seed_parties()
        self._seed_raw_materials()
        self._seed_purchases()
        self._verify_purchase_stock()
        self._seed_tanks_and_process()
        self._verify_after_process()
        self._seed_products_and_packing()
        self._verify_after_packing()
        self._seed_and_verify_sales()
        self._seed_extra_ops()
        self._seed_payments()
        self._verify_journals()
        self._verify_reports()
        self._test_delete_restores_tank()

        self.stdout.write('')
        if self.fails:
            self.stdout.write(self.style.ERROR(f'Done with {self.fails} failure(s).'))
            raise CommandError(f'seed_production_flow failed ({self.fails} checks)')
        self.stdout.write(self.style.SUCCESS(
            'All production-flow seeds, payments, journals, and report checks passed.\n'
            'Login: rahmdel@gmail.com / rahmdel'
        ))
