from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.customers import Customer
from api.models.data.sales import Sales
from api.models.data.vendors import Vendor


class TrashBulkActionsTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(email='trash-admin@example.test', password='test-only')
        self.user.is_superuser = self.user.is_staff = True
        self.user.save()
        self.client = APIClient(HTTP_HOST='localhost')
        self.client.force_authenticate(self.user)
        self.customer = Customer.objects.create(name='Deleted customer')
        self.vendor = Vendor.objects.create(name='Deleted vendor')
        self.customer.soft_delete(self.user)
        self.vendor.soft_delete(self.user)
        self.items = [{'model': 'customers', 'id': self.customer.pk}, {'model': 'vendors', 'id': self.vendor.pk}]

    def post(self, action, items=None):
        return self.client.post(f'/api/trash/{action}/', {'items': self.items if items is None else items}, format='json')

    def test_deletes_selected_records_from_different_models(self):
        response = self.post('permanent-delete')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual((response.data['succeeded'], response.data['failed']), (2, 0))
        self.assertFalse(Customer.all_objects.filter(pk=self.customer.pk).exists())
        self.assertFalse(Vendor.all_objects.filter(pk=self.vendor.pk).exists())

    def test_restores_selected_records(self):
        response = self.post('restore')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['succeeded'], 2)
        self.assertTrue(Customer.objects.filter(pk=self.customer.pk).exists())
        self.assertTrue(Vendor.objects.filter(pk=self.vendor.pk).exists())

    def test_reports_missing_or_active_records_without_deleting_them(self):
        active = Customer.objects.create(name='Active')
        response = self.post('permanent-delete', self.items + [{'model': 'customers', 'id': active.pk}])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual((response.data['succeeded'], response.data['failed']), (2, 1))
        self.assertTrue(Customer.objects.filter(pk=active.pk).exists())

    def test_protected_record_does_not_block_other_records(self):
        Sales.objects.create(customer=self.customer, currency=1, total_amount=0)
        response = self.post('permanent-delete')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual((response.data['succeeded'], response.data['failed']), (1, 1))
        self.assertEqual(response.data['errors'][0]['model'], 'customers')
        self.assertTrue(Customer.all_objects.filter(pk=self.customer.pk).exists())
        self.assertFalse(Vendor.all_objects.filter(pk=self.vendor.pk).exists())

    def test_rejects_invalid_empty_duplicate_and_oversized_selections(self):
        for items in ([], [self.items[0]] * 2, [{'model': 'unknown', 'id': 1}],
                      [{'model': 'customers', 'id': n + 1} for n in range(101)]):
            with self.subTest(items_count=len(items)):
                self.assertEqual(self.post('permanent-delete', items).status_code, 400)
        self.assertTrue(Customer.all_objects.filter(pk=self.customer.pk).exists())

    def test_existing_single_record_contract_still_works(self):
        response = self.client.post('/api/trash/permanent-delete/', self.items[0], format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['deleted'])

    def test_rejects_unauthenticated_and_unprivileged_requests(self):
        self.client.force_authenticate(None)
        self.assertIn(self.post('permanent-delete').status_code, (401, 403))
        user = get_user_model().objects.create_user(email='trash-user@example.test', password='test-only')
        self.client.force_authenticate(user)
        self.assertEqual(self.post('permanent-delete').status_code, 403)
        self.assertTrue(Customer.all_objects.filter(pk=self.customer.pk).exists())
