from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0032_allow_multiple_payroll_payments_per_period'),
    ]

    operations = [
        migrations.AddField(
            model_name='payroll',
            name='reference_number',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
    ]
