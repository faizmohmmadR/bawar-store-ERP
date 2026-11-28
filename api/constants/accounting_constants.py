"""Labels for journal entry source models in reports and sub-account statements."""

SOURCE_MODEL_TO_ENTRY_TYPE = {
    'sales': 'Sale',
    'purchase': 'Purchase',
    'rawmaterialpurchase': 'Raw Material Purchase',
    'packingrun': 'Packing Run',
    'payment': 'Payment',
    'expense': 'Expense',
    'payroll': 'Payroll',
    'loan': 'Loan',
    'loanpayment': 'Loan Payment',
    'return': 'Return',
    'stock': 'Stock Adjustment',
    'inventorybatch': 'Inventory Batch',
    'stockadjustment': 'Stock Adjustment',
}

STATIC_ENTRY_TYPES = [
    ('sale', 'Sale'),
    ('purchase', 'Purchase'),
    ('payment', 'Payment'),
    ('expense', 'Expense'),
    ('payroll', 'Payroll'),
    ('loan', 'Loan'),
    ('loan_payment', 'Loan Payment'),
    ('return', 'Return'),
    ('manual', 'Manual'),
]


def entry_type_for_journal(journal):
    if not journal:
        return 'Manual'
    if not journal.content_type:
        return 'Manual'
    model = journal.content_type.model
    return SOURCE_MODEL_TO_ENTRY_TYPE.get(model, model.replace('_', ' ').title())
