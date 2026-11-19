from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from unittest.mock import patch

from django.db import close_old_connections, connection, transaction
from django.test import TestCase, TransactionTestCase

from api.models.data.document_number_sequence import DocumentNumberSequence
from api.models.data.products import Product
from api.models.data.raw_materials import RawMaterialPurchase
from api.models.data.vendors import Vendor
from api.services import document_numbers as numbers


class DocumentNumberTests(TestCase):
    def setUp(self):
        timer = patch.object(numbers.timezone, 'now', return_value=datetime(2026, 10, 18, tzinfo=timezone.utc))
        timer.start()
        self.addCleanup(timer.stop)

    def reserve(self, prefix='R'):
        return numbers.next_sequential_document_number(prefix=prefix, model=Product, field='barcode')

    def test_deleted_purchase_number_is_never_reused(self):
        vendor = Vendor.objects.create(name='Supplier')
        first = RawMaterialPurchase.objects.create(vendor=vendor, status='draft', currency=1)
        self.assertEqual(first.invoice_number, 'R26-0001')
        first.soft_delete()
        second = RawMaterialPurchase.objects.create(vendor=vendor, status='draft', currency=1)
        self.assertEqual(second.invoice_number, 'R26-0002')

    def test_reservations_are_unique_before_documents_are_saved(self):
        self.assertEqual([self.reserve() for _ in range(3)], ['R26-0001', 'R26-0002', 'R26-0003'])

    def test_imported_deleted_and_large_numbers_advance_counter(self):
        product = Product.objects.create(name='Imported', barcode='R26-10000')
        product.soft_delete()
        self.assertEqual(self.reserve(), 'R26-10001')
        Product.objects.create(name='Later import', barcode='R26-20000')
        self.assertEqual(self.reserve(), 'R26-20001')

    def test_legacy_case_and_padding_do_not_collide_on_mysql(self):
        Product.objects.create(name='Legacy casing', barcode='r26-0001 ')
        self.assertEqual(self.reserve(), 'R26-0002')

    def test_hard_deletion_cannot_reset_reserved_sequence(self):
        product = Product.objects.create(name='Temporary', barcode=self.reserve())
        product.delete()
        self.assertEqual(self.reserve(), 'R26-0002')

    def test_legacy_purchase_prefixes_are_included(self):
        Product.objects.create(name='Legacy', barcode='PUR-2026-0099')
        Product.objects.create(name='Previous prefix', barcode='P26-0100')
        self.assertEqual(self.reserve(), 'R26-0101')

    def test_sequences_are_separate_by_document_type_and_year(self):
        self.assertEqual(self.reserve('R'), 'R26-0001')
        self.assertEqual(self.reserve('S'), 'S26-0001')
        with patch.object(numbers.timezone, 'now', return_value=datetime(2027, 1, 1, tzinfo=timezone.utc)):
            self.assertEqual(self.reserve('R'), 'R27-0001')

    def test_all_section_allocators_reserve_numbers(self):
        allocators = [numbers.allocate_sale_invoice_number, numbers.allocate_raw_material_purchase_invoice_number,
                      numbers.allocate_raw_material_process_number, numbers.allocate_equipment_serial_number,
                      numbers.allocate_stock_transfer_number, numbers.allocate_batch_number,
                      numbers.allocate_return_number, numbers.allocate_packing_number]
        values = [allocator() for allocator in allocators for _ in range(2)]
        self.assertEqual(len(set(values)), 18)
        self.assertEqual(DocumentNumberSequence.objects.count(), 9)

    def test_rollback_releases_only_uncommitted_reservation(self):
        with self.assertRaises(ValueError), transaction.atomic():
            self.reserve()
            raise ValueError('Abort transaction')
        self.assertEqual(self.reserve(), 'R26-0001')


class ConcurrentMySQLDocumentNumbersTests(TransactionTestCase):
    def test_parallel_reservations_are_unique(self):
        if connection.vendor != 'mysql':
            self.skipTest('Requires live MySQL/MariaDB row locks')

        def reserve(_):
            close_old_connections()
            try:
                return numbers.next_sequential_document_number(prefix='R', model=Product, field='barcode')
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=4) as executor:
            values = list(executor.map(reserve, range(12)))
        self.assertEqual(len(set(values)), 12)
