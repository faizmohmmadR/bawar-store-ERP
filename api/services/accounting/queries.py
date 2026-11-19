"""Look up journals linked to source documents."""
from django.contrib.contenttypes.models import ContentType
from django.db.models import Q

SOURCE_MODEL_ALIASES = {
    'sale': 'sales',
    'sales': 'sales',
    'return': 'return',
    'returns': 'return',
    'expense': 'expense',
    'expenses': 'expense',
    'payroll': 'payroll',
    'loan': 'loan',
    'loans': 'loan',
    'payment': 'payment',
    'payments': 'payment',
    'loanpayment': 'loanpayment',
    'loan-payment': 'loanpayment',
    'currencyexchange': 'currencyexchange',
    'currency-exchange': 'currencyexchange',
    'currency_exchange': 'currencyexchange',
    'fxrevaluation': 'fxrevaluation',
    'fx-revaluation': 'fxrevaluation',
    'fx_revaluation': 'fxrevaluation',
    'thirdpartysettlement': 'thirdpartysettlement',
    'third-party-settlement': 'thirdpartysettlement',
    'stockadjustment': 'stockadjustment',
    'stock-adjustment': 'stockadjustment',
    'stock_adjustment': 'stockadjustment',
    'stocktransfer': 'stocktransfer',
    'stock-transfer': 'stocktransfer',
    'stock_transfer': 'stocktransfer',
    'equipment': 'equipment',
    'rawmaterialpurchase': 'rawmaterialpurchase',
    'raw-material-purchase': 'rawmaterialpurchase',
    'raw_material_purchase': 'rawmaterialpurchase',
    'purchase': 'rawmaterialpurchase',
    'packingrun': 'packingrun',
    'packing-run': 'packingrun',
    'packing_run': 'packingrun',
    'packing': 'packingrun',
    'stockbottledamage': 'stockbottledamage',
    'stock-bottle-damage': 'stockbottledamage',
    'stock_bottle_damage': 'stockbottledamage',
    'bottle-damage': 'stockbottledamage',
    'bottledamage': 'stockbottledamage',
    'storagetankleak': 'storagetankleak',
    'storage-tank-leak': 'storagetankleak',
    'storage_tank_leak': 'storagetankleak',
    'tank-leak': 'storagetankleak',
    'salesmancommissionpayment': 'salesmancommissionpayment',
    'salesman-commission-payment': 'salesmancommissionpayment',
    'salesman_commission_payment': 'salesmancommissionpayment',
}


def _normalize_source_model(model_name):
    return SOURCE_MODEL_ALIASES.get((model_name or '').lower().strip())


def get_journals_for_source(model_name, object_id, *, include_related=False):
    from api.models.data.journal import JournalEntry

    normalized = _normalize_source_model(model_name)
    if not normalized:
        return JournalEntry.objects.none()

    try:
        content_type = ContentType.objects.get(app_label='api', model=normalized)
    except ContentType.DoesNotExist:
        return JournalEntry.objects.none()

    filters = Q(content_type=content_type, object_id=object_id)

    if include_related:
        if normalized == 'sales':
            from api.models.data.payment import Payment
            from api.models.data.sales import Sales

            sale_ct = ContentType.objects.get_for_model(Sales)
            payment_ct = ContentType.objects.get_for_model(Payment)
            payment_ids = Payment.objects.filter(
                Q(content_type=sale_ct, object_id=object_id) | Q(general_payment__source_sale_id=object_id),
            ).values_list('pk', flat=True)
            if payment_ids:
                filters |= Q(content_type=payment_ct, object_id__in=list(payment_ids))

        elif normalized == 'loan':
            from api.models.data.loan import LoanPayment

            payment_ct = ContentType.objects.get_for_model(LoanPayment)
            payment_ids = LoanPayment.objects.filter(
                loan_id=object_id,
            ).values_list('pk', flat=True)
            if payment_ids:
                filters |= Q(content_type=payment_ct, object_id__in=list(payment_ids))

        elif normalized == 'rawmaterialpurchase':
            from api.models.data.payment import Payment
            from api.models.data.raw_materials import RawMaterialPurchase

            purchase_ct = ContentType.objects.get_for_model(RawMaterialPurchase)
            payment_ct = ContentType.objects.get_for_model(Payment)
            payment_ids = Payment.objects.filter(
                content_type=purchase_ct,
                object_id=object_id,
            ).values_list('pk', flat=True)
            if payment_ids:
                filters |= Q(content_type=payment_ct, object_id__in=list(payment_ids))

    return (
        JournalEntry.objects.filter(filters)
        .prefetch_related('lines__gl_account')
        .order_by('-created_at', '-id')
    )
