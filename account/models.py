import re
from uuid import uuid4

from django.db import models
from django.contrib.auth.models import BaseUserManager, AbstractBaseUser


def generate_unique_username(email: str, *, exclude_pk=None) -> str:
    """Internal unique username derived from email. Login still uses email."""
    email = (email or '').strip().lower()
    local = email.split('@')[0] if email else ''
    local = re.sub(r'[^a-z0-9._-]+', '', local).strip('._-') or 'user'
    base = local[:80]
    qs = User.objects.all()
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    candidate = base
    n = 0
    while qs.filter(username__iexact=candidate).exists():
        n += 1
        suffix = f'.{n}'
        candidate = f'{base[:255 - len(suffix)]}{suffix}'
        if n > 50:
            candidate = f'{base[:40]}.{uuid4().hex[:8]}'
            break
    return candidate[:255]


# Custom User Manager
class UserManager(BaseUserManager):
    def create_user(
        self,
        email,
        username=None,
        phone=None,
        first_name=None,
        last_name=None,
        password=None,
    ):
        if not email:
            raise ValueError("User must have an email")
        email = self.normalize_email(email)
        username = (username or '').strip().lower() or generate_unique_username(email)
        user = self.model(
            username=username,
            email=email,
            phone=phone,
            first_name=first_name,
            last_name=last_name,
        )
        if not password:
            raise ValueError("Users must have a password.")
        user.set_password(password)
        user.save(using=self._db)
        return user
        
    def create_superuser(self, email, username=None, password=None):
        if not email:
            raise ValueError('Superusers must have an email.')
        if not password:
            raise ValueError('Superusers must have a password.')

        email = self.normalize_email(email)
        if self.model.objects.filter(email=email).exists():
            raise ValueError(
                f"Email '{email}' is already registered. "
                f"Use: python manage.py ensure_superuser --email {email}"
            )

        user = self.create_user(email=email, username=username, password=password)
        user.is_admin = user.is_staff = user.is_superuser = True
        user.save(using=self._db)
        return user

class User(AbstractBaseUser):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('staff', 'Staff'),
        ('employee', 'Employee'),
        ('customer', 'Customer'),
        ('vendor', 'Vendor'),
    ]
    
    username = models.CharField(verbose_name="username", max_length=255, unique=True)
    email = models.EmailField(verbose_name="email address", max_length=255, unique=True)
    phone = models.CharField(max_length=15, blank=True, null=True)
    first_name = models.CharField(max_length=200, null=True, blank=True)
    last_name = models.CharField(max_length=200, null=True, blank=True)
    profile_picture = models.ImageField(upload_to="authors/", blank=True, null=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='staff')
    address = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    is_admin = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)
    is_staff = models.BooleanField(default=False)
    is_buyer = models.BooleanField(default=False)
    is_seller = models.BooleanField(default=False)
    is_finance = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    objects = UserManager()
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    
    def __str__(self):
        return f"{self.first_name or ''} {self.last_name or ''}".strip()
        
    def has_perm(self, perm, obj=None):
        """HQ admin/superuser have all permissions."""
        return self.is_hq
        
    def has_module_perms(self, app_label):
        """HQ admin/superuser have permissions to view any app."""
        return self.is_hq

    @property
    def is_hq(self) -> bool:
        return bool(self.is_superuser)
    
    def has_permission(self, permission_codename):
        """Check if user has a specific permission"""
        if self.is_hq:
            return True
        
        try:
            from api.models.data.permissions import UserPermission, Permission
            permission = Permission.objects.get(codename=permission_codename)
            user_permission = UserPermission.objects.get(user=self, permission=permission)
            return user_permission.granted
        except (Permission.DoesNotExist, UserPermission.DoesNotExist):
            return False
    
    def get_permissions(self):
        """Get all permissions for this user"""
        if self.is_hq:
            from api.models.data.permissions import Permission
            return list(Permission.objects.values_list('codename', flat=True))
        
        from api.models.data.permissions import UserPermission
        return list(
            UserPermission.objects.filter(user=self, granted=True)
            .values_list('permission__codename', flat=True)
        )