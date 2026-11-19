from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('api', '0034_employee_sale_salary_settlement'),
    ]

    operations = [
        migrations.AlterField(
            model_name='damagedmaterialrecord',
            name='source',
            field=models.CharField(
                choices=[
                    ('manual', 'Manual packaging'),
                    ('stock_bottle', 'Stock bottle damage'),
                    ('tank_leak', 'Storage tank leak'),
                ],
                db_index=True,
                default='manual',
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name='StorageTankLeak',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('quantity_kg', models.DecimalField(decimal_places=4, max_digits=14)),
                ('quantity_liters', models.DecimalField(decimal_places=4, default=0, max_digits=14)),
                ('density_kg_per_liter', models.DecimalField(decimal_places=6, default=1, max_digits=10)),
                ('unit_cost_afn', models.DecimalField(
                    decimal_places=6,
                    default=0,
                    help_text='AFN cost per kg of liquid at time of leak (snapshot).',
                    max_digits=18,
                )),
                ('total_cost_afn', models.DecimalField(decimal_places=6, default=0, max_digits=18)),
                ('notes', models.TextField(blank=True, default='')),
                ('recorded_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('damaged_record', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='tank_leaks',
                    to='api.damagedmaterialrecord',
                )),
                ('deleted_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('performed_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='storage_tank_leaks',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('storage_tank', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='leaks',
                    to='api.storagetank',
                )),
            ],
            options={
                'ordering': ['-recorded_at', '-id'],
            },
        ),
    ]
