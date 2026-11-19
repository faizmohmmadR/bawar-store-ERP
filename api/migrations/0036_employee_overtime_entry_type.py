from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0035_storage_tank_leak'),
    ]

    operations = [
        migrations.AddField(
            model_name='employeeovertimeentry',
            name='entry_type',
            field=models.CharField(
                choices=[('overtime', 'Overtime'), ('other', 'Other')],
                default='overtime',
                help_text='Overtime or other addition; both amounts add to net salary.',
                max_length=16,
            ),
        ),
    ]
