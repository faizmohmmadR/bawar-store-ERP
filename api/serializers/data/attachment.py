from rest_framework import serializers

from api.models.data.attachment import AttachedDocument
from api.serializers.data.base import DataRootSerializer
from api.services.attachments import (
    assert_can_write_owner,
    resolve_owner,
    serialize_document,
    unique_document_title,
    validate_document_file,
)


class AttachedDocumentSerializer(DataRootSerializer):
    owner_type = serializers.CharField(write_only=True, required=False)
    object_id = serializers.IntegerField(required=False)
    file_url = serializers.SerializerMethodField()
    content_kind = serializers.SerializerMethodField()

    class Meta:
        model = AttachedDocument
        fields = (
            'id',
            'title',
            'file',
            'file_url',
            'original_name',
            'file_size',
            'content_kind',
            'owner_type',
            'object_id',
            'created_at',
            'updated_at',
        )
        read_only_fields = ('original_name', 'file_size', 'created_at', 'updated_at')
        extra_kwargs = {
            'file': {'write_only': True, 'required': False},
            'title': {'required': False, 'allow_blank': True},
        }

    def get_file_url(self, obj):
        return serialize_document(obj, self.context.get('request')).get('file_url')

    def get_content_kind(self, obj):
        return obj.content_kind

    def to_representation(self, instance):
        return serialize_document(instance, self.context.get('request'))

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get('request')
        uploaded = attrs.get('file')
        if uploaded:
            validate_document_file(uploaded)

        if self.instance is None:
            owner_type = attrs.pop('owner_type', None) or (request.data.get('owner_type') if request else None)
            object_id = attrs.get('object_id') or (request.data.get('object_id') if request else None)
            owner = resolve_owner(owner_type, object_id)
            if request:
                assert_can_write_owner(request.user, owner)
            from django.contrib.contenttypes.models import ContentType

            attrs['content_type'] = ContentType.objects.get_for_model(owner, for_concrete_model=False)
            attrs['object_id'] = owner.pk
            attrs['title'] = unique_document_title(owner, attrs.get('title'))
            if not uploaded:
                raise serializers.ValidationError({'file': 'A file is required.'})
        else:
            attrs.pop('owner_type', None)
            if 'title' in attrs:
                owner = self.instance.content_object
                preferred = (attrs.get('title') or '').strip()
                if owner is not None:
                    attrs['title'] = unique_document_title(
                        owner,
                        preferred or self.instance.title,
                        exclude_id=self.instance.pk,
                    )
                else:
                    attrs['title'] = preferred[:255] or self.instance.title
        return attrs
