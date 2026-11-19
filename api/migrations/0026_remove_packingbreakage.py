from django.db import migrations


def delete_packing_breakage_history(apps, schema_editor):
    database = schema_editor.connection.alias
    content_types = apps.get_model('contenttypes', 'ContentType').objects.using(database)
    content_type = content_types.filter(app_label='api', model='packingbreakage').first()
    if content_type is not None:
        apps.get_model('api', 'JournalEntry').objects.using(database).filter(
            content_type_id=content_type.pk,
        ).delete()
        apps.get_model('api', 'AttachedDocument').objects.using(database).filter(
            content_type_id=content_type.pk,
        ).delete()
        apps.get_model('api', 'ActivityLog').objects.using(database).filter(
            content_type_id=content_type.pk,
        ).delete()
        content_type.delete()

    apps.get_model('api', 'PackingBreakage').objects.using(database).all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0025_rawmaterial_weight_per_piece_kg'),
        ('contenttypes', '0002_remove_content_type_name'),
    ]

    operations = [
        migrations.RunPython(delete_packing_breakage_history, migrations.RunPython.noop),
        migrations.DeleteModel(name='PackingBreakage'),
    ]
