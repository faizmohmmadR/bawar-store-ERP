"""Section report for Loans — two sides (owed to me / I owe), each with total/paid/balance."""
from api.models.data.currency import CURRENCY_DEFINITIONS, get_currency
from api.services.financial_reports import _float
from api.services.loan_reporting import get_loan_summary


def _currency_meta(currency_id):
    meta = get_currency(currency_id) or CURRENCY_DEFINITIONS[1]
    return {
        'currency_id': int(currency_id),
        'code': meta['code'],
        'symbol': meta.get('symbol') or meta['code'],
        'name': meta.get('name') or meta['code'],
    }


def _has_activity(summary):
    keys = (
        'receivable_total', 'receivable_paid', 'loans_receivable',
        'payable_total', 'payable_paid', 'loans_payable',
        'principal_given', 'principal_received',
        'loan_collections', 'loan_repayments',
    )
    return any(float(summary.get(key) or 0) for key in keys)


def _side_native(summary, *, total_key, paid_key, balance_key):
    return {
        'total_native': float(summary.get(total_key) or 0),
        'paid_native': float(summary.get(paid_key) or 0),
        'balance_native': float(summary.get(balance_key) or 0),
    }


def get_loan_report(start_date=None, end_date=None):
    summary_afn = get_loan_summary(start_date, end_date)

    by_currency = {}
    for currency_id in CURRENCY_DEFINITIONS:
        summary = get_loan_summary(start_date, end_date, currency=currency_id)
        if not _has_activity(summary):
            continue
        info = _currency_meta(currency_id)
        by_currency[info['code']] = {
            **info,
            'owed_to_me': _side_native(
                summary,
                total_key='receivable_total',
                paid_key='receivable_paid',
                balance_key='loans_receivable',
            ),
            'i_owe': _side_native(
                summary,
                total_key='payable_total',
                paid_key='payable_paid',
                balance_key='loans_payable',
            ),
        }
        # Flat fields kept for simple table rows / older clients
        by_currency[info['code']].update({
            'receivable_total_native': by_currency[info['code']]['owed_to_me']['total_native'],
            'receivable_paid_native': by_currency[info['code']]['owed_to_me']['paid_native'],
            'loans_receivable_native': by_currency[info['code']]['owed_to_me']['balance_native'],
            'payable_total_native': by_currency[info['code']]['i_owe']['total_native'],
            'payable_paid_native': by_currency[info['code']]['i_owe']['paid_native'],
            'loans_payable_native': by_currency[info['code']]['i_owe']['balance_native'],
        })

    currency_codes = sorted(
        by_currency.keys(),
        key=lambda code: (
            0 if code == 'AFN' else 1,
            -(
                by_currency[code]['receivable_total_native']
                + by_currency[code]['payable_total_native']
            ),
            code,
        ),
    )

    return {
        'report_type': 'loans',
        'currency': 'AFN',
        'currency_symbol': '؋',
        'kpis': {
            'owed_to_me_total_afn': _float(summary_afn.get('receivable_total')),
            'owed_to_me_paid_afn': _float(summary_afn.get('receivable_paid')),
            'owed_to_me_balance_afn': _float(summary_afn.get('loans_receivable')),
            'i_owe_total_afn': _float(summary_afn.get('payable_total')),
            'i_owe_paid_afn': _float(summary_afn.get('payable_paid')),
            'i_owe_balance_afn': _float(summary_afn.get('loans_payable')),
            # Aliases matching prior field names
            'loans_receivable_afn': _float(summary_afn.get('loans_receivable')),
            'loans_payable_afn': _float(summary_afn.get('loans_payable')),
            'loan_collections_afn': _float(summary_afn.get('loan_collections')),
            'loan_repayments_afn': _float(summary_afn.get('loan_repayments')),
            'principal_given_afn': _float(summary_afn.get('principal_given')),
            'principal_received_afn': _float(summary_afn.get('principal_received')),
            'currency_count': len(currency_codes),
        },
        'by_currency': by_currency,
        'currency_codes': currency_codes,
        'currency_count': len(currency_codes),
        'notes': [
            'Owed to me = loans given (loan out). I owe = loans received (loan in).',
            'Total / paid / balance are as of period end (booked rate for AFN).',
            'Currencies are shown in native amounts and are never mixed.',
        ],
    }
