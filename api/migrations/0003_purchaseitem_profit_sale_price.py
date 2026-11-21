from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0002_sale_optional_party'),
    ]

    operations = [
        migrations.AddField(
            model_name='purchaseitem',
            name='profit_percent',
            field=models.DecimalField(
                decimal_places=4,
                default=0,
                help_text='Markup % over purchase unit cost used to derive sale_price.',
                max_digits=8,
            ),
        ),
        migrations.AddField(
            model_name='purchaseitem',
            name='sale_price',
            field=models.DecimalField(
                decimal_places=6,
                default=0,
                help_text='Target retail selling price per this packaging unit (purchase currency).',
                max_digits=18,
            ),
        ),
    ]
