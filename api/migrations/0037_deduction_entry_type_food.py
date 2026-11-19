from decimal import Decimal

from django.db import migrations, models


def forwards(apps, schema_editor):
    Overtime = apps.get_model('api', 'EmployeeOvertimeEntry')
    Absence = apps.get_model('api', 'EmployeeAbsenceEntry')

    for row in Overtime.objects.filter(entry_type='other'):
        Absence.objects.create(
            employee_id=row.employee_id,
            entry_type='food',
            absence_date=row.work_date,
            days=Decimal('0'),
            amount=row.amount,
            notes=row.notes or '',
            month=row.month,
            year=row.year,
            period_calendar=row.period_calendar,
            currency=row.currency,
            created_at=row.created_at,
            updated_at=row.updated_at,
            deleted_at=row.deleted_at,
        )
        row.delete()


def backwards(apps, schema_editor):
    Overtime = apps.get_model('api', 'EmployeeOvertimeEntry')
    Absence = apps.get_model('api', 'EmployeeAbsenceEntry')

    for row in Absence.objects.filter(entry_type='food'):
        Overtime.objects.create(
            employee_id=row.employee_id,
            entry_type='other',
            work_date=row.absence_date,
            amount=row.amount,
            notes=row.notes or '',
            month=row.month,
            year=row.year,
            period_calendar=row.period_calendar,
            currency=row.currency,
            created_at=row.created_at,
            updated_at=row.updated_at,
            deleted_at=row.deleted_at,
        )
        row.delete()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0036_employee_overtime_entry_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='employeeabsenceentry',
            name='entry_type',
            field=models.CharField(
                choices=[('absence', 'Absence'), ('food', 'Food deduction')],
                default='absence',
                help_text='Absence uses days; food uses a manual amount.',
                max_length=16,
            ),
        ),
        migrations.RunPython(forwards, backwards),
        migrations.RemoveField(
            model_name='employeeovertimeentry',
            name='entry_type',
        ),
    ]
