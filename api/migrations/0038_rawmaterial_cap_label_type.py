# Generated manually for cap_label raw material type

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0037_deduction_entry_type_food'),
    ]

    operations = [
        migrations.AlterField(
            model_name='rawmaterial',
            name='material_type',
            field=models.CharField(
                choices=[
                    ('bottle', 'Bottle'),
                    ('bottle_with_cap', 'Bottle with cap'),
                    ('cap', 'Cap'),
                    ('cap_label', 'Cap label'),
                    ('label', 'Label (single)'),
                    ('label_double', 'Label (double)'),
                    ('plastic', 'Plastic'),
                    ('carton', 'Carton'),
                    ('carton_plastic', 'Carton plastic'),
                    ('chemistry', 'Chemistry'),
                    ('boiler', 'Boiler'),
                    ('other', 'Other'),
                ],
                db_index=True,
                default='chemistry',
                max_length=20,
            ),
        ),
    ]
