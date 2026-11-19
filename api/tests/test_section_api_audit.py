"""UI-shaped API entry and read checks; always runs in Django's isolated test DB."""
from contextlib import redirect_stdout
from decimal import Decimal
from io import StringIO
from tempfile import TemporaryDirectory

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api.models.data.journal import GLAccount
from api.services.accounting import ensure_accounting_ready


class SectionAPIAuditTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.defaults['HTTP_HOST'] = 'localhost'
        self.client.raise_request_exception = True
        self.user = get_user_model().objects.create_user(
            username='section-audit', email='section-audit@example.test', password='Audit-test-only-583!',
        )
        self.user.role = 'admin'
        self.user.is_admin = self.user.is_staff = self.user.is_superuser = True
        self.user.save()
        self.client.force_authenticate(self.user)
        ensure_accounting_ready()

    def post(self, section, payload):
        response = self.client.post(f'/api/{section}/', payload, format='json')
        self.assertEqual(response.status_code, 201, f'{section}: {getattr(response, "data", response.status_code)}')
        return response.data

    def test_realistic_purchase_to_reports_workflow(self):
        output = StringIO()
        try:
            with redirect_stdout(output):
                call_command('seed_production_flow', stdout=output, stderr=output)
        except Exception as exc:
            # The seed command includes fixture login details; report only failed checks.
            failures = [line for line in output.getvalue().splitlines() if '[FAIL]' in line]
            self.fail(f'{type(exc).__name__}: ' + '\n'.join(failures))
        self.assertIn('All production-flow seeds, payments, journals, and report checks passed.', output.getvalue())
        # Multipart document entry uses the same owner/file fields as the UI.
        from api.models.data.sales import Sales
        sale = Sales.objects.first()
        self.assertIsNotNone(sale)
        with TemporaryDirectory(prefix='erp-audit-media-') as directory, override_settings(MEDIA_ROOT=directory):
            response = self.client.post('/api/attachments/', {
                'owner_type': 'sale', 'object_id': sale.pk,
                'file': SimpleUploadedFile('audit.pdf', b'%PDF-1.4\n%%EOF', content_type='application/pdf'),
                'title': 'Audit document',
            }, format='multipart')
            self.assertEqual(response.status_code, 201, getattr(response, 'data', None))
            document_id = response.data['id']
            documents = self.client.get('/api/attachments/', {'owner_type': 'sale', 'object_id': sale.pk})
            self.assertEqual(documents.status_code, 200)
            self.assertTrue(any(row['id'] == document_id for row in documents.data))
            self.assertEqual(self.client.delete(f'/api/attachments/{document_id}/').status_code, 204)


    def test_operational_data_entry_read_update_delete(self):
        now = timezone.now()
        date = now.date().isoformat()
        customer = self.post('customers', {'name': 'Audit customer', 'phone': '0700000100'})
        self.post('loans', {'loaner_type': 'customer', 'customer': customer['id'], 'amount': '5000', 'currency': 1, 'loan_type': 'loan_in', 'payment_method': 'cash', 'loan_date': now.isoformat()})
        vendor = self.post('vendors', {'name': 'Audit supplier', 'phone': '0700000101'})
        salesman = self.post('salesmen', {'name': 'Audit salesman', 'is_active': True})
        employee = self.post('employees', {'full_name': 'Audit employee', 'phone': '0700000102', 'salary': '3000.50', 'salary_type': 'monthly', 'currency': 1, 'contract_start_date': date})
        with self.subTest(section='attendance'):
            attendance = self.post('attendances', {'employee': employee['id'], 'date': date, 'status': 'present', 'check_in_time': '08:00:00', 'check_out_time': '17:30:00', 'break_time': '0.50', 'verification_type': 'manual'})
            self.assertEqual(Decimal(str(attendance['work_hours'])), Decimal('9'))
            self.assertEqual(Decimal(str(attendance['overtime_hours'])), Decimal('1'))
        with self.subTest(section='leave'):
            leave = self.post('employee-leaves', {'employee': employee['id'], 'start_date': date, 'end_date': date, 'status': 'pending', 'reason': 'Audit leave'})
            approved = self.client.post(f'/api/employee-leaves/{leave["id"]}/approve/', {}, format='json')
            self.assertEqual(approved.status_code, 200)
            self.assertEqual(self.client.get(f'/api/employee-leaves/{leave["id"]}/').data['status'], 'approved')
        with self.subTest(section='payroll'):
            payroll = self.post('payrolls', {'employee': employee['id'], 'payment_date': date, 'year': now.year, 'month': str(now.month), 'period_calendar': 'gregorian', 'payroll_type': 'salary', 'gross_amount': '1000.25', 'amount': '1010.00', 'net_salary': '1010.00', 'basic_salary': '3000.50', 'salary_deduction': '10.50', 'overtime': '20.25', 'currency': 1})
            self.assertEqual(Decimal(str(payroll['net_salary'])), Decimal('1010.00'))
        category = self.post('expense-categories', {'name': 'Audit utilities'})
        expense = self.post('expenses', {'category': category['id'], 'amount': '125.50', 'currency': 1, 'expense_date': now.isoformat(), 'payment_method': 'cash', 'description': 'Audit expense'})
        with self.subTest(section='equipment'):
            equipment = self.post('equipment', {'name': 'Audit machine', 'quantity': '2', 'unit_cost': '100.25', 'currency': 1, 'acquisition_type': 'new_purchase', 'acquired_date': date, 'assigned_to': employee['id'], 'payment_method': 'cash'})
        with self.subTest(section='equipment-depreciation'):
            self.post('equipment-depreciation', {'equipment': equipment['id'], 'year': now.year, 'amount': '10.25', 'notes': 'Audit depreciation'})
            updated_equipment = self.client.get(f'/api/equipment/{equipment["id"]}/')
            self.assertEqual(Decimal(str(updated_equipment.data['net_book_value'])), Decimal('190.25'))
        with self.subTest(section='loan'):
            loan = self.post('loans', {'loaner_type': 'customer', 'customer': customer['id'], 'amount': '500.50', 'currency': 1, 'loan_type': 'loan_out', 'payment_method': 'cash', 'loan_date': now.isoformat()})
            self.post('loan-payments', {'loan': loan['id'], 'amount': '100.25', 'currency': 1, 'payment_method': 'cash', 'payment_date': now.isoformat()})
            response = self.client.get(f'/api/loans/{loan["id"]}/')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(Decimal(str(response.data['amount_paid'])), Decimal('100.25'))
        with self.subTest(section='withdrawal'):
            cash = GLAccount.objects.filter(code='1000', currency=1).first()
            self.post('withdrawals', {'gl_account': cash.pk, 'amount': '20.50', 'currency': 1, 'withdrawal_date': now.isoformat(), 'description': 'Audit owner withdrawal'})
        self.post('accounts', {'account_number': 'AUDIT-CASH-001', 'name': 'Audit cash book', 'currency': 1})
        product = self.post('products', {'name': 'Audit product', 'barcode': 'AUDIT-001', 'description': 'Audit entry'})
        for section, record in [('customers', customer), ('vendors', vendor), ('salesmen', salesman), ('employees', employee), ('expenses', expense), ('products', product)]:
            with self.subTest(section=section, operation='read-update-delete'):
                path = f'/api/{section}/{record["id"]}/'
                self.assertEqual(self.client.get(path).status_code, 200)
                field = 'full_name' if section == 'employees' else 'description' if section == 'expenses' else 'name'
                response = self.client.patch(path, {field: 'Audit updated'}, format='json')
                self.assertEqual(response.status_code, 200, getattr(response, 'data', None))
                self.assertEqual(response.data[field], 'Audit updated')
        # Delete an independent expense and confirm soft-deleted data is no longer public.
        path = f'/api/expenses/{expense["id"]}/'
        self.assertEqual(self.client.delete(path).status_code, 204)
        self.assertEqual(self.client.get(path).status_code, 404)

    def test_manual_journal_and_notifications(self):
        cash = GLAccount.objects.get(code='1000', currency=1)
        equity = GLAccount.objects.get(code='3000', currency=1)
        payload = {
            'entry_date': timezone.now().isoformat(), 'description': 'Audit manual entry',
            'reference_number': 'AUDIT-JE-001',
            'lines': [
                {'gl_account': cash.pk, 'currency': 1, 'debit': '125.50', 'credit': '0'},
                {'gl_account': equity.pk, 'currency': 1, 'debit': '0', 'credit': '125.50'},
            ],
        }
        self.post('journal-entries', payload)
        report = self.client.get('/api/journal-entries/trial_balance/', {'currency': 1})
        self.assertEqual(report.status_code, 200)
        invalid = {**payload, 'lines': [{**payload['lines'][0], 'debit': '100'}, payload['lines'][1]]}
        self.assertEqual(self.client.post('/api/journal-entries/', invalid, format='json').status_code, 400)
        notification = self.post('notifications', {'title': 'Audit alert', 'message': 'Test notification', 'user': self.user.pk, 'notification_type': 'general'})
        read = self.client.post(f'/api/notifications/{notification["id"]}/mark_read/', {}, format='json')
        self.assertEqual(read.status_code, 200)
        self.assertTrue(read.data['is_read'])

    def test_login_and_authenticated_profile(self):
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'localhost'
        response = client.post('/api/login/', {'email': self.user.email, 'password': 'Audit-test-only-583!'}, format='json')
        self.assertEqual(response.status_code, 200, getattr(response, 'data', None))
        token = response.data.get('token')
        self.assertTrue(token)
        client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        self.assertEqual(client.get('/api/profile/').status_code, 200)
        self.assertEqual(client.get('/api/users/').status_code, 200)
        client.credentials()
        self.assertIn(client.get('/api/employees/').status_code, (401, 403))

    def test_registered_section_lists_and_form_metadata(self):
        from api.urls import router
        anonymous = APIClient()
        anonymous.defaults['HTTP_HOST'] = 'localhost'
        for prefix, viewset, _basename in router.registry:
            if '(' in prefix or not hasattr(viewset, 'list'):
                continue
            with self.subTest(section=prefix):
                path = f'/api/{prefix}/'
                response = self.client.get(path, {'page_size': 5})
                self.assertEqual(response.status_code, 200, f'{prefix}: {getattr(response, "data", response.status_code)}')
                self.assertIn(anonymous.get(path).status_code, (401, 403), f'{prefix} requires login')
                metadata = self.client.options(path)
                self.assertEqual(metadata.status_code, 200, f'{prefix} form metadata')
