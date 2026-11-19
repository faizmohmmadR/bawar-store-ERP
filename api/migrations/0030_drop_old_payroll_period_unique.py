from django.db import migrations


OLD_INDEX = 'uniq_payroll_employee_period_type'
TABLE = 'api_payroll'


def _drop_old_unique(apps, schema_editor):
    """Remove legacy unique key that blocked multiple advances per period."""
    connection = schema_editor.connection
    quote = connection.ops.quote_name
    with connection.cursor() as cursor:
        if connection.vendor == 'mysql':
            cursor.execute(
                """
                SELECT 1
                FROM information_schema.statistics
                WHERE table_schema = DATABASE()
                  AND table_name = %s
                  AND index_name = %s
                LIMIT 1
                """,
                [TABLE, OLD_INDEX],
            )
            if cursor.fetchone():
                cursor.execute(
                    f'ALTER TABLE {quote(TABLE)} DROP INDEX {quote(OLD_INDEX)}'
                )
            return
        if connection.vendor == 'sqlite':
            cursor.execute(f'DROP INDEX IF EXISTS {OLD_INDEX}')
            return
        if connection.vendor == 'postgresql':
            cursor.execute(
                f'ALTER TABLE {quote(TABLE)} DROP CONSTRAINT IF EXISTS {quote(OLD_INDEX)}'
            )
            cursor.execute(f'DROP INDEX IF EXISTS {quote(OLD_INDEX)}')


def _noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0029_payroll_salary_unique_alive'),
    ]

    operations = [
        migrations.RunPython(_drop_old_unique, _noop),
    ]
