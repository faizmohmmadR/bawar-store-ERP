# Restore the upgraded SQLite backup into MySQL

The supplied SQLite backup has already been restored and upgraded in `db.sqlite3`. Use that upgraded database as the export source. A SQLite `.db` file is not a MySQL SQL dump, and cannot be uploaded directly through the MySQL backup restore screen.

Run the following from the project root. Pause application writes during export and keep the target application offline until import finishes.

1. Export the restored SQLite database:

   ```bash
   DEBUG=False DB_ENGINE=sqlite venv/bin/python scripts/transfer_database.py export \
     --output backups/mysql-transfer.json
   ```

   Choose a new filename if it exists. The file contains personal information, password hashes and tokens; keep it private. Soft-deleted rows and accounting history are included.

2. Create a **new, dedicated database** using your MySQL administrator:

   ```sql
   CREATE DATABASE mirbatzada_restored
     CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
   ```

   Give your application's MySQL user access to this new database. The binary collation preserves case-sensitive distinctions from SQLite.

3. Set the backend root `.env` connection values (not `frontend/.env`):

   ```dotenv
   DB_ENGINE=mysql
   DB_NAME=mirbatzada_restored
   DB_USER=your_mysql_user
   DB_PASSWORD=your_mysql_password
   DB_HOST=127.0.0.1
   DB_PORT=3306
   ```

4. Create the schema, import and check:

   ```bash
   DEBUG=False DB_ENGINE=mysql venv/bin/python manage.py migrate
   DEBUG=False DB_ENGINE=mysql venv/bin/python scripts/transfer_database.py import \
     --input backups/mysql-transfer.json --replace-data
   DEBUG=False DB_ENGINE=mysql venv/bin/python manage.py check
   ```

   **The import deletes application data in the selected target database before loading the export. Use the new database above.** It leaves migration history and generated content-type/permission metadata in place. Deletion and loading run within a transaction; failures roll back the target data. Database tables must use a transactional engine such as InnoDB.

   Accounting signals are suppressed during import, so saved journal entries are loaded without generating duplicate postings. The script checks exported model row counts and foreign-key relationships before committing. Password hashes and IDs are retained. The SQLite source remains unchanged.

5. Keep `media/` alongside the backend. If moving to another server, copy that directory too; attachments are files, not part of the database export. Restart the backend after selecting MySQL and check login, inventory balances and accounting reports.

## Verification performed

Exported the restored development SQLite database and imported the export into a fresh, isolated SQLite database using the same import function. Compared exported records and values, normalizing equivalent timestamp representations. This tests fixture handling, metadata references and suppressed accounting signals. No MySQL server was accessed; MySQL migrations and import must still be verified on your target server.
