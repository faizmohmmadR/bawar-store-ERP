from decimal import Decimal
from unittest.mock import patch

from django.test import SimpleTestCase

from api.serializers.data.stock import StockSerializer
from api.services.currency_conversion import normalize_stock_buy_price
from api.services.stock_condition_move import _weighted_price as moved_price
from api.services.stock_return_to_main import _weighted_price as returned_price


class DecimalEntryTests(SimpleTestCase):
    def test_stock_fields_accept_four_decimal_places(self):
        fields = StockSerializer().fields
        for name in ('piece_amount', 'carton_amount', 'buy_price'):
            self.assertEqual(fields[name].run_validation('0.0125'), Decimal('0.0125'))

    def test_stock_cost_preserves_fractional_base_currency_price(self):
        self.assertEqual(normalize_stock_buy_price('0.0125', 1), (Decimal('0.0125'), 1))

    @patch('api.services.currency_conversion.get_rate_to_base', return_value=Decimal('2.5'))
    def test_stock_currency_conversion_preserves_fractional_cost(self, lookup):
        self.assertEqual(normalize_stock_buy_price('0.01', 2), (Decimal('0.0250'), 1))

    def test_transfers_preserve_fractional_weighted_cost(self):
        for calculate in (moved_price, returned_price):
            self.assertEqual(calculate(Decimal('1'), Decimal('0.0125'), Decimal('1'), Decimal('0.0375')), Decimal('0.0250'))
