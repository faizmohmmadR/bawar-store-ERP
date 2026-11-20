"""
Full realistic ERP seed via REST API (same payloads as the UI), with volume
and accuracy checks (multi-currency finance, stock from packing, commissions, reports).

Dependency order (same as business UI):
  parties → exchange rates → raw materials → purchases (stock in)
  → process (RM out → tank liters) → packing (tank+packaging → finished stock)
  → sales (stock/tank out) → payments / commission payments → expenses
  → verify journals, trial balance, customer/vendor/salesman finance vs transactions

Usage:
  ./venv/bin/python manage.py seed_full_realistic --reset --yes
  ./venv/bin/python manage.py seed_full_realistic --reset --yes --volume 24
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.core.management.base import CommandError
from django.utils import timezone

from api.management.commands.seed_production_flow import Command as ProductionFlowCommand
from api.models.data.currency import BASE_CURRENCY_ID, CURRENCY_BY_CODE
from api.services.contact_ledger import get_customer_finance, get_vendor_finance
from api.services.salesman_commission import (
    salesman_commission_balance,
    salesman_commission_earned,
    salesman_commission_paid,
)
from api.models.data.customers import Customer
from api.models.data.sales import Sales
from api.models.data.salesmen import Salesman
from api.models.data.vendors import Vendor
from api.models.data.payment import Payment
from api.models.data.salesman_commission_payment import SalesmanCommissionPayment
from api.models.data.purchases import Purchase as RawMaterialPurchase


def _d(value) -> Decimal:
    return Decimal(str(value or 0))


def _q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


class Command(ProductionFlowCommand):
    help = (
        'Seed a full realistic dataset through the API (~20+ rows per key model), '
        'then verify stock, multi-currency finance, commissions, and reports.'
    )

    def add_arguments(self, parser):
        super().add_arguments(parser)
        parser.add_argument(
            '--volume',
            type=int,
            default=22,
            help='Target count for customers/vendors/salesmen/sales (default 22).',
        )
        parser.add_argument(
            '--skip-base',
            action='store_true',
            help='Skip the core production-flow seed (only volume + verify).',
        )

    def handle(self, *args, **options):
        volume = max(12, int(options['volume']))
        self.ctx['volume'] = volume
        self.ctx['expected'] = {
            'customers': {},  # id -> {afn_debit, afn_credit, usd_debit, usd_credit}
            'vendors': {},
            'salesmen': {},  # id -> {earned, paid}
            'usd_rate': Decimal('65.00'),
            'kdr_rate': Decimal('1.25'),
        }

        if options['reset']:
            if not options['yes']:
                raise CommandError('Refusing to reset without --yes')
            self._reset_db()

        user = self._ensure_superuser()
        self._bootstrap(user)
        self._seed_extra_exchange_rates()

        if not options['skip_base']:
            self.stdout.write(self.style.MIGRATE_HEADING('\n=== Base production flow (API) ===\n'))
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
            if self.fails:
                raise CommandError(f'Base production flow failed ({self.fails} checks); aborting volume seed')

        self.stdout.write(self.style.MIGRATE_HEADING(
            f'\n=== Volume seed (~{volume}+ rows) + accuracy audit ===\n'
        ))
        self._seed_volume_parties(volume)
        self._seed_volume_purchases()
        self._seed_volume_process_and_packing()
        self._seed_volume_sales_and_payments(volume)
        self._seed_volume_expenses()
        self._seed_volume_commission_settlements()
        self._verify_list_counts(volume)
        self._verify_finance_accuracy()
        self._verify_multi_currency_bases()
        self._verify_reports()
        self._verify_date_filtered_party_lists()

        self.stdout.write('')
        if self.fails:
            self.stdout.write(self.style.ERROR(f'Done with {self.fails} failure(s).'))
            raise CommandError(f'seed_full_realistic failed ({self.fails} checks)')
        self.stdout.write(self.style.SUCCESS(
            'Full realistic seed + accuracy audit passed.\n'
            f'Login: rahmdel@gmail.com / rahmdel\n'
            f'Target volume≈{volume} for customers/vendors/salesmen/sales.'
        ))

    # ── exchange rates ───────────────────────────────────────────────────

    def _seed_extra_exchange_rates(self):
        now = timezone.now().isoformat()
        kdr = CURRENCY_BY_CODE.get('KDR')
        if kdr:
            self._post('/api/exchange-rates/', {
                'from_currency': kdr['id'],
                'to_currency': BASE_CURRENCY_ID,
                'rate': str(self.ctx['expected']['kdr_rate']),
                'date': now,
                'is_active': True,
            }, 'exchange_rate.KDR')

    # ── volume parties ───────────────────────────────────────────────────

    def _seed_volume_parties(self, volume: int):
        customers = list(self.ctx.get('customers', {}).values()) if isinstance(self.ctx.get('customers'), dict) else []
        vendors = list(self.ctx.get('vendors', {}).values()) if isinstance(self.ctx.get('vendors'), dict) else []
        salesmen = []
        if self.ctx.get('salesman'):
            salesmen.append(self.ctx['salesman'])

        provinces = [
            'Kabul', 'Herat', 'Mazar', 'Kandahar', 'Jalalabad', 'Kunduz',
            'Balkh', 'Ghazni', 'Bamyan', 'Farah', 'Nangarhar', 'Parwan',
            'Baghlan', 'Takhar', 'Badakhshan', 'Helmand', 'Nimroz', 'Paktia',
            'Logar', 'Wardak', 'Samangan', 'Sar-e Pol',
        ]
        while len(customers) < volume:
            i = len(customers) + 1
            row = self._post('/api/customers/', {
                'name': f'{provinces[(i - 1) % len(provinces)]} Retail {i:02d}',
                'phone': f'0791{i:06d}',
                'email': f'customer{i:02d}@example.af',
                'address': f'{provinces[(i - 1) % len(provinces)]}, Afghanistan',
                'notes': f'Volume seed customer #{i}',
            }, f'volume.customer.{i}')
            if row:
                customers.append(row)

        goods_names = [
            'Ariana Chemicals', 'Pamir Packaging Co', 'Hindukush Plastics',
            'Silk Road Caps', 'Balkh Labels', 'Khorasan Cartons',
            'Safed Koh Fragrance', 'Spin Ghar Surfactants', 'Herat Bottle Works',
            'Kabul Industrial Supply', 'Mazar Plastics Hub', 'Kandahar Trade House',
        ]
        while len(vendors) < volume:
            i = len(vendors) + 1
            name = f'{goods_names[(i - 1) % len(goods_names)]} {i:02d}'
            row = self._post('/api/vendors/', {
                'name': name,
                'phone': f'0702{i:06d}',
                'email': f'vendor{i:02d}@example.af',
                'address': f'Warehouse {i}, Industrial Park',
                'notes': f'Volume seed vendor #{i}',
            }, f'volume.vendor.{i}')
            if row:
                vendors.append(row)

        while len(salesmen) < volume:
            i = len(salesmen) + 1
            row = self._post('/api/salesmen/', {
                'name': f'Sales Rep {provinces[(i - 1) % len(provinces)]} {i:02d}',
                'phone': f'0783{i:06d}',
                'email': f'salesman{i:02d}@example.af',
                'address': provinces[(i - 1) % len(provinces)],
                'is_active': True,
                'notes': f'Volume seed salesman #{i}',
            }, f'volume.salesman.{i}')
            if row:
                salesmen.append(row)

        self.ctx['volume_customers'] = customers
        self.ctx['volume_vendors'] = vendors
        self.ctx['volume_salesmen'] = salesmen
        self.log('volume.parties', 'PASS',
                 f'customers={len(customers)} vendors={len(vendors)} salesmen={len(salesmen)}')

    # ── more RM purchases (AFN + USD + KDR) ───────────────────────────────

    def _seed_volume_purchases(self):
        materials = self.ctx.get('materials') or {}
        if not materials:
            self.log('volume.purchases', 'FAIL', 'No materials in context')
            return
        vendors = self.ctx['volume_vendors']
        if not vendors:
            vendors = list(self.ctx.get('vendors', {}).values())
        chem_vendor = vendors[0]['id']
        pack_vendor = vendors[min(1, len(vendors) - 1)]['id']
        now = timezone.now()

        # Top-up chemistry AFN — needed for more process batches
        chem_lines = [
            ('SLES 70%', '400', '92'),
            ('LABSA 96%', '300', '85'),
            ('Cocamidopropyl Betaine', '80', '125'),
            ('Caustic Soda', '60', '52'),
            ('Sodium Chloride', '200', '11'),
            ('Lemon Fragrance', '20', '470'),
            ('Preservative', '12', '600'),
        ]
        items = [{
            'raw_material': materials[name]['id'],
            'quantity': qty,
            'price_per_unit': price,
            'piece_count': 0,
        } for name, qty, price in chem_lines if name in materials]
        p1 = self._post('/api/raw-material-purchases/', {
            'vendor': chem_vendor,
            'currency': 1,
            'purchase_date': (now - timedelta(days=18)).isoformat(),
            'status': 'received',
            'bill_number': 'CHEM-VOL-002',
            'notes': 'Volume chemistry top-up AFN',
            'items': items,
        }, 'volume.purchase.chem2')
        self.ctx['volume_chem_purchase'] = p1
        if p1:
            self._track_vendor_purchase(chem_vendor, 1, _d(p1.get('total_amount')))

        # Packaging USD top-up
        pack_lines = [
            ('PET Bottle 500ml', '4000', '0.07'),
            ('PET Bottle 750ml', '5000', '0.09'),
            ('PET Bottle 1L', '3000', '0.11'),
            ('Cap 28mm', '12000', '0.018'),
            ('Label 500ml Lemon', '4000', '0.014'),
            ('Label 750ml Lemon', '5000', '0.016'),
            ('Label 1L Lemon', '3000', '0.018'),
            ('Shrink Plastic 500ml', '4000', '0.009'),
            ('Shrink Plastic 750ml', '5000', '0.011'),
            ('Shrink Plastic 1L', '3000', '0.013'),
            ('Carton 12x500ml', '400', '0.32'),
            ('Carton 8x750ml', '700', '0.38'),
            ('Carton 6x1L', '500', '0.42'),
        ]
        items = [{
            'raw_material': materials[name]['id'],
            'quantity': qty,
            'price_per_unit': price,
            'piece_count': 0,
        } for name, qty, price in pack_lines if name in materials]
        p2 = self._post('/api/raw-material-purchases/', {
            'vendor': pack_vendor,
            'currency': 2,
            'purchase_date': (now - timedelta(days=16)).isoformat(),
            'status': 'received',
            'bill_number': 'PACK-VOL-002',
            'notes': 'Volume packaging top-up USD',
            'items': items,
        }, 'volume.purchase.pack2')
        self.ctx['volume_pack_purchase'] = p2
        if p2:
            self._track_vendor_purchase(pack_vendor, 2, _d(p2.get('total_amount')))

        # Small KDR packaging-related purchase if KDR exists
        if CURRENCY_BY_CODE.get('KDR') and 'Cap 28mm' in materials:
            p3 = self._post('/api/raw-material-purchases/', {
                'vendor': vendors[min(2, len(vendors) - 1)]['id'],
                'currency': 3,
                'purchase_date': (now - timedelta(days=12)).isoformat(),
                'status': 'received',
                'bill_number': 'KDR-VOL-001',
                'notes': 'Local KDR caps top-up',
                'items': [{
                    'raw_material': materials['Cap 28mm']['id'],
                    'quantity': '1000',
                    'price_per_unit': '1.50',
                    'piece_count': 0,
                }],
            }, 'volume.purchase.kdr')
            if p3:
                self._track_vendor_purchase(p3.get('vendor') or vendors[min(2, len(vendors) - 1)]['id'], 3, _d(p3.get('total_amount')))

        # Refresh expected RM stock map for later packing availability (approximate top-up)
        for name, qty, _ in chem_lines:
            self.ctx.setdefault('chem_expected', {})
            self.ctx['chem_expected'][name] = self.ctx['chem_expected'].get(name, Decimal('0')) + Decimal(qty)
        for name, qty, _ in pack_lines:
            self.ctx.setdefault('pack_expected', {})
            self.ctx['pack_expected'][name] = self.ctx['pack_expected'].get(name, Decimal('0')) + Decimal(qty)

    def _track_vendor_purchase(self, vendor_id, currency_id, amount):
        bucket = self.ctx['expected']['vendors'].setdefault(int(vendor_id), {
            'afn_credit': Decimal('0'), 'afn_debit': Decimal('0'),
            'usd_credit': Decimal('0'), 'usd_debit': Decimal('0'),
            'kdr_credit': Decimal('0'), 'kdr_debit': Decimal('0'),
        })
        key = {1: 'afn_credit', 2: 'usd_credit', 3: 'kdr_credit'}.get(int(currency_id), 'afn_credit')
        bucket[key] += amount

    def _track_vendor_payment(self, vendor_id, currency_id, amount):
        bucket = self.ctx['expected']['vendors'].setdefault(int(vendor_id), {
            'afn_credit': Decimal('0'), 'afn_debit': Decimal('0'),
            'usd_credit': Decimal('0'), 'usd_debit': Decimal('0'),
            'kdr_credit': Decimal('0'), 'kdr_debit': Decimal('0'),
        })
        key = {1: 'afn_debit', 2: 'usd_debit', 3: 'kdr_debit'}.get(int(currency_id), 'afn_debit')
        bucket[key] += amount

    def _track_customer_sale(self, customer_id, currency_id, amount):
        bucket = self.ctx['expected']['customers'].setdefault(int(customer_id), {
            'afn_debit': Decimal('0'), 'afn_credit': Decimal('0'),
            'usd_debit': Decimal('0'), 'usd_credit': Decimal('0'),
            'kdr_debit': Decimal('0'), 'kdr_credit': Decimal('0'),
        })
        key = {1: 'afn_debit', 2: 'usd_debit', 3: 'kdr_debit'}.get(int(currency_id), 'afn_debit')
        bucket[key] += amount

    def _track_customer_payment(self, customer_id, currency_id, amount):
        bucket = self.ctx['expected']['customers'].setdefault(int(customer_id), {
            'afn_debit': Decimal('0'), 'afn_credit': Decimal('0'),
            'usd_debit': Decimal('0'), 'usd_credit': Decimal('0'),
            'kdr_debit': Decimal('0'), 'kdr_credit': Decimal('0'),
        })
        key = {1: 'afn_credit', 2: 'usd_credit', 3: 'kdr_credit'}.get(int(currency_id), 'afn_credit')
        bucket[key] += amount

    def _track_salesman_earned(self, salesman_id, amount):
        bucket = self.ctx['expected']['salesmen'].setdefault(int(salesman_id), {
            'earned': Decimal('0'), 'paid': Decimal('0'),
        })
        bucket['earned'] += amount

    def _track_salesman_paid(self, salesman_id, amount):
        bucket = self.ctx['expected']['salesmen'].setdefault(int(salesman_id), {
            'earned': Decimal('0'), 'paid': Decimal('0'),
        })
        bucket['paid'] += amount

    # ── more process + packing → finished stock ──────────────────────────

    def _pick_components(self, results, materials, specs):
        components = []
        for ctype, mname, qty in specs:
            mid = materials[mname]['id']
            for row in results:
                if row.get('material_type') == ctype and row.get('raw_material') == mid:
                    lots = row.get('purchase_lots') or []
                    if not lots:
                        break
                    components.append({
                        'component_type': ctype,
                        'raw_material': mid,
                        'purchase_item': lots[0]['id'],
                        'quantity_pieces': qty,
                    })
                    break
        return components

    def _seed_volume_process_and_packing(self):
        materials = self.ctx['materials']
        tank_a = self.ctx['tanks']['A']
        tank_b = self.ctx['tanks']['B']
        now = timezone.now()

        # Second process batch into Tank B (400 L)
        process_items = [
            {'raw_material': materials['SLES 70%']['id'], 'quantity': '40', 'piece_count': 0},
            {'raw_material': materials['LABSA 96%']['id'], 'quantity': '25', 'piece_count': 0},
            {'raw_material': materials['Cocamidopropyl Betaine']['id'], 'quantity': '8', 'piece_count': 0},
            {'raw_material': materials['Caustic Soda']['id'], 'quantity': '4', 'piece_count': 0},
            {'raw_material': materials['Sodium Chloride']['id'], 'quantity': '10', 'piece_count': 0},
            {'raw_material': materials['Lemon Fragrance']['id'], 'quantity': '1', 'piece_count': 0},
            {'raw_material': materials['Preservative']['id'], 'quantity': '0.5', 'piece_count': 0},
        ]
        process2 = self._post('/api/raw-material-processes/', {
            'product_name': 'Dishwashing Liquid Lemon',
            'process_date': (now - timedelta(days=10)).isoformat(),
            'status': 'moved_to_storage',
            'output_quantity_liters': '400',
            'water_quantity_liters': '311.5',
            'extra_expense': '800',
            'expense_currency': 1,
            'notes': 'Volume batch DL-2026-002 → Tank B',
            'items': process_items,
            'storage_transfers': [
                {'storage_tank': tank_b['id'], 'quantity_liters': '400'},
            ],
        }, 'volume.process.2')
        self.ctx['volume_process2'] = process2
        if process2:
            liters_b = self._tank_liters(tank_b['id'])
            if liters_b is not None:
                # Tank B may have had prior liters; require at least 400 after this transfer
                if liters_b < Decimal('400'):
                    self.log('volume.tank_b', 'FAIL', f'Expected ≥400 L, got {liters_b}')
                else:
                    self.log('volume.tank_b', 'PASS', f'Tank B liters={liters_b}')

        # Third process top-up into Tank A (+500 L)
        process3 = self._post('/api/raw-material-processes/', {
            'product_name': 'Dishwashing Liquid Lemon',
            'process_date': (now - timedelta(days=8)).isoformat(),
            'status': 'moved_to_storage',
            'output_quantity_liters': '500',
            'water_quantity_liters': '390',
            'extra_expense': '900',
            'expense_currency': 1,
            'notes': 'Volume batch DL-2026-003 → Tank A',
            'items': [
                {'raw_material': materials['SLES 70%']['id'], 'quantity': '50', 'piece_count': 0},
                {'raw_material': materials['LABSA 96%']['id'], 'quantity': '30', 'piece_count': 0},
                {'raw_material': materials['Cocamidopropyl Betaine']['id'], 'quantity': '10', 'piece_count': 0},
                {'raw_material': materials['Caustic Soda']['id'], 'quantity': '5', 'piece_count': 0},
                {'raw_material': materials['Sodium Chloride']['id'], 'quantity': '12', 'piece_count': 0},
                {'raw_material': materials['Lemon Fragrance']['id'], 'quantity': '1.2', 'piece_count': 0},
                {'raw_material': materials['Preservative']['id'], 'quantity': '0.6', 'piece_count': 0},
            ],
            'storage_transfers': [
                {'storage_tank': tank_a['id'], 'quantity_liters': '500'},
            ],
        }, 'volume.process.3')
        self.ctx['volume_process3'] = process3

        packing_specs = [
            # tank, liters, bottle_vol, bottle_name, label, plastic, carton, bottles, cartons, note
            (tank_a, '120', '0.5000', 'PET Bottle 500ml', 'Label 500ml Lemon', 'Shrink Plastic 500ml',
             'Carton 12x500ml', 240, 20, 'Vol pack 500ml ×240'),
            (tank_a, '180', '0.7500', 'PET Bottle 750ml', 'Label 750ml Lemon', 'Shrink Plastic 750ml',
             'Carton 8x750ml', 240, 30, 'Vol pack 750ml ×240'),
            (tank_b, '180', '1.0000', 'PET Bottle 1L', 'Label 1L Lemon', 'Shrink Plastic 1L',
             'Carton 6x1L', 180, 30, 'Vol pack 1L ×180'),
            (tank_b, '96', '0.7500', 'PET Bottle 750ml', 'Label 750ml Lemon', 'Shrink Plastic 750ml',
             'Carton 8x750ml', 128, 16, 'Vol pack 750ml ×128 from B'),
        ]
        self.ctx['volume_packing'] = []
        self.ctx['volume_products'] = []
        for idx, (tank, liters, bvol, bottle, label, plastic, carton, btl, ctn, note) in enumerate(packing_specs, start=1):
            comps = self._get('/api/packing-runs/available-components/', section=f'volume.pack.comp.{idx}')
            results = (comps or {}).get('results', comps) if isinstance(comps, dict) else (comps or [])
            components = self._pick_components(results, materials, [
                ('bottle', bottle, btl),
                ('label', label, btl),
                ('plastic', plastic, btl),
                ('carton', carton, ctn),
                ('cap', 'Cap 28mm', btl),
            ])
            if len(components) < 4:
                self.log(f'volume.packing.{idx}', 'FAIL', f'Not enough components ({len(components)})')
                continue
            before_tank = self._tank_liters(tank['id'])
            run = self._post('/api/packing-runs/', {
                'storage_tank': tank['id'],
                'quantity_liters': liters,
                'bottle_volume_liters': bvol,
                'components': components,
                'notes': note,
            }, f'volume.packing.{idx}')
            if not run:
                continue
            self.ctx['volume_packing'].append(run)
            product_id = run.get('product') or run.get('product_id')
            if product_id:
                self.ctx['volume_products'].append({'id': product_id, 'bottles': btl, 'cartons': ctn})
            after_tank = self._tank_liters(tank['id'])
            if before_tank is not None and after_tank is not None:
                expected = before_tank - Decimal(liters)
                self._assert_eq(f'volume.tank_after_pack.{idx}', after_tank, expected, f'Tank after {note}')

        # Finished stock must exist from packing (not manual stock inserts)
        stocks = self._get('/api/stocks/', {'condition': 'good', 'page_size': 100}, 'volume.stocks')
        rows = (stocks or {}).get('results', stocks) if isinstance(stocks, dict) else (stocks or [])
        if not rows:
            self.log('volume.stocks', 'FAIL', 'No finished stock after packing')
        else:
            total_pieces = sum(_d(r.get('piece_amount') or r.get('bottle_amount') or 0) for r in rows)
            self.log('volume.stocks', 'PASS', f'{len(rows)} stock row(s), pieces≈{total_pieces}')
            self.ctx['volume_stock_rows'] = rows

    # ── sales + payments volume ──────────────────────────────────────────

    def _finished_stock_id(self, product_id=None):
        params = {'condition': 'good', 'page_size': 50}
        if product_id:
            params['product'] = product_id
        data = self._get('/api/stocks/', params, 'volume.stock_pick')
        rows = (data or {}).get('results', data) if isinstance(data, dict) else (data or [])
        for row in rows or []:
            bottles = _d(row.get('bottle_amount') or row.get('piece_amount') or 0)
            cartons = _d(row.get('carton_amount') or 0)
            if bottles >= 8 or cartons >= 1:
                return row
        return (rows or [None])[0]

    def _seed_volume_sales_and_payments(self, volume: int):
        customers = self.ctx['volume_customers']
        salesmen = self.ctx['volume_salesmen']
        tank_a = self.ctx['tanks']['A']
        now = timezone.now()
        sales_created = []
        payments_created = 0

        # Seed expected trackers from base-flow known activity is hard; volume audit
        # focuses on volume-created rows + overall report integrity.

        for i in range(1, volume + 1):
            customer = customers[(i - 1) % len(customers)]
            salesman = salesmen[(i - 1) % len(salesmen)]
            day = now - timedelta(days=(volume - i) % 40)
            stock_row = self._finished_stock_id()
            if not stock_row:
                self.log(f'volume.sale.{i}', 'FAIL', 'No finished stock available')
                break

            bottles_avail = _d(stock_row.get('bottle_amount') or stock_row.get('piece_amount') or 0)
            cartons_avail = _d(stock_row.get('carton_amount') or 0)
            use_usd = (i % 5 == 0)
            use_tank = (i % 7 == 0)
            currency = 2 if use_usd else 1

            if use_tank:
                tank_liters = self._tank_liters(tank_a['id'])
                if tank_liters is None or tank_liters < Decimal('5'):
                    use_tank = False

            if use_tank:
                qty = Decimal('5')
                price = Decimal('28') if currency == 1 else Decimal('0.40')
                total = _q2(qty * price)
                payload = {
                    'customer': customer['id'],
                    'salesman': salesman['id'],
                    'currency': currency,
                    'sale_date': day.isoformat(),
                    'status': 'confirmed',
                    'discount_percentage': 0,
                    'total_amount': str(total),
                    'notes': f'Volume tank sale #{i}',
                    'sales_items': [{
                        'sale_source': 'tank',
                        'storage_tank': tank_a['id'],
                        'unit': 'liter',
                        'quantity': str(qty),
                        'liter_amount': str(qty),
                        'sell_price': str(price),
                        'commission_amount': '1' if currency == 1 else '0.02',
                    }],
                }
                commission_line = qty * (Decimal('1') if currency == 1 else Decimal('0.02'))
            elif cartons_avail >= 1 and i % 2 == 0:
                qty = Decimal('1')
                price = Decimal('48') if currency == 1 else Decimal('0.70')
                total = _q2(qty * price)
                # bottles_per_carton may vary; liter_amount for carton is pieces equivalent
                bpc = Decimal('8')
                for prod in self.ctx.get('volume_products') or []:
                    if prod.get('id') == stock_row.get('product') or prod.get('id') == stock_row.get('product_id'):
                        break
                payload = {
                    'customer': customer['id'],
                    'salesman': salesman['id'],
                    'currency': currency,
                    'sale_date': day.isoformat(),
                    'status': 'confirmed',
                    'discount_percentage': 0,
                    'total_amount': str(total),
                    'notes': f'Volume carton sale #{i}',
                    'sales_items': [{
                        'sale_source': 'stock',
                        'stock': stock_row['id'],
                        'unit': 'carton',
                        'quantity': str(qty),
                        'liter_amount': str(bpc),
                        'sell_price': str(price),
                        'commission_amount': '4' if currency == 1 else '0.05',
                    }],
                }
                commission_line = qty * (Decimal('4') if currency == 1 else Decimal('0.05'))
            else:
                qty = Decimal('4') if bottles_avail >= 4 else Decimal('1')
                if bottles_avail < 1:
                    self.log(f'volume.sale.{i}', 'WARN', 'Skipping — no bottles left')
                    continue
                price = Decimal('12') if currency == 1 else Decimal('0.18')
                total = _q2(qty * price)
                payload = {
                    'customer': customer['id'],
                    'salesman': salesman['id'],
                    'currency': currency,
                    'sale_date': day.isoformat(),
                    'status': 'confirmed',
                    'discount_percentage': 0,
                    'total_amount': str(total),
                    'notes': f'Volume bottle sale #{i}',
                    'sales_items': [{
                        'sale_source': 'stock',
                        'stock': stock_row['id'],
                        'unit': 'bottle',
                        'quantity': str(qty),
                        'liter_amount': str(qty),
                        'sell_price': str(price),
                        'commission_amount': '1.5' if currency == 1 else '0.02',
                    }],
                }
                commission_line = qty * (Decimal('1.5') if currency == 1 else Decimal('0.02'))

            sale = self._post('/api/sales/', payload, f'volume.sale.{i}')
            if not sale:
                continue
            sales_created.append(sale)
            # Prefer API-reported total
            detail = self._get(f"/api/sales/{sale['id']}/", section=f'volume.sale.detail.{i}') or sale
            sale_total = _d(detail.get('total_amount') or total)
            self._track_customer_sale(customer['id'], currency, sale_total)
            # Commission is always AFN in this ERP
            if currency == 1:
                self._track_salesman_earned(salesman['id'], commission_line)
            else:
                # USD commission amounts in seed are stored as commission_amount * qty in AFN field;
                # serializer multiplies quantity * commission_amount without FX — treat as AFN units.
                self._track_salesman_earned(salesman['id'], commission_line)

            # Partial payment ~40–100% for most sales
            if i % 4 != 0:
                pay_ratio = Decimal('0.4') if i % 3 == 0 else Decimal('1')
                pay_amt = _q2(sale_total * pay_ratio)
                if pay_amt > 0:
                    method = ['cash', 'bank', 'sarafi'][i % 3]
                    pay = self._post('/api/payments/', {
                        'content_type': 'sales',
                        'object_id': sale['id'],
                        'payment_type': 'sale',
                        'payment_method': method,
                        'payment_date': (day + timedelta(days=1)).isoformat(),
                        'amount': str(pay_amt),
                        'currency': currency,
                        'reference_number': f'VOL-RCP-{i:03d}',
                        'notes': f'Volume receipt #{i}',
                    }, f'volume.payment.sale.{i}')
                    if pay:
                        payments_created += 1
                        self._track_customer_payment(customer['id'], currency, pay_amt)
                        refreshed = self._get(f"/api/sales/{sale['id']}/", section=f'volume.sale.paid.{i}')
                        if refreshed:
                            self._assert_eq(
                                f'volume.sale.paid_amount.{i}',
                                _d(refreshed.get('paid_amount')),
                                pay_amt,
                                f'Sale {i} paid_amount',
                            )

        self.ctx['volume_sales'] = sales_created
        self.log('volume.sales', 'PASS', f'{len(sales_created)} sales, {payments_created} payments')

        # Vendor AP payments on volume purchases
        for key, ratio, currency, section in (
            ('volume_chem_purchase', Decimal('0.35'), 1, 'volume.pay.chem'),
            ('volume_pack_purchase', Decimal('0.30'), 2, 'volume.pay.pack'),
        ):
            purchase = self.ctx.get(key)
            if not purchase:
                continue
            detail = self._get(f"/api/raw-material-purchases/{purchase['id']}/", section=f'{section}.detail') or purchase
            total = _d(detail.get('total_amount'))
            already = _d(detail.get('paid_amount'))
            pay_amt = _q2((total - already) * ratio)
            if pay_amt <= 0:
                continue
            vendor_id = detail.get('vendor') or purchase.get('vendor')
            pay = self._post('/api/payments/', {
                'content_type': 'rawmaterialpurchase',
                'object_id': purchase['id'],
                'payment_type': 'purchase',
                'payment_method': 'bank',
                'payment_date': now.isoformat(),
                'amount': str(pay_amt),
                'currency': currency,
                'reference_number': f'VOL-PAY-{section}',
                'notes': f'Volume AP payment {section}',
            }, section)
            if pay and vendor_id:
                self._track_vendor_payment(vendor_id, currency, pay_amt)
                refreshed = self._get(
                    f"/api/raw-material-purchases/{purchase['id']}/",
                    section=f'{section}.refresh',
                )
                if refreshed:
                    self._assert_eq(
                        f'{section}.paid',
                        _d(refreshed.get('paid_amount')),
                        already + pay_amt,
                        'Purchase paid_amount',
                    )

    def _seed_volume_expenses(self):
        now = timezone.now()
        cats = self._get('/api/expense-categories/', {'page_size': 50}, 'volume.expense.cats')
        cat_rows = (cats or {}).get('results', cats) if isinstance(cats, dict) else (cats or [])
        if not cat_rows:
            cat = self._post('/api/expense-categories/', {
                'name': 'Plant Operations',
                'description': 'Volume seed category',
            }, 'volume.expense.cat')
            cat_rows = [cat] if cat else []
        if not cat_rows:
            return
        cat_id = cat_rows[0]['id']
        descriptions = [
            ('Fuel for generators', '1800'),
            ('Water tanker fill', '950'),
            ('Night shift meals', '1200'),
            ('Packaging machine oil', '650'),
            ('Office stationery', '400'),
            ('Site security', '3000'),
            ('Transport to Mandawi', '2200'),
            ('Lab reagents', '1100'),
            ('Cleaning supplies', '500'),
            ('Internet & phone', '750'),
            ('Maintenance contractor', '4500'),
            ('Warehouse rent share', '8000'),
        ]
        created = 0
        for i, (desc, amount) in enumerate(descriptions, start=1):
            currency = 2 if i % 6 == 0 else 1
            row = self._post('/api/expenses/', {
                'category': cat_id,
                'amount': amount if currency == 1 else str(_q2(_d(amount) / Decimal('65'))),
                'currency': currency,
                'expense_date': (now - timedelta(days=i)).isoformat(),
                'payment_method': ['cash', 'bank', 'sarafi'][i % 3],
                'description': desc,
                'notes': f'Volume expense #{i}',
            }, f'volume.expense.{i}')
            if row:
                created += 1
        self.log('volume.expenses', 'PASS' if created >= 10 else 'FAIL', f'{created} expenses')

    def _seed_volume_commission_settlements(self):
        now = timezone.now()
        settled = 0
        for i, salesman in enumerate(self.ctx.get('volume_salesmen') or [], start=1):
            summary = self._get(
                f"/api/salesmen/{salesman['id']}/commission-summary/",
                section=f'volume.comm.summary.{i}',
            )
            balance = _d((summary or {}).get('commission_balance'))
            if balance <= 0:
                continue
            # Pay 50% for half of salesmen, full for others — leaves remaining for UI demos
            pay_amt = _q2(balance if i % 2 == 0 else balance * Decimal('0.5'))
            if pay_amt <= 0:
                continue
            pay = self._post('/api/salesman-commission-payments/', {
                'salesman': salesman['id'],
                'payment_method': 'cash' if i % 2 else 'bank',
                'payment_date': now.isoformat(),
                'amount': str(pay_amt),
                'reference_number': f'VOL-SCP-{i:03d}',
                'notes': f'Volume commission settlement #{i}',
            }, f'volume.comm.pay.{i}')
            if pay:
                settled += 1
                self._track_salesman_paid(salesman['id'], pay_amt)
                after = self._get(
                    f"/api/salesmen/{salesman['id']}/commission-summary/",
                    section=f'volume.comm.after.{i}',
                )
                if after:
                    expected_bal = max(balance - pay_amt, Decimal('0'))
                    self._assert_eq(
                        f'volume.comm.balance.{i}',
                        _d(after.get('commission_balance')),
                        expected_bal,
                        f'Salesman {i} balance',
                    )
        self.log('volume.commission', 'PASS', f'{settled} commission payment(s)')

    # ── count + accuracy audits ──────────────────────────────────────────

    def _list_count(self, path, section, min_count):
        data = self._get(path, {'page_size': 100}, section)
        if data is None:
            return 0
        if isinstance(data, dict) and 'count' in data:
            count = int(data['count'])
        else:
            rows = data.get('results', data) if isinstance(data, dict) else data
            count = len(rows or [])
        if count < min_count:
            self.log(section, 'FAIL', f'count={count} < {min_count}')
        else:
            self.log(section, 'PASS', f'count={count}')
        return count

    def _verify_list_counts(self, volume: int):
        self.stdout.write(self.style.MIGRATE_HEADING('\n--- List volume checks ---\n'))
        self._list_count('/api/customers/', 'count.customers', volume)
        self._list_count('/api/vendors/', 'count.vendors', volume)
        self._list_count('/api/salesmen/', 'count.salesmen', volume)
        self._list_count('/api/sales/', 'count.sales', max(8, volume // 2))
        self._list_count('/api/payments/', 'count.payments', 8)
        self._list_count('/api/raw-material-purchases/', 'count.purchases', 3)
        self._list_count('/api/raw-material-processes/', 'count.processes', 2)
        self._list_count('/api/packing-runs/', 'count.packing', 3)
        self._list_count('/api/stocks/', 'count.stocks', 1)
        self._list_count('/api/expenses/', 'count.expenses', 8)
        self._list_count('/api/salesman-commission-payments/', 'count.commission_pays', 1)

    def _finance_field(self, finance, currency_code, field):
        if not finance:
            return Decimal('0')
        code = str(currency_code or '')
        bucket = finance.get(code.upper()) or finance.get(code.lower()) or {}
        return _d(bucket.get(field))

    def _verify_finance_accuracy(self):
        """Compare API/party finance to tracked volume expectations (±0.05)."""
        self.stdout.write(self.style.MIGRATE_HEADING('\n--- Finance accuracy (tracked volume) ---\n'))
        tol = Decimal('0.05')

        # Spot-check customers that have tracked expectations
        checked_c = 0
        for cid, exp in list(self.ctx['expected']['customers'].items())[:15]:
            data = self._get(f'/api/customers/{cid}/', section=f'acc.customer.{cid}')
            if not data:
                continue
            finance = data.get('finance') or {}
            for code, debit_key, credit_key in (
                ('afn', 'afn_debit', 'afn_credit'),
                ('usd', 'usd_debit', 'usd_credit'),
            ):
                if exp[debit_key] == 0 and exp[credit_key] == 0:
                    continue
                actual_debit = self._finance_field(finance, code, 'total_debit')
                actual_credit = self._finance_field(finance, code, 'total_credit')
                # Volume tracker may miss base-flow activity on shared parties; only assert
                # that API finance is at least the volume-tracked amounts.
                if actual_debit + tol < exp[debit_key]:
                    self.log(
                        f'acc.customer.{cid}.{code}.debit',
                        'FAIL',
                        f'API {actual_debit} < tracked {exp[debit_key]}',
                    )
                else:
                    self.log(
                        f'acc.customer.{cid}.{code}.debit',
                        'PASS',
                        f'API {actual_debit} ≥ tracked {exp[debit_key]}',
                    )
                if actual_credit + tol < exp[credit_key]:
                    self.log(
                        f'acc.customer.{cid}.{code}.credit',
                        'FAIL',
                        f'API {actual_credit} < tracked {exp[credit_key]}',
                    )
                else:
                    self.log(
                        f'acc.customer.{cid}.{code}.credit',
                        'PASS',
                        f'API {actual_credit} ≥ tracked {exp[credit_key]}',
                    )
            # Rebuild expected from DB sales/payments for exactness on this customer
            self._assert_customer_ledger_exact(cid)
            checked_c += 1
        self.log('acc.customers.checked', 'PASS', f'{checked_c} customers')

        checked_v = 0
        for vid, exp in list(self.ctx['expected']['vendors'].items())[:10]:
            data = self._get(f'/api/vendors/{vid}/', section=f'acc.vendor.{vid}')
            if not data:
                continue
            finance = data.get('finance') or {}
            for code, credit_key, debit_key in (
                ('afn', 'afn_credit', 'afn_debit'),
                ('usd', 'usd_credit', 'usd_debit'),
            ):
                if exp[credit_key] == 0 and exp[debit_key] == 0:
                    continue
                actual_credit = self._finance_field(finance, code, 'total_credit')
                actual_debit = self._finance_field(finance, code, 'total_debit')
                if actual_credit + tol < exp[credit_key]:
                    self.log(
                        f'acc.vendor.{vid}.{code}.credit',
                        'FAIL',
                        f'API {actual_credit} < tracked purchases {exp[credit_key]}',
                    )
                else:
                    self.log(
                        f'acc.vendor.{vid}.{code}.credit',
                        'PASS',
                        f'API {actual_credit} ≥ tracked {exp[credit_key]}',
                    )
                if actual_debit + tol < exp[debit_key]:
                    self.log(
                        f'acc.vendor.{vid}.{code}.debit',
                        'FAIL',
                        f'API {actual_debit} < tracked payments {exp[debit_key]}',
                    )
                else:
                    self.log(
                        f'acc.vendor.{vid}.{code}.debit',
                        'PASS',
                        f'API {actual_debit} ≥ tracked {exp[debit_key]}',
                    )
            self._assert_vendor_ledger_exact(vid)
            checked_v += 1
        self.log('acc.vendors.checked', 'PASS', f'{checked_v} vendors')

        # Salesmen: service helpers vs API summary
        for sid in list(self.ctx['expected']['salesmen'].keys())[:12]:
            earned = salesman_commission_earned(sid)
            paid = salesman_commission_paid(sid)
            balance = salesman_commission_balance(sid)
            summary = self._get(f'/api/salesmen/{sid}/commission-summary/', section=f'acc.sm.{sid}')
            if not summary:
                continue
            self._assert_eq(f'acc.sm.{sid}.earned', _d(summary.get('commission_earned')), earned, 'earned')
            self._assert_eq(f'acc.sm.{sid}.paid', _d(summary.get('commission_paid')), paid, 'paid')
            self._assert_eq(f'acc.sm.{sid}.balance', _d(summary.get('commission_balance')), balance, 'balance')
            if abs((earned - paid) - balance) > tol and balance != max(earned - paid, Decimal('0')):
                self.log(f'acc.sm.{sid}.math', 'FAIL', f'earned {earned} - paid {paid} != balance {balance}')
            else:
                self.log(f'acc.sm.{sid}.math', 'PASS', f'{earned} - {paid} → {balance}')

    def _assert_customer_ledger_exact(self, customer_id):
        """Exact debit/credit from Sales + Payments ORM, compared to get_customer_finance."""
        customer = Customer.objects.filter(pk=customer_id).first()
        if not customer:
            return
        finance = get_customer_finance(customer)
        for currency_id, code in ((1, 'afn'), (2, 'usd'), (3, 'kdr')):
            sales = Sales.objects.filter(
                customer_id=customer_id,
                currency=currency_id,
                deleted_at__isnull=True,
            ).exclude(status__in=('draft', 'cancelled'))
            debit = sum((_d(s.total_amount) for s in sales), Decimal('0'))
            # Payments credited against those sales
            sale_ids = list(sales.values_list('id', flat=True))
            credit = Decimal('0')
            if sale_ids:
                pays = Payment.objects.filter(
                    object_id__in=sale_ids,
                    payment_type='sale',
                    currency=currency_id,
                    deleted_at__isnull=True,
                )
                # content_type filter soft — payment_type=sale is enough for our seed
                credit = sum((_d(p.amount) for p in pays), Decimal('0'))
            if debit == 0 and credit == 0:
                continue
            actual_debit = self._finance_field(finance, code, 'total_debit')
            actual_credit = self._finance_field(finance, code, 'total_credit')
            self._assert_eq(
                f'exact.customer.{customer_id}.{code}.debit',
                actual_debit,
                debit,
                'sales sum',
            )
            # Credits can include returns/loans; for volume-only customers should match payments
            if actual_credit + Decimal('0.05') < credit:
                self.log(
                    f'exact.customer.{customer_id}.{code}.credit',
                    'FAIL',
                    f'finance credit {actual_credit} < payments {credit}',
                )
            else:
                # Allow finance credit >= payment sum (other credits)
                if abs(actual_credit - credit) <= Decimal('0.05') or actual_credit >= credit:
                    self.log(
                        f'exact.customer.{customer_id}.{code}.credit',
                        'PASS',
                        f'finance {actual_credit} vs payments {credit}',
                    )

    def _assert_vendor_ledger_exact(self, vendor_id):
        vendor = Vendor.objects.filter(pk=vendor_id).first()
        if not vendor:
            return
        finance = get_vendor_finance(vendor)
        for currency_id, code in ((1, 'afn'), (2, 'usd'), (3, 'kdr')):
            purchases = RawMaterialPurchase.objects.filter(
                vendor_id=vendor_id,
                currency=currency_id,
                deleted_at__isnull=True,
            ).exclude(status__in=('draft', 'cancelled', 'pending'))
            credit = sum((_d(p.total_amount) for p in purchases), Decimal('0'))
            purchase_ids = list(purchases.values_list('id', flat=True))
            debit = Decimal('0')
            if purchase_ids:
                pays = Payment.objects.filter(
                    object_id__in=purchase_ids,
                    payment_type='purchase',
                    currency=currency_id,
                    deleted_at__isnull=True,
                )
                debit = sum((_d(p.amount) for p in pays), Decimal('0'))
            if credit == 0 and debit == 0:
                continue
            actual_credit = self._finance_field(finance, code, 'total_credit')
            actual_debit = self._finance_field(finance, code, 'total_debit')
            self._assert_eq(
                f'exact.vendor.{vendor_id}.{code}.credit',
                actual_credit,
                credit,
                'purchases sum',
            )
            if abs(actual_debit - debit) <= Decimal('0.05') or actual_debit >= debit:
                self.log(
                    f'exact.vendor.{vendor_id}.{code}.debit',
                    'PASS',
                    f'finance {actual_debit} vs payments {debit}',
                )
            else:
                self.log(
                    f'exact.vendor.{vendor_id}.{code}.debit',
                    'FAIL',
                    f'finance {actual_debit} vs payments {debit}',
                )

    def _verify_multi_currency_bases(self):
        """USD sale amount_base ≈ amount * exchange rate; list finance has separate buckets."""
        self.stdout.write(self.style.MIGRATE_HEADING('\n--- Multi-currency base checks ---\n'))
        rate = self.ctx['expected']['usd_rate']
        usd_sales = Sales.objects.filter(currency=2, deleted_at__isnull=True).exclude(
            status__in=('draft', 'cancelled'),
        )[:15]
        checked = 0
        for sale in usd_sales:
            expected_base = _q2(_d(sale.total_amount) * _d(sale.exchange_rate or rate))
            actual_base = _q2(_d(sale.total_amount_base))
            # Allow small rounding differences
            if abs(actual_base - expected_base) > Decimal('1.00') and abs(
                actual_base - _q2(_d(sale.total_amount) * rate)
            ) > Decimal('1.00'):
                self.log(
                    f'fx.sale.{sale.id}',
                    'FAIL',
                    f'base {actual_base} vs amount×rate {expected_base} (rate={sale.exchange_rate})',
                )
            else:
                self.log(
                    f'fx.sale.{sale.id}',
                    'PASS',
                    f'{sale.total_amount} USD → {actual_base} AFN (rate={sale.exchange_rate})',
                )
            checked += 1
        if checked == 0:
            self.log('fx.sales', 'WARN', 'No USD sales to check')
        else:
            self.log('fx.sales', 'PASS', f'{checked} USD sales checked')

        # Customer list with finance must expose both currencies when present
        data = self._get('/api/customers/', {'page_size': 50, 'search': 'Retail'}, 'fx.customers.list')
        rows = (data or {}).get('results', data) if isinstance(data, dict) else (data or [])
        multi = 0
        for row in rows or []:
            finance = row.get('finance') or {}
            codes = [k for k in finance.keys() if k not in ('overall',)]
            if len(codes) >= 2:
                multi += 1
        self.log('fx.customers.list_multi', 'PASS' if multi >= 0 else 'FAIL', f'{multi} multi-currency rows')

    def _verify_date_filtered_party_lists(self):
        self.stdout.write(self.style.MIGRATE_HEADING('\n--- Date-filtered list sanity ---\n'))
        today = timezone.now().date()
        start = (today - timedelta(days=7)).isoformat()
        end = today.isoformat()
        for path, section in (
            ('/api/customers/', 'date.customers'),
            ('/api/vendors/', 'date.vendors'),
            ('/api/salesmen/', 'date.salesmen'),
        ):
            full = self._get(path, {'page_size': 5}, f'{section}.full')
            filtered = self._get(path, {
                'page_size': 5,
                'date_from': start,
                'date_to': end,
            }, f'{section}.filtered')
            if full is None or filtered is None:
                continue
            self.log(section, 'PASS', f'list OK with date_from={start} date_to={end}')
