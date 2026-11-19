from datetime import datetime, timedelta, timezone
from django.test import SimpleTestCase
from api.services.contact_ledger import _append_tx, prepare_transaction_history


class TransactionHistoryOrderTests(SimpleTestCase):
    def row(self, tx_id, date, created, debit=0, credit=0, currency='AFN'):
        rows = []
        _append_tx(rows, tx_id=tx_id, entry_date=date, created_at=created,
            entry_type_name='Transaction', entry_type_key='purchase', reference_number=tx_id,
            debit=debit, credit=credit, notes='', currency_code=currency)
        return rows[0]

    def test_newest_business_date_first_even_when_created_later(self):
        start = datetime(2026, 10, 1, tzinfo=timezone.utc)
        later_date = self.row('purchase-1', start + timedelta(days=3), start, credit=100)
        earlier_date = self.row('payment-2', start, start + timedelta(days=1), debit=20)
        rows, totals = prepare_transaction_history([later_date, earlier_date])
        # Display newest entry_date first; running balances stay chronological.
        self.assertEqual([row['id'] for row in rows], ['purchase-1', 'payment-2'])
        self.assertEqual(rows[0]['running_balance'], -80)
        self.assertEqual(rows[1]['running_balance'], 20)
        self.assertEqual(totals['AFN']['balance'], -80)

    def test_running_balances_stay_chronological_in_each_currency(self):
        start = datetime(2026, 10, 1, tzinfo=timezone.utc)
        rows = [self.row('sale-1', start, start, debit=100),
            self.row('payment-2', start + timedelta(days=1), start + timedelta(days=1), credit=30),
            self.row('sale-3', start, start + timedelta(days=2), debit=5, currency='USD')]
        ordered, totals = prepare_transaction_history(rows)
        # Newest entry_date first (same date: higher created_at / id wins).
        self.assertEqual([row['id'] for row in ordered], ['payment-2', 'sale-3', 'sale-1'])
        self.assertEqual([row['running_balance'] for row in ordered], [70, 5, 100])
        self.assertEqual(totals['AFN']['balance'], 70)
        self.assertEqual(totals['USD']['balance'], 5)

    def test_same_entry_date_uses_numeric_record_id_newest_first(self):
        at = datetime(2026, 10, 1, tzinfo=timezone.utc)
        rows, _ = prepare_transaction_history([self.row('sale-2', at, at), self.row('sale-10', at, at)])
        self.assertEqual([row['id'] for row in rows], ['sale-10', 'sale-2'])
