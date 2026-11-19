from django.test import TestCase
from rest_framework.test import APIRequestFactory

from api.models.data.raw_materials import RawMaterial, RawMaterialPurchase, RawMaterialPurchaseItem
from api.models.data.vendors import Vendor
from api.views.data.raw_materials import RawMaterialPurchaseViewSet


class OpenPurchases(RawMaterialPurchaseViewSet):
    permission_classes = []


class RawMaterialPurchaseFilterTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.view = OpenPurchases.as_view({'get': 'list'})
        self.vendor = Vendor.objects.create(name='Supplier A')
        self.other_vendor = Vendor.objects.create(name='Supplier B')
        self.material = RawMaterial.objects.create(name='Chemical', unit='kg')
        self.purchase = RawMaterialPurchase.objects.create(vendor=self.vendor, status='draft', currency=1, purchase_date='2026-10-20T12:00:00+04:30')
        RawMaterialPurchaseItem.objects.create(purchase=self.purchase, raw_material=self.material, quantity=2, price_per_unit=10)
        RawMaterialPurchase.objects.create(vendor=self.other_vendor, status='draft', currency=1, purchase_date='2026-10-19T12:00:00+04:30')

    def test_combined_vendor_material_currency_status_and_inclusive_date_filters(self):
        response = self.view(self.factory.get('/', {'vendor': self.vendor.pk, 'raw_material': self.material.pk, 'currency': 1, 'status': 'draft', 'date_from': '2026-10-20', 'date_to': '2026-10-20'}))
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['id'], self.purchase.pk)

    def test_material_filter_excludes_other_purchases(self):
        response = self.view(self.factory.get('/', {'raw_material': self.material.pk}))
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertEqual(len(rows), 1)

    def test_invalid_and_reversed_dates_are_rejected(self):
        for params in ({'date_from': 'invalid'}, {'date_from': '2026-10-21', 'date_to': '2026-10-20'}):
            response = self.view(self.factory.get('/', params))
            self.assertEqual(response.status_code, 400, response.data)

    def test_period_presets_and_all_time(self):
        from datetime import datetime, timezone
        from unittest.mock import patch
        response = self.view(self.factory.get('/', {'period': 'all'}))
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertEqual(len(rows), 2)
        for period in ('daily', 'weekly', 'yearly'):
            with patch('api.services.report_period.resolve_report_period', return_value=(datetime(2026, 10, 20, tzinfo=timezone.utc), datetime(2026, 10, 21, tzinfo=timezone.utc))) as resolve:
                response = self.view(self.factory.get('/', {'period': period}))
                self.assertEqual(response.status_code, 200, response.data)
                rows = response.data['results'] if isinstance(response.data, dict) else response.data
                self.assertEqual([row['id'] for row in rows], [self.purchase.pk])
                resolve.assert_called_once_with(period=period)
        response = self.view(self.factory.get('/', {'period': 'invalid'}))
        self.assertEqual(response.status_code, 400)
