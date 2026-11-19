"""
Seed predictable carton / bottle / plastic / liter commission sales per salesman
(via API), then verify unit_breakdown matches commission_earned in that date range.

  ./venv/bin/python manage.py seed_salesman_unit_commission_matrix
  ./venv/bin/python manage.py seed_salesman_unit_commission_matrix --salesmen 12
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from django.core.management.base import CommandError
from django.utils import timezone
from rest_framework.test import APIClient

from account.models import User
from api.management.commands.seed_production_flow import Command as FlowCommand
from api.services.salesman_commission import (
    salesman_commission_earned,
    salesman_unit_breakdown,
)

MARKER = 'UNIT-MATRIX-COMMISSION'
# Isolated sale dates so verification ignores other seed data
MATRIX_YEAR = 2030
MATRIX_MONTH = 6


def _d(value) -> Decimal:
    return Decimal(str(value or 0))


def _expected_for_index(i: int) -> dict:
    """Expected unit buckets for salesman index i (0-based) in matrix window."""
    comm_carton = Decimal('5') + i
    comm_bottle = Decimal('2') + i
    comm_plastic = Decimal('1') + i
    qty_carton = Decimal('2')
    qty_bottle = Decimal('3')
    qty_plastic = Decimal('4')
    rows = {
        'carton': {
            'quantity': qty_carton,
            'commission_total': qty_carton * comm_carton,
            'commission_per_unit_avg': comm_carton,
        },
        'bottle': {
            'quantity': qty_bottle,
            'commission_total': qty_bottle * comm_bottle,
            'commission_per_unit_avg': comm_bottle,
        },
        'plastic': {
            'quantity': qty_plastic,
            'commission_total': qty_plastic * comm_plastic,
            'commission_per_unit_avg': comm_plastic,
        },
    }
    if i % 2 == 0:
        comm_liter = Decimal('3')
        qty_liter = Decimal('10')
        rows['liter'] = {
            'quantity': qty_liter,
            'commission_total': qty_liter * comm_liter,
            'commission_per_unit_avg': comm_liter,
        }
    total = sum(r['commission_total'] for r in rows.values())
    total_qty = sum(r['quantity'] for r in rows.values())
    return {'rows': rows, 'total_commission': total, 'total_quantity': total_qty}


class Command(FlowCommand):
    help = 'Seed per-salesman unit commission matrix sales (API) and verify breakdown'

    def add_arguments(self, parser):
        parser.add_argument(
            '--salesmen',
            type=int,
            default=10,
            help='Number of matrix salesmen to seed (default 10).',
        )

    def handle(self, *args, **options):
        count = max(3, int(options['salesmen']))
        self.fails = 0
        self.ctx = {}
        self.ctx['matrix_expected'] = {}

        user = User.objects.filter(is_superuser=True).first()
        if not user:
            raise CommandError('No superuser; run seed_full_realistic or create admin first.')

        self.client = APIClient()
        self.client.defaults['HTTP_HOST'] = 'localhost'
        self.client.force_authenticate(user=user)

        self.stdout.write(self.style.MIGRATE_HEADING(
            f'\n=== Salesman unit commission matrix ({count} salesmen) ===\n',
        ))

        stock_row = self._pick_stock()
        if not stock_row:
            raise CommandError('No finished stock with cartons/bottles; run seed_full_realistic first.')

        customer = self._pick_customer()
        tank = self._pick_tank()
        stock_id = stock_row['id']
        bpc = Decimal('8')

        salesmen = []
        for i in range(count):
            sm = self._post('/api/salesmen/', {
                'name': f'{MARKER} Rep {i + 1:02d}',
                'phone': f'0789{i:06d}',
                'email': f'unit.matrix.{i + 1}@example.af',
                'is_active': True,
                'notes': MARKER,
            }, f'matrix.salesman.{i + 1}')
            if not sm:
                raise CommandError(f'Failed creating matrix salesman {i + 1}')
            salesmen.append(sm)
            self.ctx['matrix_expected'][sm['id']] = _expected_for_index(i)

        date_from = f'{MATRIX_YEAR}-{MATRIX_MONTH:02d}-01'
        date_to = f'{MATRIX_YEAR}-12-31'

        for i, sm in enumerate(salesmen):
            sale_day = datetime(MATRIX_YEAR, MATRIX_MONTH, 1 + (i % 28), 10, 0, 0)
            if timezone.is_naive(sale_day):
                sale_day = timezone.make_aware(sale_day)

            comm_c = str(5 + i)
            comm_b = str(2 + i)
            comm_p = str(1 + i)
            items = [
                {
                    'sale_source': 'stock',
                    'stock': stock_id,
                    'unit': 'carton',
                    'quantity': '2',
                    'liter_amount': str(2 * bpc),
                    'sell_price': '45',
                    'commission_amount': comm_c,
                },
                {
                    'sale_source': 'stock',
                    'stock': stock_id,
                    'unit': 'bottle',
                    'quantity': '3',
                    'liter_amount': '3',
                    'sell_price': '12',
                    'commission_amount': comm_b,
                },
                {
                    'sale_source': 'stock',
                    'stock': stock_id,
                    'unit': 'plastic',
                    'quantity': '4',
                    'liter_amount': '4',
                    'sell_price': '5',
                    'commission_amount': comm_p,
                },
            ]
            line_total = (
                Decimal('2') * Decimal(comm_c)
                + Decimal('3') * Decimal(comm_b)
                + Decimal('4') * Decimal(comm_p)
            )
            sale = self._post('/api/sales/', {
                'customer': customer['id'],
                'salesman': sm['id'],
                'currency': 1,
                'sale_date': sale_day.isoformat(),
                'status': 'confirmed',
                'discount_percentage': 0,
                'total_amount': str(line_total * Decimal('10')),  # rough invoice total
                'notes': f'{MARKER} packed lines sm={sm["id"]}',
                'sales_items': items,
            }, f'matrix.sale.packed.{i + 1}')
            if not sale:
                raise CommandError(f'Packed matrix sale failed for salesman {i + 1}')

            if i % 2 == 0 and tank:
                tank_day = sale_day.replace(hour=14)
                tank_sale = self._post('/api/sales/', {
                    'customer': customer['id'],
                    'salesman': sm['id'],
                    'currency': 1,
                    'sale_date': tank_day.isoformat(),
                    'status': 'confirmed',
                    'discount_percentage': 0,
                    'total_amount': '250',
                    'notes': f'{MARKER} tank liter sm={sm["id"]}',
                    'sales_items': [{
                        'sale_source': 'tank',
                        'storage_tank': tank['id'],
                        'unit': 'liter',
                        'quantity': '10',
                        'liter_amount': '10',
                        'sell_price': '25',
                        'commission_amount': '3',
                    }],
                }, f'matrix.sale.tank.{i + 1}')
                if not tank_sale:
                    self.log(f'matrix.sale.tank.{i + 1}', 'WARN', 'Tank liter sale skipped')

        self._verify_matrix(salesmen, date_from, date_to)

        self.stdout.write('')
        if self.fails:
            raise CommandError(f'unit commission matrix failed ({self.fails} checks)')
        self.stdout.write(self.style.SUCCESS(
            f'All {count} salesmen passed unit breakdown verification '
            f'(date range {date_from} → {date_to}).\n'
            f'Filter Salesman details with those dates to see the matrix in the UI.',
        ))

    def _pick_stock(self):
        data = self._get('/api/stocks/', {'condition': 'good', 'page_size': 50}, 'matrix.stock')
        rows = (data or {}).get('results', data) if isinstance(data, dict) else (data or [])
        best = None
        best_score = Decimal('0')
        for row in rows or []:
            ctn = _d(row.get('carton_amount'))
            btl = _d(row.get('bottle_amount') or row.get('piece_amount'))
            pls = _d(row.get('plastic_amount') or btl)
            score = ctn * 8 + btl + pls
            if score > best_score:
                best_score = score
                best = row
        if best and best_score >= Decimal('20'):
            return best
        return None

    def _pick_customer(self):
        data = self._get('/api/customers/', {'page_size': 1}, 'matrix.customer')
        rows = (data or {}).get('results', data) if isinstance(data, dict) else (data or [])
        if not rows:
            raise CommandError('No customer for matrix sales')
        return rows[0]

    def _pick_tank(self):
        data = self._get('/api/storage-tanks/', {'page_size': 20}, 'matrix.tank')
        rows = (data or {}).get('results', data) if isinstance(data, dict) else (data or [])
        for row in rows or []:
            liters = _d(row.get('current_liters'))
            if liters >= Decimal('15'):
                return row
        return rows[0] if rows else None

    def _verify_matrix(self, salesmen, date_from, date_to):
        self.stdout.write(self.style.MIGRATE_HEADING('\n--- Unit breakdown verification ---\n'))
        tol = Decimal('0.01')

        for sm in salesmen:
            sid = sm['id']
            expected = self.ctx['matrix_expected'][sid]

            from api.models.data.salesmen import Salesman
            salesman = Salesman.objects.get(pk=sid)

            earned = salesman_commission_earned(
                salesman, date_from=date_from, date_to=date_to,
            )
            breakdown = salesman_unit_breakdown(
                salesman, date_from=date_from, date_to=date_to,
            )

            self._assert_eq(
                f'matrix.{sid}.earned_vs_total',
                earned,
                expected['total_commission'],
                'Earned in matrix window',
            )
            self._assert_eq(
                f'matrix.{sid}.breakdown_total',
                _d(breakdown['total_commission']),
                expected['total_commission'],
                'Breakdown total',
            )

            by_unit = {r['unit']: r for r in breakdown['rows']}
            for unit, exp in expected['rows'].items():
                row = by_unit.get(unit)
                if not row:
                    self.log(f'matrix.{sid}.{unit}', 'FAIL', 'Missing unit row')
                    continue
                self._assert_eq(
                    f'matrix.{sid}.{unit}.qty',
                    _d(row['quantity']),
                    exp['quantity'],
                    f'{unit} qty',
                )
                self._assert_eq(
                    f'matrix.{sid}.{unit}.commission',
                    _d(row['commission_total']),
                    exp['commission_total'],
                    f'{unit} commission',
                )

            api = self._get(
                f'/api/salesmen/{sid}/commission-summary/',
                {'date_from': date_from, 'date_to': date_to},
                f'matrix.api.{sid}',
            )
            if api:
                api_rows = {
                    r['unit']: r
                    for r in (api.get('unit_breakdown') or {}).get('rows') or []
                }
                self._assert_eq(
                    f'matrix.api.{sid}.total',
                    _d((api.get('unit_breakdown') or {}).get('total_commission')),
                    expected['total_commission'],
                    'API breakdown total',
                )
                for unit, exp in expected['rows'].items():
                    ar = api_rows.get(unit)
                    if not ar:
                        self.log(f'matrix.api.{sid}.{unit}', 'FAIL', 'Missing in API')
                        continue
                    if abs(_d(ar['commission_total']) - exp['commission_total']) > tol:
                        self.log(
                            f'matrix.api.{sid}.{unit}',
                            'FAIL',
                            f"commission {ar['commission_total']} != {exp['commission_total']}",
                        )
                    else:
                        self.log(
                            f'matrix.api.{sid}.{unit}',
                            'PASS',
                            f"qty={ar['quantity']} comm={ar['commission_total']}",
                        )
