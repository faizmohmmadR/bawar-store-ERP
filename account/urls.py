from django.urls import path, include
from rest_framework import routers
from account.views import (
    LoginView,
    ChangePasswordView,
    UserProfileView,
    RegisterView,
    UserViewSet,
)
from account.backup import (
    backup_database,
    restore_database,
    list_backups,
    delete_backup,
    download_backup,
    run_maintenance_endpoint,
)
from knox import views as knox_views


class OptionalSlashRouter(routers.SimpleRouter):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.trailing_slash = '/?'


router = OptionalSlashRouter()
router.register(r'users', UserViewSet, basename='user')

urlpatterns = [
    path("", include(router.urls)),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", knox_views.LogoutView.as_view(), name="logout"),
    path("logoutall/", knox_views.LogoutAllView.as_view(), name="logoutall"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("profile/", UserProfileView.as_view(), name="user-profile"),
    path("backups/create/", backup_database, name="backup_database"),
    path("backups/restore/", restore_database, name="restore_database"),
    path("backups/list/", list_backups, name="list_backups"),
    path("backups/delete/", delete_backup, name="delete_backup"),
    path("backups/download/", download_backup, name="download_backup"),
    path("maintenance/run/", run_maintenance_endpoint, name="run_maintenance"),
]
