"""Create a login User for an Employee and keep the two records linked."""

from __future__ import annotations

from rest_framework import serializers

from account.models import User
from api.models.data.employee import Employee


def split_full_name(full_name: str) -> tuple[str, str]:
    parts = (full_name or '').strip().split()
    if not parts:
        return '', ''
    if len(parts) == 1:
        return parts[0], ''
    return parts[0], ' '.join(parts[1:])


def get_employee_for_user(user, *, auto_link: bool = True) -> Employee | None:
    if not user or not getattr(user, 'pk', None):
        return None

    emp = Employee.objects.filter(user_id=user.pk).first()
    if emp:
        return emp

    try:
        profile = user.employee_profile
        if profile:
            return profile
    except Employee.DoesNotExist:
        pass

    if not auto_link:
        return None

    email = (getattr(user, 'email', None) or '').strip().lower()
    if not email:
        return None

    qs = Employee.objects.filter(user__isnull=True, email__iexact=email)
    emp = qs.first()

    if not emp:
        return None

    updated = Employee.objects.filter(pk=emp.pk, user__isnull=True).update(user_id=user.pk)
    if not updated:
        return Employee.objects.filter(user_id=user.pk).first()
    emp.refresh_from_db()
    return emp


def link_employee_to_user(employee: Employee, user: User) -> User:
    """Attach an existing login to an employee record (same email, employee had no user)."""
    if employee.user_id and employee.user_id != user.pk:
        raise serializers.ValidationError({
            'user': 'This employee is already linked to another login account.',
        })
    if Employee.objects.filter(user_id=user.pk).exclude(pk=employee.pk).exists():
        raise serializers.ValidationError({
            'user': 'This login is already linked to another employee.',
        })
    employee.user = user
    employee.save(update_fields=['user', 'updated_at'])
    if not user.is_seller:
        user.is_seller = True
        user.save(update_fields=['is_seller', 'updated_at'])
    return user


def create_user_for_employee(employee: Employee, *, email: str, password: str, actor=None) -> User:
    from account.models import generate_unique_username

    if not employee:
        raise serializers.ValidationError({'employee': 'Employee is required.'})
    if employee.user_id:
        raise serializers.ValidationError({
            'create_account': 'This employee already has a login account.',
        })

    email = (email or employee.email or '').strip().lower()
    if not email:
        raise serializers.ValidationError({'account_email': 'Email is required for the login account.'})
    if not password:
        raise serializers.ValidationError({'account_password': 'Password is required.'})

    if User.objects.filter(email=email).exists():
        existing = User.objects.filter(email__iexact=email).first()
        if existing and not employee.user_id:
            return link_employee_to_user(employee, existing)
        raise serializers.ValidationError({'account_email': 'This email is already in use.'})

    username = generate_unique_username(email)

    first_name, last_name = split_full_name(employee.full_name)

    user = User(
        username=username,
        email=email,
        first_name=first_name,
        last_name=last_name,
        phone=(employee.phone or '')[:15] or None,
        role='employee',
        is_active=True,
        is_admin=False,
        is_superuser=False,
        is_staff=False,
        is_seller=True,
        is_buyer=False,
        is_finance=False,
    )
    user.set_password(password)
    user.save()
    # No default section permissions — assign via User Permissions after create.

    employee.user = user
    employee.save(update_fields=['user', 'updated_at'])
    return user
