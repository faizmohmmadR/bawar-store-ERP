# Cap label as its own packing component type

from django.db import migrations, models


COMPONENT_CHOICES = [
    ('bottle', 'Bottle'),
    ('cap', 'Cap'),
    ('cap_label', 'Cap label'),
    ('label', 'Label'),
    ('plastic', 'Plastic'),
    ('carton', 'Carton'),
    ('carton_plastic', 'Carton plastic'),
]

COMPONENT_WITH_RETURNED = COMPONENT_CHOICES + [
    ('returned_carton', 'Returned bottle carton'),
]

OUTPUT_CHOICES = COMPONENT_WITH_RETURNED + [
    ('returned_bottle', 'Returned bottles'),
]


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0038_rawmaterial_cap_label_type'),
    ]

    operations = [
        migrations.AlterField(
            model_name='packingruncomponent',
            name='component_type',
            field=models.CharField(choices=COMPONENT_WITH_RETURNED, max_length=20),
        ),
        migrations.AlterField(
            model_name='packingrunoutput',
            name='component_type',
            field=models.CharField(choices=OUTPUT_CHOICES, max_length=20),
        ),
    ]
