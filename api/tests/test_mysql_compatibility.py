from decimal import Decimal
from importlib import import_module
from types import SimpleNamespace
from unittest.mock import patch
import warnings

from django.apps import apps
from django.db import IntegrityError, connections, transaction
from django.test import SimpleTestCase, TestCase

from api.models.data.products import Product
from api.serializers.data.products import ProductSerializer


class MySQLModelChecksTests(SimpleTestCase):
    def test_all_models_have_no_backend_compatibility_issues(self):
        import pymysql
        pymysql.install_as_MySQLdb()
        from django.db.backends.mysql.base import DatabaseWrapper
        for version in ('8.0.36', '10.11.6-MariaDB'):
            with self.subTest(version=version):
                config = dict(connections['default'].settings_dict)
                config.update(ENGINE='django.db.backends.mysql', NAME='offline_audit', OPTIONS={})
                database = DatabaseWrapper(config, alias='mysql_audit')
                database.mysql_server_data = {
                    'version': version, 'sql_mode': 'STRICT_TRANS_TABLES',
                    'default_storage_engine': 'InnoDB', 'sql_auto_is_null': False,
                    'lower_case_table_names': 0, 'has_zoneinfo_database': True,
                }
                connections['mysql_audit'] = database
                try:
                    with patch.object(database, 'ensure_connection', side_effect=AssertionError('Must remain offline')):
                        issues = [issue for model in apps.get_models() for issue in model.check(databases=['mysql_audit'])]
                    self.assertEqual(issues, [])
                finally:
                    del connections['mysql_audit']

    def test_packing_decimal_bounds_use_decimals_without_warnings(self):
        from api.serializers.data import packing
        with warnings.catch_warnings():
            warnings.simplefilter('error', UserWarning)
            import_module('importlib').reload(packing)
        from rest_framework.serializers import BaseSerializer, DecimalField
        for value in vars(packing).values():
            if isinstance(value, type) and issubclass(value, BaseSerializer) and hasattr(value, '_declared_fields'):
                for field in value._declared_fields.values():
                    if isinstance(field, DecimalField) and field.min_value is not None:
                        self.assertIsInstance(field.min_value, Decimal)


class ProductBarcodeCompatibilityTests(TestCase):
    def test_multiple_empty_barcodes_are_stored_as_null(self):
        first = Product.objects.create(name='First', barcode='')
        second = Product.objects.create(name='Second', barcode='')
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertIsNone(first.barcode)
        self.assertIsNone(second.barcode)

    def test_database_rejects_duplicate_nonempty_barcodes(self):
        Product.objects.create(name='First', barcode='CODE-1')
        with self.assertRaises(IntegrityError), transaction.atomic():
            Product.objects.create(name='Second', barcode='CODE-1')

    def test_serializer_normalizes_blank_and_rejects_deleted_duplicates(self):
        existing = Product.objects.create(name='Deleted', barcode='USED-1')
        existing.soft_delete()
        serializer = ProductSerializer(data={'name': 'New', 'barcode': 'USED-1'})
        self.assertFalse(serializer.is_valid())
        self.assertIn('barcode', serializer.errors)
        for value in ('', '   ', None):
            serializer = ProductSerializer(data={'name': 'Without barcode', 'barcode': value})
            self.assertTrue(serializer.is_valid(), serializer.errors)
            self.assertIsNone(serializer.save().barcode)

    def test_edit_preserves_own_barcode_and_allows_clearing_it(self):
        product = Product.objects.create(name='Original', barcode='OWN-1')
        serializer = ProductSerializer(product, data={'barcode': 'OWN-1'}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        serializer = ProductSerializer(product, data={'barcode': ''}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        product.refresh_from_db()
        self.assertIsNone(product.barcode)

    def test_migration_normalizes_legacy_blank_barcodes(self):
        # Bulk insertion emulates legacy/raw fixture data without model.save().
        Product.objects.bulk_create([Product(name='Legacy', barcode='')])
        migration = import_module('api.migrations.0002_mysql_product_barcode_uniqueness')
        migration.normalize_missing_barcodes(apps, SimpleNamespace(connection=connections['default']))
        self.assertIsNone(Product.objects.get(name='Legacy').barcode)
