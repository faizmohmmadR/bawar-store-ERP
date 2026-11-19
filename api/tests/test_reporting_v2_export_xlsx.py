from io import BytesIO
from unittest.mock import patch

from django.test import TestCase
from openpyxl import load_workbook
from rest_framework.test import APIClient

from api.tests.accounting.helpers import create_staff_user


class ReportingV2ExcelExportTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(username='xlsxreportv2', email='xlsxreportv2@example.com', as_admin=True)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = '/api/reports/v2/export-xlsx/'

    def test_export_preserves_exact_amounts_and_escapes_formula_text(self):
        payload = {'meta': {'version': 2, 'period': {'start_date': None, 'end_date': None}},
                   'status': 'review_required',
                   'rows': [{'amount': '123456789012345678.1234', 'reference': '=SUM(1,2)\x00',
                             'unknown_value': None}]}
        with patch.dict('api.services.reporting.export_xlsx.REPORT_BUILDERS',
                        {'cash-balances': lambda scope: payload}):
            response = self.client.get(self.url, {'report': 'cash-balances'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'],
                         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        book = load_workbook(BytesIO(response.content), read_only=True)
        self.assertEqual(book['rows']['A2'].value, '123456789012345678.1234')
        self.assertEqual(book['rows']['B2'].value, "'=SUM(1,2)")
        self.assertNotEqual(book['rows']['B2'].data_type, 'f')
        self.assertEqual(book['Overview']['A1'].value, 'report')

    def test_report_parameter_is_required_and_unknown_report_is_rejected(self):
        self.assertEqual(self.client.get(self.url).status_code, 400)
        self.assertEqual(self.client.get(self.url, {'report': 'old-operational'}).status_code, 400)

    def test_unauthenticated_export_is_rejected(self):
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get(self.url, {'report': 'cash-balances'}).status_code, (401, 403))
