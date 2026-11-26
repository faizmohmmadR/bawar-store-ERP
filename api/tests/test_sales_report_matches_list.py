"""Sales report billed/collected/unpaid must match sales list settlement."""
from datetime import datetime
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from api.models.data.payment import Payment
from api.models.data.sales import Sales
from api.services.accounting.coa import ensure_accounting_ready
from api.services.sales_report import get_sales_report
from api.tests.accounting.helpers import AFN, create_confirmed_sale, create_order_payment, create_staff_user


WHEN = timezone.make_aware(datetime(2026, 11, 26, 12, 0, 0))
DAY = WHEN.date()


class SalesReportMatchesListTests(APITestCase):
    def setUp(self):
        ensure_accounting_ready(currency_id=AFN)
        self.user = create_staff_user(
            username='sales-report-match',
            email='sales-report-match@test.local',
            as_admin=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_report_matches_paid_and_unpaid_sales(self):
        unpaid = create_confirmed_sale(amount=Decimal('1000'), when=WHEN)
        paid = create_confirmed_sale(amount=Decimal('500'), when=WHEN)
        create_order_payment(order=paid, amount=Decimal('500'), payment_type='sale', when=WHEN)

        # Legacy/broken row: payment recorded but total_amount left at 0.
        orphan = Sales.objects.create(
            customer=unpaid.customer,
            sale_date=WHEN,
            status='confirmed',
            currency=AFN,
            total_amount=Decimal('0'),
            total_amount_base=Decimal('0'),
            paid_amount=Decimal('0'),
        )
        Payment.objects.create(
            content_type=ContentType.objects.get_for_model(orphan),
            object_id=orphan.pk,
            payment_type='sale',
            payment_method='cash',
            payment_date=WHEN,
            amount=Decimal('250'),
            amount_base=Decimal('0'),
            currency=AFN,
        )
        orphan.paid_amount = Decimal('250')
        orphan.save(update_fields=['paid_amount'])

        report = get_sales_report(start_date=DAY, end_date=DAY)
        self.assertEqual(report['kpis']['billed_afn'], 1750.0)
        self.assertEqual(report['kpis']['collected_afn'], 750.0)
        self.assertEqual(report['kpis']['uncollected_afn'], 1000.0)
        self.assertEqual(report['kpis']['invoice_count'], 3)
        self.assertEqual(report['kpis']['paid_count'], 2)
        self.assertEqual(report['kpis']['unpaid_count'], 1)

        resp = self.client.get('/api/sales/report/', {
            'period': 'custom',
            'start_date': DAY.isoformat(),
            'end_date': DAY.isoformat(),
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['kpis']['billed_afn'], 1750.0)
        self.assertEqual(resp.data['kpis']['collected_afn'], 750.0)
        self.assertEqual(resp.data['kpis']['uncollected_afn'], 1000.0)
        # Profit is on sold lines only (orphans without items excluded).
        self.assertIn('gross_profit_afn', resp.data['kpis'])
        self.assertIn('cogs_afn', resp.data['kpis'])
        self.assertIn('margin_pct', resp.data['kpis'])
