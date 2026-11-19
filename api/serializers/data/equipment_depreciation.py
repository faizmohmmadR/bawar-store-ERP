from rest_framework import serializers

from api.models.data.equipment import Equipment, EquipmentDepreciation
from api.serializers.data.base import DataRootSerializer


class EquipmentDepreciationSerializer(DataRootSerializer):
    equipment_name = serializers.SerializerMethodField()
    net_book_value_before = serializers.SerializerMethodField()

    class Meta:
        model = EquipmentDepreciation
        fields = [
            'id', 'equipment', 'equipment_name',
            'year', 'amount', 'notes',
            'net_book_value_before',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_equipment_name(self, obj):
        return obj.equipment.name if obj.equipment_id else None

    def get_net_book_value_before(self, obj):
        """NBV before this entry's amount is applied."""
        from decimal import Decimal
        equipment = obj.equipment
        yearly_before = sum(
            Decimal(str(e.amount))
            for e in EquipmentDepreciation.objects.filter(equipment=equipment).exclude(pk=obj.pk)
        )
        opening = Decimal(str(equipment.opening_accumulated_depreciation or 0))
        return str(max(equipment.total_cost - opening - yearly_before, Decimal('0')))

    def validate(self, attrs):
        attrs = super().validate(attrs)
        equipment = attrs.get('equipment') or (self.instance.equipment if self.instance else None)
        year = attrs.get('year') or (self.instance.year if self.instance else None)

        # Prevent editing existing entries
        if self.instance is not None:
            raise serializers.ValidationError(
                'Depreciation entries cannot be edited. Add a new entry for a different year.'
            )

        # One entry per year per equipment
        if EquipmentDepreciation.objects.filter(equipment=equipment, year=year).exists():
            raise serializers.ValidationError(
                {'year': f'A depreciation entry for year {year} already exists for this equipment.'}
            )

        # Cannot depreciate expense-type equipment
        if equipment.acquisition_type == Equipment.ACQUISITION_EXPENSE:
            raise serializers.ValidationError(
                'Expense-type equipment cannot be depreciated as a fixed asset.'
            )

        return attrs
