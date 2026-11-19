"""Verify staged restores preserve data and refuse incompatible backups."""
import sqlite3
import tempfile
import unittest
from pathlib import Path

from scripts.rebuild_sqlite_backup import copy_current_data, snapshot


class SQLiteBackupRebuildTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.source = Path(self.temporary.name, 'source.sqlite3')
        self.target = Path(self.temporary.name, 'target.sqlite3')
        for path in (self.source, self.target):
            with sqlite3.connect(path) as db:
                db.executescript('''
                    CREATE TABLE django_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);
                    CREATE TABLE parent (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE);
                    CREATE TABLE child (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_id INTEGER REFERENCES parent(id), amount DECIMAL);
                    INSERT INTO django_migrations (name) VALUES ('current_initial');
                ''')
        with sqlite3.connect(self.source) as db:
            db.executescript('''
                INSERT INTO parent VALUES (7, 'Restored');
                INSERT INTO child VALUES (2, 7, 1.2345);
                INSERT INTO parent VALUES (50, 'Deleted record');
                DELETE FROM parent WHERE id = 50;
                UPDATE django_migrations SET name = 'old_migrations';
            ''')

    def test_preserves_rows_relations_sequences_and_new_migration_history(self):
        report = copy_current_data(self.source, self.target)
        self.assertEqual(report, {'child': 1, 'parent': 1})
        with sqlite3.connect(self.target) as db:
            self.assertEqual(db.execute('SELECT name FROM django_migrations').fetchone()[0], 'current_initial')
            self.assertEqual(db.execute('SELECT * FROM child').fetchone(), (2, 7, 1.2345))
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
            self.assertEqual(db.execute("INSERT INTO parent(name) VALUES ('New')").lastrowid, 51)

    def test_schema_mismatch_fails_without_changing_target(self):
        with sqlite3.connect(self.target) as db:
            db.execute('ALTER TABLE parent ADD COLUMN new_field TEXT')
        with self.assertRaisesRegex(RuntimeError, 'Column mismatch'):
            copy_current_data(self.source, self.target)
        with sqlite3.connect(self.target) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM child').fetchone()[0], 0)

    def test_broken_relationships_roll_back_restore(self):
        with sqlite3.connect(self.source) as db:
            db.execute('UPDATE child SET parent_id = 999')
        with self.assertRaisesRegex(RuntimeError, 'foreign key violations'):
            copy_current_data(self.source, self.target)
        with sqlite3.connect(self.target) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM parent').fetchone()[0], 0)

    def test_consistent_snapshot_does_not_change_source(self):
        destination = Path(self.temporary.name, 'snapshot.sqlite3')
        snapshot(self.source, destination)
        with sqlite3.connect(destination) as db:
            self.assertEqual(db.execute('SELECT name FROM parent').fetchall(), [('Restored',)])

    def test_merge_preserves_existing_rows_and_current_migrations(self):
        from account.sqlite_restore import merge_backup
        with sqlite3.connect(self.target) as db:
            db.execute("INSERT INTO parent VALUES (7, 'Current name')")
        self.assertEqual(merge_backup(self.source, self.target, {'parent', 'child'}), 1)
        with sqlite3.connect(self.target) as db:
            self.assertEqual(db.execute('SELECT name FROM parent WHERE id=7').fetchone()[0], 'Current name')
            self.assertEqual(db.execute('SELECT name FROM django_migrations').fetchone()[0], 'current_initial')

    def test_merge_invalid_relations_rolls_back_all_insertions(self):
        from account.sqlite_restore import merge_backup
        with sqlite3.connect(self.source) as db:
            db.execute('UPDATE child SET parent_id=999')
        with self.assertRaisesRegex(ValueError, 'broken relationships'):
            merge_backup(self.source, self.target, {'parent', 'child'})
        with sqlite3.connect(self.target) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM parent').fetchone()[0], 0)
