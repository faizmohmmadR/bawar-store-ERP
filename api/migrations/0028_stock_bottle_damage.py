# Generated manually for stock bottle damage + liquid damaged lines

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0027_damaged_materials'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='damagedmaterialrecord',
            name='source',
            field=models.CharField(
                choices=[('manual', 'Manual packaging'), ('stock_bottle', 'Stock bottle damage')],
                db_index=True,
                default='manual',
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='damagedmaterialitem',
            name='component_type',
            field=models.CharField(
                choices=[
                    ('label', 'Label'),
                    ('plastic', 'Plastic'),
                    ('carton', 'Carton'),
                    ('liquid', 'Liquid'),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='damagedmaterialitem',
            name='raw_material',
            field=models.ForeignKey(
                blank=True,
                help_text='Required for packaging lines; null for liquid spill lines.',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='damaged_items',
                to='api.rawmaterial',
            ),
        ),
        migrations.AlterField(
            model_name='damagedmaterialitem',
            name='quantity_pieces',
            field=models.DecimalField(
                decimal_places=4,
                help_text='Pieces for packaging, or kilograms for liquid.',
                max_digits=12,
            ),
        ),
        migrations.AlterField(
            model_name='damagedmaterialitem',
            name='unit',
            field=models.CharField(
                choices=[('piece', 'Piece'), ('kg', 'Kilogram')],
                default='piece',
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='damagedmaterialitem',
            name='unit_price_afn',
            field=models.DecimalField(
                decimal_places=6,
                default=0,
                help_text='Snapshot unit price in AFN (per piece or per kg).',
                max_digits=18,
            ),
        ),
        migrations.AddField(
            model_name='damagedmaterialitem',
            name='product',
            field=models.ForeignKey(
                blank=True,
                help_text='Finished product whose liquid was damaged (liquid lines).',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='damaged_liquid_items',
                to='api.product',
            ),
        ),
        migrations.CreateModel(
            name='StockBottleDamage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('deleted_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('bottle_count', models.PositiveIntegerField()),
                ('capacity_kg', models.DecimalField(decimal_places=4, default=0, max_digits=12)),
                ('capacity_liters', models.DecimalField(decimal_places=4, default=0, max_digits=12)),
                ('density_kg_per_liter', models.DecimalField(decimal_places=6, default=1, max_digits=10)),
                ('total_liquid_kg', models.DecimalField(decimal_places=4, default=0, max_digits=14)),
                ('total_liquid_liters', models.DecimalField(decimal_places=4, default=0, max_digits=14)),
                ('remaining_liquid_kg', models.DecimalField(decimal_places=4, default=0, max_digits=14)),
                ('remaining_liquid_liters', models.DecimalField(decimal_places=4, default=0, max_digits=14)),
                ('damaged_liquid_kg', models.DecimalField(decimal_places=4, default=0, max_digits=14)),
                ('damaged_liquid_liters', models.DecimalField(decimal_places=4, default=0, max_digits=14)),
                ('liquid_unit_cost_afn', models.DecimalField(
                    decimal_places=6, default=0, help_text='AFN cost per kg of liquid (snapshot).', max_digits=18,
                )),
                ('returned_liquid_cost_afn', models.DecimalField(decimal_places=6, default=0, max_digits=18)),
                ('damaged_liquid_cost_afn', models.DecimalField(decimal_places=6, default=0, max_digits=18)),
                ('bottle_sources', models.JSONField(blank=True, default=list)),
                ('notes', models.TextField(blank=True, default='')),
                ('recorded_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('damaged_record', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='stock_bottle_damages', to='api.damagedmaterialrecord',
                )),
                ('deleted_by', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+', to=settings.AUTH_USER_MODEL,
                )),
                ('performed_by', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='stock_bottle_damages', to=settings.AUTH_USER_MODEL,
                )),
                ('product', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='bottle_damages', to='api.product',
                )),
                ('stock', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='bottle_damages', to='api.stock',
                )),
                ('storage_tank', models.ForeignKey(
                    blank=True,
                    help_text='Destination for remaining (salvaged) liquid. Required when remaining > 0.',
                    null=True, on_delete=django.db.models.deletion.PROTECT,
                    related_name='bottle_liquid_returns', to='api.storagetank',
                )),
            ],
            options={
                'ordering': ['-recorded_at', '-id'],
            },
        ),
    ]
