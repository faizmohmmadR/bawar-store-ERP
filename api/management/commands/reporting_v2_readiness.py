"""Read-only, aggregate preflight for the new reporting system."""
import json
from collections import Counter
from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand

from api.services.reporting.contracts import ReportScope
from api.services.reporting.ledger import ledger_health
from api.services.reporting.source_audit import source_coverage
from api.services.reporting.trial_balance import trial_balance_review
from api.services.reporting.inventory_current_position import inventory_current_position
from api.services.reporting.customer_ar_bridge import customer_ar_bridge
from api.services.reporting.vendor_ap_bridge import vendor_ap_bridge
from api.services.reporting.inventory_sale_bridge import inventory_sale_bridge
from api.services.reporting.inventory_waste_bridge import inventory_waste_bridge
from api.services.reporting.inventory_transformation_bridge import inventory_transformation_bridge


def _nonzero(value):
    if value is None:
        return True
    try:
        return Decimal(str(value)) != 0
    except (InvalidOperation, TypeError):
        return True


def _row_issues(report):
    return dict(sorted(Counter(issue for row in report.get('rows', [])
                               for issue in row.get('issues', [])).items()))


def build_readiness_summary():
    """Return counts and gates only; never names, document contents or guessed amounts."""
    scope = ReportScope()
    health = ledger_health(scope)
    coverage = source_coverage(scope)
    trial = trial_balance_review(scope)
    inventory = inventory_current_position(scope)
    ar = customer_ar_bridge(scope)
    ap = vendor_ap_bridge(scope)
    sales = inventory_sale_bridge(scope)
    waste = inventory_waste_bridge(scope)
    transformations = inventory_transformation_bridge(scope)

    checks = {
        'journal_health': health.get('issue_count', 0) == 0,
        'source_coverage': coverage.get('finding_count', 0) == 0,
        'trial_balance': trial.get('status') == 'recorded_trial_balance_balanced'
                         and not _nonzero(trial.get('totals', {}).get('closing_difference')),
        'inventory_value_known': inventory.get('unknown_pool_count', 0) == 0
                                 and inventory.get('unknown_gl_base_count', 0) == 0
                                 and inventory.get('difference_afn') is not None,
        'inventory_matches_gl': not _nonzero(inventory.get('difference_afn')),
        'customer_ar_matches_gl': all(not _nonzero(row.get('total_difference'))
                                      and not row.get('invoice_issue_count')
                                      for row in ar.get('rows', [])),
        'vendor_ap_matches_gl': all(not _nonzero(row.get('total_difference'))
                                    and not row.get('invoice_issue_count')
                                    for row in ap.get('rows', [])),
        'sale_inventory_costs': not _row_issues(sales)
                                and not sales.get('orphan_inventory_line_count'),
        'waste_inventory_costs': not _row_issues(waste)
                                 and not waste.get('orphan_inventory_line_count'),
        'transformation_history': not _row_issues(transformations),
    }
    return {
        'version': 2,
        'mode': 'read_only_preflight',
        'automatic_checks_pass': all(checks.values()),
        'cutover_approved': False,
        'checks': checks,
        'details': {
            'journal_issue_count': health.get('issue_count', 0),
            'source_finding_count': coverage.get('finding_count', 0),
            'source_finding_kinds': coverage.get('counts_by_kind', {}),
            'unknown_inventory_pool_count': inventory.get('unknown_pool_count', 0),
            'inventory_pool_issues': _row_issues(inventory),
            'customer_ar_difference_currency_count': sum(
                _nonzero(row.get('total_difference')) for row in ar.get('rows', [])),
            'vendor_ap_difference_currency_count': sum(
                _nonzero(row.get('total_difference')) for row in ap.get('rows', [])),
            'sale_inventory_issues': _row_issues(sales),
            'sale_orphan_inventory_line_count': sales.get('orphan_inventory_line_count', 0),
            'waste_inventory_issues': _row_issues(waste),
            'waste_orphan_inventory_line_count': waste.get('orphan_inventory_line_count', 0),
            'transformation_issues': _row_issues(transformations),
        },
        'limitations': [
            'Passing automated checks does not certify opening balances, historical edits or business rules.',
            'No database records are created or changed by this command.',
        ],
    }


class Command(BaseCommand):
    help = 'Print read-only V2 reporting readiness counts as JSON.'

    def handle(self, *args, **options):
        self.stdout.write(json.dumps(build_readiness_summary(), ensure_ascii=False, indent=2))
