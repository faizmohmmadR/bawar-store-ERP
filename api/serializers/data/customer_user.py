from rest_framework import serializers
from account.models import User
from api.serializers.data.base import DataRootSerializer


class CustomerUserSerializer(DataRootSerializer):
    finance = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'password', 'phone', 'first_name', 'last_name',
            'address', 'role', 'is_active',
            'is_buyer', 'is_seller', 'is_finance', 'created_at', 'updated_at', 'finance',
        ]
        read_only_fields = ('username',)
        extra_kwargs = {
            'password': {'write_only': True, 'required': True},
            'username': {'required': False, 'allow_blank': True},
        }

    def get_finance(self, obj):
        return getattr(obj, '_finance_data', None)

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        if not password:
            raise serializers.ValidationError({'password': 'Password is required'})

        validated_data.pop('username', None)
        address = validated_data.pop('address', '')
        role = validated_data.pop('role', 'customer')
        is_buyer = validated_data.pop('is_buyer', False)
        is_seller = validated_data.pop('is_seller', False)
        is_finance = validated_data.pop('is_finance', False)
        is_active = validated_data.pop('is_active', True)

        user = User.objects.create_user(password=password, **validated_data)
        user.address = address
        user.role = role
        user.is_buyer = is_buyer
        user.is_seller = is_seller
        user.is_finance = is_finance
        user.is_active = is_active
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        validated_data.pop('username', None)
        if password:
            instance.set_password(password)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance
