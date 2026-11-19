from api.services.cost_currency import usd_amount, usd_cost_rate


class CostCurrencyMixin:
    """Read-only reporting amounts, sharing a run's frozen FX rate in child rows."""
    cost_aliases = {}

    def to_representation(self, instance):
        data = super().to_representation(instance)
        owner = getattr(instance, 'packing_run', None) or getattr(instance, 'process', None) or instance
        if hasattr(owner, 'usd_to_afn_rate'):
            rate = owner.usd_to_afn_rate
            basis = 'saved'
        else:
            # Stock balances are current AFN valuations, translated at today's rate.
            if 'current_usd_cost_rate' not in self.context:
                self.context['current_usd_cost_rate'] = usd_cost_rate()
            rate = self.context['current_usd_cost_rate']
            basis = 'current'
        for target, source in self.cost_aliases.items():
            if source in data:
                data[target] = data[source]
        data['usd_to_afn_rate'] = str(rate) if rate else None
        data['usd_cost_basis'] = basis
        for field, value in list(data.items()):
            if field.endswith('_afn'):
                data[field[:-4] + '_usd'] = usd_amount(value, rate)
        return data
