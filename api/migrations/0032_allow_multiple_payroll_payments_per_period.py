from django.db import migrations


CONSTRAINT = 'uniq_payroll_employee_period_salary_alive'
OLD_INDEX = 'uniq_payroll_employee_period_type'
TABLE = 'api_payroll'


def _drop_period_uniques(apps, schema_editor):
    """Drop salary-period uniqueness so many settlement payments are allowed."""
    connection = schema_editor.connection
    quote = connection.ops.quote_name
    with connection.cursor() as cursor:
        if connection.vendor == 'mysql':
            for index_name in (CONSTRAINT, OLD_INDEX):
                cursor.execute(
                    """
                    SELECT 1
                    FROM information_schema.statistics
                    WHERE table_schema = DATABASE()
                      AND table_name = %s
                      AND index_name = %s
                    LIMIT 1
                    """,
                    [TABLE, index_name],
                )
                if cursor.fetchone():
                    cursor.execute(
                        f'ALTER TABLE {quote(TABLE)} DROP INDEX {quote(index_name)}'
                    )
            return
        if connection.vendor == 'sqlite':
            cursor.execute(f'DROP INDEX IF EXISTS {CONSTRAINT}')
            cursor.execute(f'DROP INDEX IF EXISTS {OLD_INDEX}')
            return
        if connection.vendor == 'postgresql':
            for name in (CONSTRAINT, OLD_INDEX):
                cursor.execute(
                    f'ALTER TABLE {quote(TABLE)} DROP CONSTRAINT IF EXISTS {quote(name)}'
                )
                cursor.execute(f'DROP INDEX IF EXISTS {quote(name)}')


def _noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0031_employee_overtime_absence_entries'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveConstraint(
                    model_name='payroll',
                    name='uniq_payroll_employee_period_salary_alive',
                ),
            ],
            database_operations=[
                migrations.RunPython(_drop_period_uniques, _noop),
            ],
        ),
    ]
