from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.translation import gettext_lazy as _
from .models import User, generate_unique_username


class AdminUserCreationForm(forms.ModelForm):
    password1 = forms.CharField(label=_("Password"), widget=forms.PasswordInput)
    password2 = forms.CharField(
        label=_("Password confirmation"), widget=forms.PasswordInput
    )

    class Meta:
        model = User
        fields = (
            "email",
            "phone",
            "first_name",
            "last_name",
            "is_buyer",
            "is_seller",
            "is_admin",
        )

    def clean_password2(self):
        password1 = self.cleaned_data.get("password1")
        password2 = self.cleaned_data.get("password2")
        if password1 and password2 and password1 != password2:
            raise forms.ValidationError(_("The two password fields didn’t match."))
        return password2

    def save(self, commit=True):
        user = super().save(commit=False)
        user.set_password(self.cleaned_data["password1"])
        if not user.username:
            user.username = generate_unique_username(user.email)
        if commit:
            user.save()
        return user


class UserAdmin(BaseUserAdmin):
    add_form = AdminUserCreationForm
    list_display = (
        "id",
        "email",
        "first_name",
        "last_name",
        "phone",
        "is_admin",
        "is_active",
    )
    list_filter = ("is_admin", "is_active", "is_superuser")
    search_fields = ("username", "email", "phone", "first_name", "last_name")
    ordering = ("id",)
    filter_horizontal = ()

    fieldsets = (
        (
            _("Personal Info"),
            {
                "fields": (
                    "email",
                    "phone",
                    "first_name",
                    "last_name",
                    "profile_picture",
                    "role",
                )
            },
        ),
        (
            _("Permissions"),
            {
                "fields": (
                    "is_active",
                    "is_admin",
                    "is_superuser",
                    "is_staff",
                )
            },
        ),
        (_("Important Dates"), {"fields": ("last_login", "created_at", "updated_at")}),
    )

    readonly_fields = ("created_at", "updated_at", "last_login")

    add_fieldsets = (
        (
            _("Create New User"),
            {
                "classes": ("wide",),
                "fields": (
                    "email",
                    "phone",
                    "first_name",
                    "last_name",
                    "is_buyer",
                    "is_seller",
                    "is_admin",
                    "password1",
                    "password2",
                ),
            },
        ),
    )

    def save_model(self, request, obj, form, change):
        if not (obj.username or "").strip() and obj.email:
            obj.username = generate_unique_username(obj.email, exclude_pk=obj.pk)
        super().save_model(request, obj, form, change)

    def get_queryset(self, request):
        """Ensure only superusers can see all users."""
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(is_admin=False)


# Register the model
admin.site.register(User, UserAdmin)

# Keep branding consistent even if api.admin loads later/earlier.
admin.site.site_header = 'BAWAR Super Store Admin'
admin.site.site_title = 'BAWAR Super Store'
admin.site.index_title = 'Administration'
