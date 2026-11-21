from decimal import Decimal
from types import SimpleNamespace

from django.test import SimpleTestCase

from api.services.notifications import product_stock_alert_state


class ProductStockAlertStateTests(SimpleTestCase):
    def _product(self, *, reorder=0, minimum=0, track=True):
        return SimpleNamespace(
            track_inventory=track,
            reorder_level=Decimal(str(reorder)),
            min_stock_level=Decimal(str(minimum)),
        )

    def test_disabled_when_thresholds_are_zero(self):
        self.assertIsNone(product_stock_alert_state(self._product(), 0))

    def test_out_of_stock(self):
        self.assertEqual(
            product_stock_alert_state(self._product(reorder=100), 0),
            'out',
        )

    def test_critical_uses_min_level(self):
        self.assertEqual(
            product_stock_alert_state(self._product(reorder=100, minimum=20), 15),
            'critical',
        )

    def test_low_uses_reorder_level(self):
        self.assertEqual(
            product_stock_alert_state(self._product(reorder=100, minimum=20), 50),
            'low',
        )

    def test_healthy_stock(self):
        self.assertIsNone(
            product_stock_alert_state(self._product(reorder=100, minimum=20), 150),
        )

    def test_untracked_product_never_alerts(self):
        self.assertIsNone(
            product_stock_alert_state(self._product(reorder=100, track=False), 0),
        )
