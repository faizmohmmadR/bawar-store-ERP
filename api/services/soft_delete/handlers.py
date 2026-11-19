from decimal import Decimal

from django.db import transaction


def run_hard_delete(kind, instance):
    if kind == 'sale':
        hard_delete_sale(instance)
    elif kind == 'return':
        hard_delete_return(instance)
    elif kind == 'payment':
        hard_delete_payment(instance)
    else:
        instance.delete()


def hard_delete_sale(sale):
    from api.views.data.sales import SalesViewSet

    viewset = SalesViewSet()
    with transaction.atomic():
        viewset.perform_hard_destroy(sale)


def hard_delete_return(return_order):
    from api.views.data.returns import ReturnViewSet

    viewset = ReturnViewSet()
    with transaction.atomic():
        viewset.perform_hard_destroy(return_order)


def hard_delete_payment(payment):
    from api.views.data.payment import PaymentViewSet

    viewset = PaymentViewSet()
    with transaction.atomic():
        viewset.perform_hard_destroy(payment)
