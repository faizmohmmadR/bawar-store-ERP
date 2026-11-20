from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0001_initial'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='sales',
            name='sale_exactly_one_party',
        ),
        migrations.AddConstraint(
            model_name='sales',
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(customer__isnull=True, vendor__isnull=True, employee__isnull=True)
                    | models.Q(customer__isnull=False, vendor__isnull=True, employee__isnull=True)
                    | models.Q(customer__isnull=True, vendor__isnull=False, employee__isnull=True)
                    | models.Q(customer__isnull=True, vendor__isnull=True, employee__isnull=False)
                ),
                name='sale_at_most_one_party',
            ),
        ),
    ]
