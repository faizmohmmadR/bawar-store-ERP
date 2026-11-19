from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from api.services.report_period import parse_report_datetime, resolve_report_period
from api.utils.date_filters import apply_date_range
from api.tests.accounting.helpers import create_confirmed_sale, create_expense

KABUL = ZoneInfo('Asia/Kabul')
DAY = '2026-10-18'


@override_settings(TIME_ZONE='UTC', REPORT_TIME_ZONE='Asia/Kabul')
class ReportRangeParserTests(SimpleTestCase):
    def test_date_boundaries_use_business_timezone_and_include_entire_end_day(self):
        start, end = resolve_report_period(period='custom', start_date=DAY, end_date=DAY)
        self.assertEqual(start.astimezone(KABUL).isoformat(), '2026-10-18T00:00:00+04:30')
        self.assertEqual(end.astimezone(KABUL).isoformat(), '2026-10-18T23:59:59.999999+04:30')
        self.assertEqual(parse_report_datetime(date(2026, 10, 18)), start)

    def test_single_bound_is_preserved_for_every_preset(self):
        for period in ('daily', 'weekly', 'monthly', 'yearly', 'all', 'custom'):
            with self.subTest(period=period):
                start, end = resolve_report_period(period=period, start_date=DAY)
                self.assertIsNotNone(start)
                self.assertIsNone(end)
                start, end = resolve_report_period(period=period, end_date=DAY)
                self.assertIsNone(start)
                self.assertIsNotNone(end)

    def test_invalid_and_reversed_ranges_are_validation_errors(self):
        for value in ('bad-date', '2026-02-30', '2026-13-01', '2026-10-18garbage'):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                parse_report_datetime(value)
        with self.assertRaises(ValidationError):
            resolve_report_period(period='custom', start_date='2026-10-19', end_date=DAY)

    def test_explicit_timestamp_keeps_its_time(self):
        instant = parse_report_datetime('2026-10-18T12:30:00+04:30', end=True)
        self.assertEqual(instant.astimezone(KABUL).hour, 12)
        self.assertEqual(instant.astimezone(KABUL).minute, 30)


@override_settings(TIME_ZONE='UTC', REPORT_TIME_ZONE='Asia/Kabul')
class ReportDateAPITests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(email='report-dates@example.test', password='test-only')
        user.is_superuser = user.is_staff = True
        user.save()
        self.client = APIClient(HTTP_HOST='localhost')
        self.client.force_authenticate(user)
        self.start = datetime(2026, 10, 18, tzinfo=KABUL)
        self.end = self.start + timedelta(days=1) - timedelta(microseconds=1)
        self.sales = [create_confirmed_sale(amount=Decimal('100'), when=instant)
                      for instant in (self.start - timedelta(microseconds=1), self.start, self.end, self.end + timedelta(microseconds=1))]

    def test_transaction_list_filters_are_inclusive_and_accept_both_aliases(self):
        for params in ({'date_from': DAY, 'date_to': DAY}, {'start_date': DAY, 'end_date': DAY}):
            response = self.client.get('/api/sales/', params)
            self.assertEqual(response.status_code, 200, response.data)
            rows = response.data.get('results', []) if isinstance(response.data, dict) else response.data
            self.assertEqual({row['id'] for row in rows}, {self.sales[1].pk, self.sales[2].pk})

    def test_lists_reject_invalid_ranges(self):
        for params in ({'date_from': 'bad'}, {'date_from': '2026-10-19', 'date_to': DAY}):
            self.assertEqual(self.client.get('/api/sales/', params).status_code, 400)

    def test_all_report_endpoints_resolve_the_same_period(self):
        for endpoint in ('base_summary', 'by_currency', 'operational', 'management', 'top_products'):
            response = self.client.get(f'/api/reports/{endpoint}/', {'date_from': DAY, 'date_to': DAY})
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data['period'], {'start_date': DAY, 'end_date': DAY})

    def test_all_time_and_single_bound_history_include_receivables(self):
        for params, expected in [({}, 4), ({'start_date': DAY}, 3), ({'end_date': DAY}, 3), ({'start_date': DAY, 'end_date': DAY}, 2)]:
            response = self.client.get('/api/reports/history/', {'section': 'accounts_receivable', **params})
            self.assertEqual(response.status_code, 200, response.data)
            rows = response.data['results']
            self.assertEqual(len(rows), expected)

    def test_equipment_date_fields_do_not_shift_to_previous_utc_date(self):
        from api.models.data.equipment import Equipment
        previous = Equipment.objects.create(name='Previous', currency=1, unit_cost=10, acquired_date='2026-10-17')
        current = Equipment.objects.create(name='Current', currency=1, unit_cost=10, acquired_date=DAY)
        start, end = resolve_report_period(period='custom', start_date=DAY, end_date=DAY)
        self.assertEqual(list(apply_date_range(Equipment.objects.all(), 'acquired_date', start, end).values_list('pk', flat=True)), [current.pk])
        response = self.client.get('/api/reports/history/', {'section': 'equipment', 'start_date': DAY, 'end_date': DAY})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data['results']), 1)

    def test_expenses_totals_and_history_share_end_of_day_boundaries(self):
        from api.services.financial_reports import _period_expenses
        from api.services.report_history import _query_expenses
        included = create_expense(amount=Decimal('25'), when=self.end)
        create_expense(amount=Decimal('50'), when=self.end + timedelta(microseconds=1))
        self.assertEqual(list(_period_expenses(DAY, DAY).values_list('pk', flat=True)), [included.pk])
        self.assertEqual(len(_query_expenses(DAY, DAY)), 1)

    def test_receivable_history_uses_stored_base_amounts(self):
        from api.models.data.sales import Sales
        from api.services.report_history import _query_accounts_receivable
        Sale = self.sales[1]
        Sales.objects.filter(pk=Sale.pk).update(total_amount=10, paid_amount=2, total_amount_base=650, paid_amount_base=130)
        rows = _query_accounts_receivable(self.start, self.end)
        row = next(row for row in rows if row['id'] == f'sale-{Sale.pk}')
        self.assertEqual(row['amount'], 8)
        self.assertEqual(row['amount_base'], 520)

    def test_attendance_summary_and_list_use_same_range_and_status(self):
        from api.models.data.employee import Employee
        from api.models.data.attendance import Attendance
        employee = Employee.objects.create(full_name='Worker', currency=1)
        for day, status in [('2026-10-17', 'present'), (DAY, 'present'), ('2026-10-19', 'absent')]:
            Attendance.objects.create(employee=employee, date=day, status=status)
        params = {'date_from': DAY, 'date_to': '2026-10-19', 'status': 'present'}
        listing = self.client.get('/api/attendances/', params)
        summary = self.client.get('/api/attendances/daily_summary/', params)
        self.assertEqual(listing.status_code, 200, listing.data)
        self.assertEqual(summary.status_code, 200, summary.data)
        self.assertEqual(len(listing.data), 1)
        self.assertEqual(summary.data['total_employees'], 1)

    def test_withdrawals_are_included_in_cash_out_totals_and_drilldown(self):
        from api.tests.accounting.helpers import create_withdrawal
        from api.services.financial_reports import _build_base_summary
        create_withdrawal(amount=Decimal('25'), when=self.end)
        create_withdrawal(amount=Decimal('50'), when=self.end + timedelta(microseconds=1))
        summary = _build_base_summary(DAY, DAY)
        self.assertEqual(summary['total_cash_out'], 25)
        self.assertEqual(summary['total_cash_out'], sum(row['amount'] for row in summary['cash_out_breakdown']))
        history = self.client.get('/api/reports/history/', {'metric': 'net_cash_flow', 'start_date': DAY, 'end_date': DAY})
        self.assertEqual(history.status_code, 200, history.data)
        self.assertIn('withdrawals', {row['section'] for row in history.data['results']})

    def test_monthly_product_report_supports_all_time_and_local_month_boundaries(self):
        from api.services.financial_reports import get_products_sold_by_month
        boundary = datetime(2026, 11, 1, 0, 30, tzinfo=KABUL)
        create_confirmed_sale(amount=Decimal('10'), when=boundary)
        report = get_products_sold_by_month(start_date=None, end_date=None)
        self.assertEqual(report['totals']['total_pieces'], 5)
        months = report['months']['months']
        november = next(row for row in months if row['month'] == 11)
        self.assertEqual(november['total_pieces'], 1)

    def test_invalid_fiscal_year_and_period_return_validation_errors(self):
        for params in ({'fiscal_year_id': 'bad'}, {'fiscal_year_id': -1}, {'fiscal_year_id': 999999}, {'period': 'unknown'}):
            response = self.client.get('/api/reports/base_summary/', params)
            self.assertEqual(response.status_code, 400, response.data)

    def test_fx_and_equipment_history_preserve_afn_values(self):
        from api.tests.accounting.helpers import create_currency_exchange, create_exchange_rate, USD
        from api.models.data.equipment import Equipment
        from api.services.report_history import _query_currency_exchanges, _query_equipment
        create_exchange_rate(from_currency=USD, rate=Decimal('65'), when=self.start)
        Equipment.objects.create(name='USD equipment', currency=USD, unit_cost=10, acquired_date=DAY)
        create_currency_exchange(from_currency=USD, from_amount=2, to_currency=1, to_amount=130, when=self.end)
        self.assertEqual(_query_equipment(self.start, self.end)[0]['amount_base'], 650)
        self.assertEqual(_query_currency_exchanges(self.start, self.end)[0]['amount_base'], 130)

    def test_all_registered_history_sections_accept_bounded_and_open_ranges(self):
        from api.services.report_history import SECTION_QUERIES
        for section, query in SECTION_QUERIES.items():
            for start, end in [(self.start, self.end), (None, self.end), (self.start, None), (None, None)]:
                with self.subTest(section=section, start=start, end=end):
                    for row in query(start, end, None):
                        instant = parse_report_datetime(row['entry_date'])
                        if start:
                            self.assertGreaterEqual(instant, start)
                        if end:
                            self.assertLessEqual(instant, end)

    def test_gl_account_lines_and_report_lines_use_full_business_day(self):
        from api.models.data.journal import JournalLine
        from api.services.gl_account_ledger import get_gl_account_lines
        from api.services.accounting.reports import _filtered_lines
        lines = list(_filtered_lines(start_date=DAY, end_date=DAY))
        self.assertTrue(lines)
        for line in lines:
            self.assertGreaterEqual(line.journal_entry.entry_date, self.start)
            self.assertLessEqual(line.journal_entry.entry_date, self.end)
        gl = JournalLine.objects.first().gl_account
        for line in get_gl_account_lines(gl, start_date=DAY, end_date=DAY):
            self.assertGreaterEqual(line.journal_entry.entry_date, self.start)
            self.assertLessEqual(line.journal_entry.entry_date, self.end)

    def test_operational_and_journal_ledgers_accept_all_time_and_one_sided_ranges(self):
        for source in ('operational', 'journal'):
            for params in ({'period': 'all'}, {'date_from': DAY}, {'date_to': DAY}):
                with self.subTest(source=source, params=params):
                    response = self.client.get('/api/daily-ledger/', {'source': source, **params})
                    self.assertEqual(response.status_code, 200, response.data)
