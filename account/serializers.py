from account.models import User
from api.serializers.base import DataRootSerializer
from rest_framework import serializers
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password

HQ_ONLY_USER_FIELDS = (
    'is_superuser',
    'is_staff',
    'is_admin',
)

MANAGER_USER_FIELDS = (
    'role',
    'is_buyer',
    'is_seller',
    'is_finance',
)

PROFILE_WRITABLE_FIELDS = (
    'first_name',
    'last_name',
    'phone',
    'address',
    'profile_picture',
)


def _can_manage_users(user) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if user.is_superuser or user.is_admin:
        return True
    return user.has_permission('add_users') or user.has_permission('edit_users')


class UserSerializer(DataRootSerializer):
    password = serializers.CharField(write_only=True, required=False, style={'input_type': 'password'})
    employee_id = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = "__all__"
        read_only_fields = ('created_at', 'updated_at', 'last_login', 'username')
        extra_kwargs = {
            'username': {'required': False, 'allow_blank': True},
        }

    def get_employee_id(self, obj):
        from api.services.employee_account import get_employee_for_user
        emp = get_employee_for_user(obj)
        return emp.id if emp else None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        if user and user.is_superuser:
            return
        for name in HQ_ONLY_USER_FIELDS:
            if name in self.fields:
                self.fields[name].read_only = True
        if not _can_manage_users(user):
            for name in MANAGER_USER_FIELDS:
                if name in self.fields:
                    self.fields[name].read_only = True

    def validate(self, attrs):
        request = self.context.get('request')
        actor = getattr(request, 'user', None) if request else None
        view = self.context.get('view')
        is_profile = getattr(getattr(view, '__class__', None), '__name__', '') == 'UserProfileView'

        if is_profile or (
            self.instance
            and actor
            and self.instance.pk == actor.pk
            and not _can_manage_users(actor)
        ):
            for key in list(attrs.keys()):
                if key not in PROFILE_WRITABLE_FIELDS and key != 'password':
                    raise serializers.ValidationError(
                        {key: 'You cannot change this field on your profile.'}
                    )
            return super().validate(attrs)

        return super().validate(attrs)

    def create(self, validated_data):
        from account.models import generate_unique_username

        password = validated_data.pop('password', None)
        if not password:
            raise serializers.ValidationError({'password': 'Password is required.'})
        email = (validated_data.get('email') or '').strip()
        if not email:
            raise serializers.ValidationError({'email': 'Email is required.'})
        validated_data.pop('username', None)
        validated_data['username'] = generate_unique_username(email)
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        # New users start with no section permissions; admins assign them explicitly.
        if user.role == 'employee':
            from api.services.employee_account import get_employee_for_user
            get_employee_for_user(user, auto_link=True)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        validated_data.pop('username', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class LoginSerializer(DataRootSerializer):
    email = serializers.EmailField()
    password = serializers.CharField(style={"input_type": "password"})

    class Meta:
        model = User
        fields = ["email", "password"]

    def validate(self, attrs):
        email = attrs.get("email")
        password = attrs.get("password")

        if email and password:
            user = authenticate(
                request=self.context.get("request"), email=email, password=password
            )
            if not user:
                msg = "Invalid credentials"
                raise serializers.ValidationError(msg, code="authorization")
        else:
            msg = 'Must include "email" and "password".'
            raise serializers.ValidationError(msg, code="authorization")

        attrs["user"] = user
        return attrs


class ChangePasswordSerializer(DataRootSerializer):
    current_password = serializers.CharField(
        write_only=True, required=True, style={"input_type": "password"}
    )
    new_password = serializers.CharField(
        write_only=True, required=True, style={"input_type": "password"}
    )

    class Meta:
        model = User
        fields = ["current_password", "new_password"]

    def validate_new_password(self, value):
        validate_password(value)
        return value


class RegisterSerializer(DataRootSerializer):
    password = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = [
            "email",
            "password",
            "first_name",
            "last_name",
            "phone",
            "profile_picture",
            "is_buyer",
            "is_seller",
            "is_finance",
            "role",
            "is_active",
        ]
        extra_kwargs = {
            "profile_picture": {"required": False},
        }

    def create(self, validated_data):
        from account.models import generate_unique_username

        password = validated_data.pop("password")
        email = (validated_data.get("email") or "").strip()
        if not email:
            raise serializers.ValidationError({"email": "Email is required."})
        validated_data["username"] = generate_unique_username(email)
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user
