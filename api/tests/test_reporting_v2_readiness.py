from unittest.mock import patch

from django.test import SimpleTestCase

from api.management.commands.reporting_v2_readiness import build_readiness_summary


class ReportingV2ReadinessTests(SimpleTestCase):
    def setUp(self):
        module = 'api.management.commands.reporting_v2_readiness.'
        values = {
            'ledger_health': {'issue_count': 0},
            'source_coverage': {'finding_count': 0, 'counts_by_kind': {}},
            'trial_balance_review': {'status': 'recorded_trial_balance_balanced',
                                     'totals': {'closing_difference': '0.00'}},
            'inventory_current_position': {'unknown_pool_count': 0,
                                           'unknown_gl_base_count': 0,
                                           'difference_afn': '0.00', 'rows': []},
            'customer_ar_bridge': {'rows': [{'total_difference': '0.00', 'invoice_issue_count': 0}]},
            'vendor_ap_bridge': {'rows': [{'total_difference': '0.00', 'invoice_issue_count': 0}]},
            'inventory_sale_bridge': {'rows': [], 'orphan_inventory_line_count': 0},
            'inventory_waste_bridge': {'rows': [], 'orphan_inventory_line_count': 0},
            'inventory_transformation_bridge': {'rows': []},
        }
        self.values = values
        self.patchers = [patch(module + key, side_effect=lambda scope, name=key: values[name])
                         for key in values]
        for patcher in self.patchers:
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_clear_automatic_checks_still_do_not_approve_cutover(self):
        result = build_readiness_summary()
        self.assertTrue(result['automatic_checks_pass'])
        self.assertFalse(result['cutover_approved'])

    def test_unknown_inventory_value_and_trade_difference_block_checks(self):
        self.values['inventory_current_position']['difference_afn'] = None
        self.values['inventory_current_position']['unknown_pool_count'] = 1
        self.values['customer_ar_bridge']['rows'][0]['total_difference'] = '0.01'
        result = build_readiness_summary()
        self.assertFalse(result['automatic_checks_pass'])
        self.assertFalse(result['checks']['inventory_value_known'])
        self.assertFalse(result['checks']['inventory_matches_gl'])
        self.assertFalse(result['checks']['customer_ar_matches_gl'])

    def test_source_issue_and_orphan_inventory_line_block_checks(self):
        self.values['source_coverage']['finding_count'] = 1
        self.values['inventory_sale_bridge']['orphan_inventory_line_count'] = 1
        result = build_readiness_summary()
        self.assertFalse(result['checks']['source_coverage'])
        self.assertFalse(result['checks']['sale_inventory_costs'])
