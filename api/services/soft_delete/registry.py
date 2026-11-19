
from django.apps import apps

TRASH_RETENTION_DAYS = 30


def _model(label):
    return apps.get_model(label)


TRASH_REGISTRY = {
    'equipment': {
        'model': 'api.Equipment',
        'label': 'Equipment',
        'display': lambda o: o.name,
        'module': 'equipment',
    },
    'expenses': {
        'model': 'api.Expense',
        'label': 'Expense',
        'display': lambda o: getattr(o.category, 'name', None) or f'Expense #{o.pk}',
        'module': 'expenses',
    },
    'customers': {
        'model': 'api.Customer',
        'label': 'Customer',
        'display': lambda o: o.name,
        'module': 'customers',
    },
    'vendors': {
        'model': 'api.Vendor',
        'label': 'Vendor',
        'display': lambda o: o.name,
        'module': 'vendors',
    },
    'salesmen': {
        'model': 'api.Salesman',
        'label': 'Salesman',
        'display': lambda o: o.name,
        'module': 'salesmen',
    },
    'salesman_commission_payments': {
        'model': 'api.SalesmanCommissionPayment',
        'label': 'Salesman Commission Payment',
        'display': lambda o: o.reference_number or f'Commission pay #{o.pk}',
        'module': 'salesman_commission_payments',
    },
    'products': {
        'model': 'api.Product',
        'label': 'Product',
        'display': lambda o: o.name,
        'module': 'products',
    },
    'employees': {
        'model': 'api.Employee',
        'label': 'Employee',
        'display': lambda o: o.full_name,
        'module': 'employees',
    },
    'payrolls': {
        'model': 'api.Payroll',
        'label': 'Payroll',
        'display': lambda o: getattr(o.employee, 'full_name', f'Payroll #{o.pk}'),
        'module': 'payroll',
    },
    'sales': {
        'model': 'api.Sales',
        'label': 'Sale',
        'display': lambda o: o.invoice_number or f'Sale #{o.pk}',
        'module': 'sales',
        'hard_delete': 'sale',
    },
    'returns': {
        'model': 'api.Return',
        'label': 'Return',
        'display': lambda o: f'Return #{o.pk}',
        'module': 'returns',
        'hard_delete': 'return',
    },
    'payments': {
        'model': 'api.Payment',
        'label': 'Payment',
        'display': lambda o: o.reference_number or f'Payment #{o.pk}',
        'module': 'payments',
        'hard_delete': 'payment',
    },
    'withdrawals': {
        'model': 'api.Withdrawal',
        'label': 'Withdrawal',
        'display': lambda o: o.reference_number or f'Withdrawal #{o.pk}',
        'module': 'withdrawals',
    },
    'loans': {
        'model': 'api.Loan',
        'label': 'Loan',
        'display': lambda o: o.reference_number or f'Loan #{o.pk}',
        'module': 'loans',
    },
    'stocks': {
        'model': 'api.Stock',
        'label': 'Stock',
        'display': lambda o: getattr(o.product, 'name', f'Stock #{o.pk}'),
        'module': 'stock',
    },
    'packing-runs': {
        'model': 'api.PackingRun',
        'label': 'Packing run',
        'display': lambda o: o.packing_number or f'Packing #{o.pk}',
        'module': 'packing',
    },
    'damaged-materials': {
        'model': 'api.DamagedMaterialRecord',
        'label': 'Damaged materials',
        'display': lambda o: o.damaged_number or f'Damaged #{o.pk}',
        'module': 'damaged',
    },
    'stock-bottle-damages': {
        'model': 'api.StockBottleDamage',
        'label': 'Bottle damage',
        'display': lambda o: (
            f'{o.bottle_count} × {getattr(o.product, "name", o.product_id)}'
        ),
        'module': 'stock',
    },
    'employee-overtime-entries': {
        'model': 'api.EmployeeOvertimeEntry',
        'label': 'Overtime entry',
        'display': lambda o: (
            f'{getattr(o.employee, "full_name", o.employee_id)} · {o.work_date} · {o.amount}'
        ),
        'module': 'payroll',
    },
    'employee-absence-entries': {
        'model': 'api.EmployeeAbsenceEntry',
        'label': 'Absence entry',
        'display': lambda o: (
            f'{getattr(o.employee, "full_name", o.employee_id)} · {o.absence_date} · {o.days}d'
        ),
        'module': 'payroll',
    },
    'accounts': {
        'model': 'api.Account',
        'label': 'Account',
        'display': lambda o: o.name,
        'module': 'accounts',
    },
    'currency-exchanges': {
        'model': 'api.CurrencyExchange',
        'label': 'Currency exchange',
        'display': lambda o: o.reference_number or f'Exchange #{o.pk}',
        'module': 'accounts',
    },
    'fx-revaluations': {
        'model': 'api.FxRevaluation',
        'label': 'FX revaluation',
        'display': lambda o: f'Revaluation #{o.pk}',
        'module': 'accounts',
    },
}


def get_registry_entry(model_key: str):
    entry = TRASH_REGISTRY.get(model_key)
    if not entry:
        return None
    resolved = dict(entry)
    resolved['model_class'] = _model(entry['model'])
    return resolved
