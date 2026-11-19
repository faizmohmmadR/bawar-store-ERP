from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.db.models import Sum
from rest_framework import status, serializers
from rest_framework.exceptions import ValidationError
from api.services.general_payments import lock_payment_party
from rest_framework.decorators import action
from rest_framework.response import Response

from api.models.data.payment import Payment
from api.models.data.raw_materials import RawMaterialPurchase
from api.models.data.sales import Sales
from api.serializers.data.payment import PaymentSerializer
from api.services.accounting import sync_order_paid_amount, sync_payment_journal
from api.views.data.base import DataRootViewSet


class PaymentViewSet(DataRootViewSet):
    permission_module = 'payments'
    permission_codenames = [
        'view_payments',
        'view_sale_payments',
        'view_purchase_payments',
    ]
    queryset = Payment.objects.select_related('content_type').prefetch_related('documents').all().order_by("-created_at", "-id")
    serializer_class = PaymentSerializer
    filterset_fields = ["payment_type", "currency", "payment_method", "intermediary_vendor"]
    search_fields = ["reference_number", "notes"]

    def _sync_intermediary_loan_for_payment(self, payment):
        """Create/update payable loan for intermediary-credit payments (legacy)."""
        if payment.payment_method != 'intermediary_credit':
            if payment.intermediary_loan_id:
                loan = payment.intermediary_loan
                if loan and not loan.payments.exists():
                    payment.intermediary_loan = None
                    payment.save(update_fields=['intermediary_loan', 'updated_at'])
                    loan.delete()
            return

        raise ValueError('Intermediary credit is only supported for legacy purchase payments.')

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == 'list':
            qs = qs.filter(is_credit_application=False, general_payment__source_sale__isnull=True)
        object_id = self.request.query_params.get("object_id")
        if object_id:
            qs = qs.filter(object_id=object_id)
        return qs

    def _resolve_content_type(self, content_type_name):
        aliases = {
            'sales': 'sales',
            'sale': 'sales',
            'rawmaterialpurchase': 'rawmaterialpurchase',
            'raw_material_purchase': 'rawmaterialpurchase',
            'raw-material-purchase': 'rawmaterialpurchase',
            # Accept legacy name used by older clients; map to RM purchase model.
            'purchase': 'rawmaterialpurchase',
        }
        model = aliases.get((content_type_name or '').lower().strip())
        if not model:
            return None
        try:
            return ContentType.objects.get(app_label='api', model=model)
        except ContentType.DoesNotExist:
            return None

    def _get_related_order(self, content_type_name, object_id):
        name = (content_type_name or '').lower().strip()
        if name in ('sales', 'sale'):
            return Sales.objects.filter(pk=object_id).first()
        if name in (
            'rawmaterialpurchase',
            'raw_material_purchase',
            'raw-material-purchase',
            'purchase',
        ):
            return RawMaterialPurchase.objects.filter(pk=object_id).first()
        return None

    def _payment_type_for_content(self, content_type_name):
        name = (content_type_name or '').lower().strip()
        if name in ('sales', 'sale'):
            return 'sale'
        if name in (
            'rawmaterialpurchase',
            'raw_material_purchase',
            'raw-material-purchase',
            'purchase',
        ):
            return 'purchase'
        return None

    def _validate_payment_amount(self, order, amount, exclude_payment_id=None):
        if getattr(order, 'vendor_id', None) and isinstance(order, Sales):
            return 'Vendor goods settle supplier balances automatically; no sale cash payment is allowed.'
        if getattr(order, 'is_free', False):
            return 'Free invoices cannot receive bill payments. Use a general party payment for advances.'
        ct = ContentType.objects.get_for_model(order)
        paid_qs = Payment.objects.filter(content_type=ct, object_id=order.pk)
        if exclude_payment_id:
            paid_qs = paid_qs.exclude(pk=exclude_payment_id)
        already_paid = paid_qs.aggregate(total=Sum("amount"))["total"] or Decimal("0")
        order_total = Decimal(str(order.total_amount))
        if already_paid + Decimal(str(amount)) > order_total:
            remaining = order_total - already_paid
            return (
                f"Payment exceeds remaining balance. "
                f"Total: {order_total}, already paid: {already_paid}, remaining: {remaining}"
            )
        return None

    def create(self, request, *args, **kwargs):
        with transaction.atomic():
            data = request.data.copy()
            name = data.get('content_type')
            ct = self._resolve_content_type(name)
            object_id = serializers.IntegerField(min_value=1).run_validation(data.get('object_id'))
            if ct is None:
                raise ValidationError({'content_type': 'Select sales or rawmaterialpurchase.'})
            order = self._get_related_order(name, object_id)
            if order is None:
                raise ValidationError({'object_id': 'Related order not found.'})
            lock_payment_party(order)
            order = type(order).objects.select_for_update().get(pk=order.pk)
            if order.status in ('draft', 'cancelled'):
                raise ValidationError({'object_id': 'Cannot pay a draft or cancelled bill.'})
            data['content_type'] = ct.pk
            data['object_id'] = order.pk
            data['payment_type'] = self._payment_type_for_content(name)
            data['currency'] = data.get('currency') or order.currency
            serializer = self.get_serializer(data=data)
            serializer.is_valid(raise_exception=True)
            if serializer.validated_data['currency'] != order.currency:
                raise ValidationError({'currency': 'Payment currency must match the bill currency.'})
            error = self._validate_payment_amount(order, serializer.validated_data['amount'])
            if error:
                raise ValidationError({'amount': error})
            self.perform_create(serializer)
            sync_order_paid_amount(order)
            sync_payment_journal(serializer.instance)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        with transaction.atomic():
            payment = self.get_object()
            if payment.general_payment_id:
                raise ValidationError({'general_payment': 'Edit the general payment receipt to change this allocation.'})
            if payment.payment_method == 'intermediary_credit':
                raise ValidationError({'payment_method': 'Legacy intermediary payments cannot be edited.'})
            order = payment.content_object
            if order is None:
                raise ValidationError({'object_id': 'Related bill is unavailable.'})
            lock_payment_party(order)
            order = type(order).objects.select_for_update().get(pk=order.pk)
            payment = Payment.objects.select_for_update().get(pk=payment.pk)
            if payment.general_payment_id:
                raise ValidationError({'general_payment': 'Edit the general payment receipt.'})
            serializer = self.get_serializer(payment, data=request.data, partial=kwargs.pop('partial', False))
            serializer.is_valid(raise_exception=True)
            for field in ('content_type', 'object_id', 'payment_type', 'currency'):
                if field in serializer.validated_data and serializer.validated_data[field] != getattr(payment, field):
                    raise ValidationError({field: 'A payment cannot move to another bill, type or currency.'})
            if serializer.validated_data.get('currency', payment.currency) != order.currency:
                raise ValidationError({'currency': 'Payment currency must match the bill currency.'})
            error = self._validate_payment_amount(order, serializer.validated_data.get('amount', payment.amount), exclude_payment_id=payment.pk)
            if error:
                raise ValidationError({'amount': error})
            self.perform_update(serializer)
            sync_order_paid_amount(order)
            sync_payment_journal(serializer.instance)
            return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        with transaction.atomic():
            payment = self.get_object()
            if payment.general_payment_id:
                raise ValidationError({'general_payment': 'Delete the general payment receipt to reverse all its allocations.'})
            if payment.content_object:
                lock_payment_party(payment.content_object)
            try:
                return super().destroy(request, *args, **kwargs)
            except ValueError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    def perform_hard_destroy(self, instance):
        if instance.general_payment_id:
            raise ValueError('Delete the general payment receipt to reverse all its allocations.')
        if instance.payment_method == 'intermediary_credit':
            raise ValueError('Legacy intermediary payments cannot be deleted.')
        loan_to_delete = instance.intermediary_loan
        order = instance.content_object
        instance.delete()
        if loan_to_delete and not loan_to_delete.payments.exists():
            still_linked = Payment.objects.filter(intermediary_loan_id=loan_to_delete.pk).exists()
            if not still_linked:
                loan_to_delete.delete()
            else:
                remaining = Payment.objects.filter(
                    intermediary_loan_id=loan_to_delete.pk
                ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
                loan_to_delete.amount = remaining
                loan_to_delete.save(update_fields=['amount', 'updated_at'])
        if order:
            sync_order_paid_amount(order)

    @action(detail=False, methods=["get"])
    def for_sale(self, request):
        sale_id = request.query_params.get("sale_id")
        if not sale_id:
            return Response(
                {"error": "sale_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sale = Sales.objects.filter(pk=sale_id).first()
        if sale is None:
            return Response({"error": "Sale not found"}, status=status.HTTP_404_NOT_FOUND)

        ct = ContentType.objects.get_for_model(Sales)
        payments = self.get_queryset().filter(content_type=ct, object_id=sale_id).order_by(
            "-created_at", "-id"
        )
        serializer = self.get_serializer(payments, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def for_purchase(self, request):
        purchase_id = request.query_params.get("purchase_id")
        if not purchase_id:
            return Response(
                {"error": "purchase_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        purchase = RawMaterialPurchase.objects.filter(pk=purchase_id).first()
        if purchase is None:
            return Response(
                {"error": "Purchase not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        ct = ContentType.objects.get_for_model(RawMaterialPurchase)
        payments = self.get_queryset().filter(
            content_type=ct, object_id=purchase_id
        ).order_by("-created_at", "-id")
        serializer = self.get_serializer(payments, many=True)
        return Response(serializer.data)
