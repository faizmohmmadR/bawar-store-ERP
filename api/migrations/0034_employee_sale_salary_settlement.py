from django.db import migrations, models
import django.db.models.deletion


CONSTRAINT = 'sale_exactly_one_party'
TABLE = 'api_sales'


def _drop_sale_party_check(apps, schema_editor):
    connection = schema_editor.connection
    quote = connection.ops.quote_name
    with connection.cursor() as cursor:
        if connection.vendor == 'mysql':
            cursor.execute(
                """
                SELECT CONSTRAINT_NAME
                FROM information_schema.TABLE_CONSTRAINTS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = %s
                  AND CONSTRAINT_TYPE = 'CHECK'
                  AND CONSTRAINT_NAME = %s
                """,
                [TABLE, CONSTRAINT],
            )
            if not cursor.fetchone():
                return
            # MariaDB rejects `DROP CHECK` (1064). Use `DROP CONSTRAINT`, which
            # MariaDB and MySQL 8.0.19+ both accept for CHECK constraints.
            cursor.execute(
                f'ALTER TABLE {quote(TABLE)} DROP CONSTRAINT {quote(CONSTRAINT)}'
            )
            return
        if connection.vendor == 'sqlite':
            # SQLite recreates table via state ops; nothing to do here.
            return
        if connection.vendor == 'postgresql':
            cursor.execute(
                f'ALTER TABLE {quote(TABLE)} DROP CONSTRAINT IF EXISTS {quote(CONSTRAINT)}'
            )


def _noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0033_payroll_reference_number'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveConstraint(
                    model_name='sales',
                    name='sale_exactly_one_party',
                ),
            ],
            database_operations=[
                migrations.RunPython(_drop_sale_party_check, _noop),
            ],
        ),
        migrations.AddField(
            model_name='sales',
            name='employee',
            field=models.ForeignKey(
                blank=True,
                help_text='When set, this sale settles against the employee salary (goods as paid salary).',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='product_sales',
                to='api.employee',
            ),
        ),
        migrations.AddField(
            model_name='payroll',
            name='source_sale',
            field=models.OneToOneField(
                blank=True,
                help_text='When set, this payroll is the salary settlement for that employee product sale.',
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='salary_settlement',
                to='api.sales',
            ),
        ),
        migrations.AlterField(
            model_name='payroll',
            name='payment_method',
            field=models.CharField(
                choices=[
                    ('cash', 'Cash'),
                    ('bank', 'Bank'),
                    ('sarafi', 'Sarafi'),
                    ('goods', 'Goods (sale settlement)'),
                ],
                default='cash',
                help_text='Cash book credited when payroll is posted; goods skips cash (sale settles wages).',
                max_length=20,
            ),
        ),
        migrations.AddConstraint(
            model_name='sales',
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(('customer__isnull', False), ('vendor__isnull', True), ('employee__isnull', True))
                    | models.Q(('customer__isnull', True), ('vendor__isnull', False), ('employee__isnull', True))
                    | models.Q(('customer__isnull', True), ('vendor__isnull', True), ('employee__isnull', False))
                ),
                name='sale_exactly_one_party',
            ),
        ),
    ]
