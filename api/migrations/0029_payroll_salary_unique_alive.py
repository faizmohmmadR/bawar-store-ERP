from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0028_stock_bottle_damage'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='payroll',
            name='uniq_payroll_employee_period_type',
        ),
        migrations.AddConstraint(
            model_name='payroll',
            constraint=models.UniqueConstraint(
                condition=models.Q(('deleted_at__isnull', True), ('payroll_type', 'salary')),
                fields=('employee', 'month', 'year', 'period_calendar'),
                name='uniq_payroll_employee_period_salary_alive',
            ),
        ),
    ]
