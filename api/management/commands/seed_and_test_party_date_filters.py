"""
Seed varied-date demo rows for customers / vendors / salesmen and verify date filters.

Usage:
  python manage.py seed_and_test_party_date_filters
"""
from datetime import datetime
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from rest_framework.test import APIClient

from account.models import User
from api.models.data.customers import Customer
from api.models.data.raw_materials import RawMaterialPurchase
from api.models.data.sales import Sales, SalesItems
from api.models.data.salesman_commission_payment import SalesmanCommissionPayment
from api.models.data.salesmen import Salesman
from api.models.data.stock import Stock
from api.models.data.vendors import Vendor
from api.services.contact_ledger import get_customer_finance, get_vendor_finance
from api.services.salesman_commission import (
    salesman_commission_balance,
    salesman_commission_earned,
    salesman_commission_paid,
)
from api.utils.date_filters import normalize_date_from, normalize_date_to

MARKER = 'DATE-FILTER-TEST'


class Command(BaseCommand):
    help = 'Seed varied-date party data and assert date filters work'

    def handle(self, *args, **options):
        fails = 0

        def check(label, ok, detail=''):
            nonlocal fails
            if ok:
                self.stdout.write(self.style.SUCCESS(f'PASS  {label} {detail}'.rstrip()))
            else:
                fails += 1
                self.stdout.write(self.style.ERROR(f'FAIL  {label} {detail}'.rstrip()))

        # ── unit: date helpers ───────────────────────────────────────────
        start = normalize_date_from('2026-01-15')
        end = normalize_date_to('2026-01-15')
        check('date_from.start_of_day', start is not None and start.hour == 0)
        check('date_to.end_of_day', end is not None and end.hour == 23)

        mid = timezone.make_aware(datetime(2026, 1, 10, 12, 0, 0))
        early = timezone.make_aware(datetime(2026, 1, 5, 10, 0, 0))
        late = timezone.make_aware(datetime(2026, 1, 20, 16, 0, 0))

        stamp = timezone.now().strftime('%Y%m%d%H%M%S')

        # Cleanup previous test marker rows (hard delete for re-runs)
        SalesItems.objects.filter(sales__notes__contains=MARKER).delete()
        Sales.objects.filter(notes__contains=MARKER).delete()
        Sales.objects.filter(invoice_number__startswith='DFT-INV-').delete()
        SalesmanCommissionPayment.objects.filter(notes__contains=MARKER).delete()
        RawMaterialPurchase.objects.filter(notes__contains=MARKER).delete()
        RawMaterialPurchase.objects.filter(invoice_number__startswith='DFT-PO-').delete()
        Customer.objects.filter(name__contains=MARKER).delete()
        Vendor.objects.filter(name__contains=MARKER).delete()
        Salesman.objects.filter(name__contains=MARKER).delete()

        customer = Customer.objects.create(
            name=f'{MARKER} Customer Alpha',
            phone='0701111001',
        )
        vendor = Vendor.objects.create(
            name=f'{MARKER} Vendor Beta',
            phone='0701111002',
        )
        salesman = Salesman.objects.create(
            name=f'{MARKER} Salesman Gamma',
            phone='0701111003',
            is_active=True,
        )

        stock = Stock.objects.first()
        if stock is None:
            raise CommandError('Need at least one Stock row to seed sales line items')

        # Two sales on different dates with commission (ORM only — no stock deduction)
        sale_early = Sales.objects.create(
            customer=customer,
            salesman=salesman,
            invoice_number=f'DFT-INV-{stamp}-A',
            sale_date=early,
            status='confirmed',
            currency=1,
            total_amount=Decimal('100'),
            total_amount_base=Decimal('100'),
            notes=f'{MARKER} early sale',
        )
        SalesItems.objects.create(
            sales=sale_early,
            sale_source='stock',
            stock=stock,
            unit='bottle',
            quantity=Decimal('10'),
            liter_amount=Decimal('10'),
            sell_price=Decimal('10'),
            commission_amount=Decimal('2'),  # 10 × 2 = 20 earned
        )

        sale_late = Sales.objects.create(
            customer=customer,
            salesman=salesman,
            invoice_number=f'DFT-INV-{stamp}-B',
            sale_date=late,
            status='confirmed',
            currency=1,
            total_amount=Decimal('200'),
            total_amount_base=Decimal('200'),
            notes=f'{MARKER} late sale',
        )
        SalesItems.objects.create(
            sales=sale_late,
            sale_source='stock',
            stock=stock,
            unit='bottle',
            quantity=Decimal('5'),
            liter_amount=Decimal('5'),
            sell_price=Decimal('40'),
            commission_amount=Decimal('4'),  # 5 × 4 = 20 earned
        )

        # Partial commission payment mid-range
        SalesmanCommissionPayment.objects.create(
            salesman=salesman,
            payment_date=mid,
            payment_method='cash',
            amount=Decimal('15'),
            amount_base=Decimal('15'),
            currency=1,
            notes=f'{MARKER} mid payment',
        )

        # Vendor purchase early (AFN)
        RawMaterialPurchase.objects.create(
            vendor=vendor,
            invoice_number=f'DFT-PO-{stamp}-A',
            purchase_date=early,
            status='received',
            currency=1,
            total_amount=Decimal('500'),
            total_amount_base=Decimal('500'),
            paid_amount=Decimal('100'),
            paid_amount_base=Decimal('100'),
            notes=f'{MARKER} early purchase',
        )
        RawMaterialPurchase.objects.create(
            vendor=vendor,
            invoice_number=f'DFT-PO-{stamp}-B',
            purchase_date=late,
            status='received',
            currency=1,
            total_amount=Decimal('300'),
            total_amount_base=Decimal('300'),
            paid_amount=Decimal('0'),
            paid_amount_base=Decimal('0'),
            notes=f'{MARKER} late purchase',
        )

        # ── salesman commission filters ──────────────────────────────────
        earned_all = salesman_commission_earned(salesman)
        earned_early = salesman_commission_earned(
            salesman, date_from='2026-01-01', date_to='2026-01-10',
        )
        earned_late = salesman_commission_earned(
            salesman, date_from='2026-01-15', date_to='2026-01-31',
        )
        paid_mid = salesman_commission_paid(
            salesman, date_from='2026-01-01', date_to='2026-01-15',
        )
        paid_late_only = salesman_commission_paid(
            salesman, date_from='2026-01-16', date_to='2026-01-31',
        )
        bal_all = salesman_commission_balance(salesman)

        check('salesman.earned_all', earned_all == Decimal('40'), f'got {earned_all}')
        check('salesman.earned_early', earned_early == Decimal('20'), f'got {earned_early}')
        check('salesman.earned_late', earned_late == Decimal('20'), f'got {earned_late}')
        check('salesman.paid_mid', paid_mid == Decimal('15'), f'got {paid_mid}')
        check('salesman.paid_late_window', paid_late_only == Decimal('0'), f'got {paid_late_only}')
        check('salesman.balance_all', bal_all == Decimal('25'), f'got {bal_all}')

        # ── customer finance filters ─────────────────────────────────────
        fin_all = get_customer_finance(customer)
        fin_early = get_customer_finance(customer, date_from='2026-01-01', date_to='2026-01-10')
        fin_late = get_customer_finance(customer, date_from='2026-01-15', date_to='2026-01-31')
        afn_all = fin_all.get('AFN') or fin_all.get('afn') or fin_all.get('overall') or {}
        afn_early = fin_early.get('AFN') or fin_early.get('afn') or {}
        afn_late = fin_late.get('AFN') or fin_late.get('afn') or {}
        check(
            'customer.debit_all',
            Decimal(str(afn_all.get('total_debit') or 0)) == Decimal('300'),
            f'got {afn_all.get("total_debit")}',
        )
        check(
            'customer.debit_early',
            Decimal(str(afn_early.get('total_debit') or 0)) == Decimal('100'),
            f'got {afn_early.get("total_debit")}',
        )
        check(
            'customer.debit_late',
            Decimal(str(afn_late.get('total_debit') or 0)) == Decimal('200'),
            f'got {afn_late.get("total_debit")}',
        )

        # ── vendor finance filters ───────────────────────────────────────
        v_all = get_vendor_finance(vendor)
        v_early = get_vendor_finance(vendor, date_from='2026-01-01', date_to='2026-01-10')
        v_late = get_vendor_finance(vendor, date_from='2026-01-15', date_to='2026-01-31')
        v_afn_all = v_all.get('AFN') or v_all.get('afn') or {}
        v_afn_early = v_early.get('AFN') or v_early.get('afn') or {}
        v_afn_late = v_late.get('AFN') or v_late.get('afn') or {}
        check(
            'vendor.credit_all',
            Decimal(str(v_afn_all.get('total_credit') or 0)) == Decimal('800'),
            f'got {v_afn_all.get("total_credit")}',
        )
        check(
            'vendor.credit_early',
            Decimal(str(v_afn_early.get('total_credit') or 0)) == Decimal('500'),
            f'got {v_afn_early.get("total_credit")}',
        )
        check(
            'vendor.credit_late',
            Decimal(str(v_afn_late.get('total_credit') or 0)) == Decimal('300'),
            f'got {v_afn_late.get("total_credit")}',
        )

        # ── list API with date_from / date_to ────────────────────────────
        user = User.objects.filter(is_superuser=True).first() or User.objects.first()
        if not user:
            raise CommandError('No user available to authenticate API tests')
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'localhost'
        client.force_authenticate(user=user)

        def _rows(response):
            data = response.data
            if isinstance(data, dict):
                return data.get('results', [])
            return list(data)

        sm_list = client.get('/api/salesmen/', {
            'search': MARKER,
            'date_from': '2026-01-01',
            'date_to': '2026-01-10',
            'page_size': 100,
        })
        check('api.salesmen.list', sm_list.status_code == 200, f'status={sm_list.status_code}')
        if sm_list.status_code == 200:
            rows = _rows(sm_list)
            row = next((r for r in rows if r.get('id') == salesman.id), None)
            check('api.salesmen.row', row is not None)
            if row:
                check(
                    'api.salesmen.earned_filtered',
                    Decimal(str(row.get('total_commission') or 0)) == Decimal('20'),
                    f'got {row.get("total_commission")}',
                )
                check(
                    'api.salesmen.paid_filtered',
                    Decimal(str(row.get('commission_paid') or 0)) == Decimal('15'),
                    f'got {row.get("commission_paid")}',
                )

        cu_list = client.get('/api/customers/', {
            'search': MARKER,
            'date_from': '2026-01-15',
            'date_to': '2026-01-31',
            'page_size': 100,
        })
        check('api.customers.list', cu_list.status_code == 200, f'status={cu_list.status_code}')
        if cu_list.status_code == 200:
            rows = _rows(cu_list)
            row = next((r for r in rows if r.get('id') == customer.id), None)
            check('api.customers.row', row is not None)
            if row and row.get('finance'):
                debit = (row['finance'].get('AFN') or row['finance'].get('afn') or {}).get('total_debit')
                check(
                    'api.customers.debit_filtered',
                    Decimal(str(debit or 0)) == Decimal('200'),
                    f'got {debit}',
                )

        ve_list = client.get('/api/vendors/', {
            'search': MARKER,
            'date_from': '2026-01-01',
            'date_to': '2026-01-10',
            'page_size': 100,
        })
        check('api.vendors.list', ve_list.status_code == 200, f'status={ve_list.status_code}')
        if ve_list.status_code == 200:
            rows = _rows(ve_list)
            row = next((r for r in rows if r.get('id') == vendor.id), None)
            check('api.vendors.row', row is not None)
            if row and row.get('finance'):
                credit = (row['finance'].get('AFN') or row['finance'].get('afn') or {}).get('total_credit')
                check(
                    'api.vendors.credit_filtered',
                    Decimal(str(credit or 0)) == Decimal('500'),
                    f'got {credit}',
                )

        sm_summary = client.get(
            f'/api/salesmen/{salesman.id}/commission-summary/',
            {'date_from': '2026-01-15', 'date_to': '2026-01-31'},
        )
        check('api.salesmen.summary', sm_summary.status_code == 200)
        if sm_summary.status_code == 200:
            data = sm_summary.data if isinstance(sm_summary.data, dict) else {}
            check(
                'api.salesmen.summary.earned',
                Decimal(str(data.get('commission_earned') or 0)) == Decimal('20'),
                f'got {data.get("commission_earned")}',
            )

        if fails:
            raise CommandError(f'{fails} date-filter checks failed')
        self.stdout.write(self.style.SUCCESS(
            f'\nAll checks passed. Seeded {MARKER} customer/vendor/salesman with varied dates.',
        ))
