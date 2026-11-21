"""Django admin registration for the ERP API app."""
from django.contrib import admin

admin.site.site_header = 'BAWAR Super Store Admin'
admin.site.site_title = 'BAWAR Super Store'
admin.site.index_title = 'Administration'

# Import modules for side-effect @admin.register calls.
from api.admin import journal as _journal  # noqa: F401,E402
from api.admin import register_all as _register_all  # noqa: F401,E402
