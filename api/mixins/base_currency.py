from django.core.exceptions import ValidationError

from api.services.currency_conversion import populate_base_amounts


class BaseCurrencySerializerMixin:
    """
    Mixin for serializers that auto-compute exchange_rate and *_base fields.
    Subclasses must define base_currency_amount_fields and base_currency_date_field.
    """

    base_currency_amount_fields = ()
    base_currency_date_field = None

    def _apply_base_currency(self, validated_data, instance=None):
        from django.utils import timezone

        merged = {}
        if instance:
            for field in self.base_currency_amount_fields:
                if field not in validated_data and hasattr(instance, field):
                    merged[field] = getattr(instance, field)
            for fname in ('currency', 'curency'):
                if fname not in validated_data and hasattr(instance, fname):
                    merged[fname] = getattr(instance, fname)
            if self.base_currency_date_field and self.base_currency_date_field not in validated_data:
                merged[self.base_currency_date_field] = getattr(
                    instance, self.base_currency_date_field, None
                )

        merged.update(validated_data)

        currency_val = merged.get('currency') or merged.get('curency')
        if not isinstance(currency_val, int):
            currency_val = getattr(currency_val, 'id', currency_val)

        class _Holder:
            pass

        holder = _Holder()
        holder.currency = currency_val
        holder.curency = currency_val

        date_field = self.base_currency_date_field
        at_dt = merged.get(date_field) if date_field else None
        if not at_dt:
            at_dt = timezone.now()

        for field in self.base_currency_amount_fields:
            if field in merged:
                setattr(holder, field, merged[field])
            elif instance and hasattr(instance, field):
                setattr(holder, field, getattr(instance, field))
            if hasattr(holder, field):
                setattr(holder, f'{field}_base', None)

        holder.exchange_rate = None

        try:
            rate = populate_base_amounts(
                holder,
                amount_fields=self.base_currency_amount_fields,
                currency=currency_val,
                at_datetime=at_dt,
            )
        except ValidationError:
            raise

        validated_data['exchange_rate'] = rate
        for field in self.base_currency_amount_fields:
            base_field = f'{field}_base'
            if hasattr(holder, base_field):
                validated_data[base_field] = getattr(holder, base_field)

        return validated_data

    def validate(self, attrs):
        attrs = super().validate(attrs)
        attrs = self._apply_base_currency(attrs, getattr(self, 'instance', None))
        return attrs
