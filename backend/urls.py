from django.contrib import admin
from django.http import HttpResponseNotFound
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static


def hidden_admin_decoy(_request):
    """Public /admin/ stays dark — no login page, no redirect to the real path."""
    return HttpResponseNotFound("<h1>Not Found</h1><p>The requested resource was not found on this server.</p>")


_admin_path = f"{settings.ADMIN_URL_PATH.strip('/')}/"

urlpatterns = [
    # Real admin (obscured path from ADMIN_URL_PATH). Not removed — only hidden.
    path(_admin_path, admin.site.urls),
    # Decoy: classic /admin/ looks missing.
    path("admin/", hidden_admin_decoy),
    path("admin", hidden_admin_decoy),
    path("api/", include("api.urls")),
    path("api/", include("account.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
