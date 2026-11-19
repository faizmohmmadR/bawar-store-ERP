from rest_framework import generics, status, permissions, viewsets
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.contrib.auth import login

from account.serializers import (
    UserSerializer,
    LoginSerializer,
    ChangePasswordSerializer,
    RegisterSerializer,
)
from account.permissions import IsSuperUser, HasPermission
from account.models import User
from knox.models import AuthToken
from knox.views import LoginView as KnoxLoginView
from api.views.data.base import DataRootViewSet


class LoginView(KnoxLoginView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = LoginSerializer(
            data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]

        # Login the user
        login(request, user)
        # Generate Knox token
        token_instance, token = AuthToken.objects.create(user)

        # Specify the fields you want to return
        user_data = {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "phone": user.phone,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "role": user.role,
            "address": user.address,
            "profile_picture": user.profile_picture.url if user.profile_picture else None,
            "is_buyer": user.is_buyer,
            "is_seller": user.is_seller,
            "is_finance": user.is_finance,
            "is_admin": user.is_admin,
            "is_active": user.is_active,
            "is_staff": user.is_staff,
            "is_superuser": user.is_superuser,
            "permissions": user.get_permissions(),
            "employee_id": None,
            "created_at": user.created_at,
            "updated_at": user.updated_at,
        }

        from api.services.employee_account import get_employee_for_user
        emp = get_employee_for_user(user)
        if emp:
            user_data["employee_id"] = emp.id

        return Response(
            {
                "token": token,
                "user": user_data,
            },
            status=status.HTTP_200_OK,
        )


class UserListView(generics.ListAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated, IsSuperUser]


class UserDetailView(generics.RetrieveAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated, IsSuperUser]


class UserEditView(generics.UpdateAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated, IsSuperUser]

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(
            instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        if getattr(instance, '_prefetched_objects_cache', None):
            # If 'prefetch_related' has been applied to a queryset, we need to
            # forcibly invalidate the prefetch cache on the instance.
            instance._prefetched_objects_cache = {}

        return Response(serializer.data)


class UserDeleteView(generics.DestroyAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated, IsSuperUser]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChangePasswordView(generics.UpdateAPIView):
    serializer_class = ChangePasswordSerializer
    model = User
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, queryset=None):
        return self.request.user

    def update(self, request, *args, **kwargs):
        self.object = self.get_object()
        serializer = self.get_serializer(data=request.data)

        if serializer.is_valid():
            if not self.object.check_password(
                serializer.validated_data.get("current_password")
            ):
                return Response(
                    {"current_password": ["Wrong password."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Change password
            self.object.set_password(
                serializer.validated_data.get("new_password"))
            self.object.save()

            # Invalidate all tokens for the user
            AuthToken.objects.filter(user=self.object).delete()

            return Response(
                {
                    "detail": "Password updated successfully. Please login again with your new password.",
                    "require_login": True,
                },
                status=status.HTTP_200_OK,
            )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        user = self.get_object()
        serializer = self.get_serializer(user, data=request.data, partial=True)

        if serializer.is_valid():
            serializer.save()
            return Response(
                {"detail": "Profile updated successfully", "user": serializer.data},
                status=status.HTTP_200_OK,
            )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [
        permissions.IsAuthenticated, HasPermission('add_users')]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        return Response(
            {
                "detail": "Registration successful! Please check your email.",
                "user": serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )


class UserViewSet(DataRootViewSet):
    queryset = User.objects.all().order_by('-created_at')
    serializer_class = UserSerializer
    search_fields = ['username', 'email', 'first_name', 'last_name', 'phone']
    permission_module = 'users'
    permission_action_map = {
        'list': ['view_users'],
        'retrieve': ['view_users'],
        'create': 'add_users',
        'update': 'edit_users',
        'partial_update': 'edit_users',
        'destroy': 'delete_users',
    }
    filterset_fields = ['role', 'is_active']

    def get_queryset(self):
        qs = super().get_queryset()
        return qs

    def get_object(self):
        obj = super().get_object()
        return obj

    def perform_create(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
        actor = self.request.user
        if instance.pk == actor.pk:
            raise PermissionDenied('You cannot delete your own account.')
        instance.delete()
