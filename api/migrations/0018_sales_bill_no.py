from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0017_alter_packingruncomponent_component_type_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='sales',
            name='bill_no',
            field=models.CharField(
                blank=True,
                null=True,
                max_length=100,
                help_text='Optional external bill/reference number',
            ),
        ),
    ]
