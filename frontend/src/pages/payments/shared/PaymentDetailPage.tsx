import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CreditCard, Edit, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import useFetchObjects from '@/api/useFetchObjects';
import JournalEntriesSection from '@/components/accounting/JournalEntriesSection';
import { AttachedDocumentsList } from '@/components/forms/AttachedDocumentsField';
import { draftsFromDocuments } from '@/lib/attachments';
import { formatCurrencyAmount } from '@/lib/currencies';
import { Payment } from '@/types/payment';
import { getPaymentConfig, PaymentModuleType } from './paymentConfig';

interface PaymentDetailPageProps {
  type: PaymentModuleType;
}

const PaymentDetailPage = ({ type }: PaymentDetailPageProps) => {
  const { t } = useLanguage();
  const { formatDate } = useFormatAppDate();
  const navigate = useNavigate();
  const { id } = useParams();
  const config = getPaymentConfig(type);

  const { data: payment, isLoading } = useFetchObjects<Payment>({
    queryKey: ['payment', id],
    endpoint: `payments/${id}/`,
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">{t('common.loading')}</div>;
  }

  if (!payment) {
    return <div className="flex items-center justify-center h-64">{t('payments.noPayments')}</div>;
  }

  const orderId = payment.related_object_details?.id;
  const orderPath =
    type === 'purchase'
      ? `/raw-material-purchases/${orderId}`
      : `/sales/${orderId}`;
  const partyName =
    type === 'purchase'
      ? payment.related_object_details?.vendor_name
      : payment.related_object_details?.customer_name;
  const invoiceLabel =
    payment.related_object_details?.invoice_number ||
    payment.reference_number ||
    `#${payment.id}`;
  const currencyCode = payment.currency_details?.code || '';
  const amountLabel = formatCurrencyAmount(Number(payment.amount) || 0, payment.currency_details, {
    showCode: true,
  });
  const methodLabel = payment.vendor_goods_source ? t('rawMaterialSales.vendorSettlement', 'Vendor account settlement') : t(
    `payments.methods.${payment.payment_method || 'cash'}`,
    payment.payment_method || 'cash',
  );
  const typeLabel = payment.vendor_goods_source ? t('rawMaterialSales.vendorSettlement', 'Vendor account settlement') : type === 'purchase' ? t('payments.purchasePayment', 'Purchase payment') : t('payments.salePayment');
  const isIntermediary = payment.payment_method === 'intermediary_credit' || !!payment.general_payment;

  return (
    <div className="w-full max-w-[1800px] mx-auto p-4 sm:p-6 lg:p-8 space-y-5">
      {payment.general_payment && <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-4">
        <span>{payment.vendor_goods_source ? t('rawMaterialSales.vendorSettlement', 'Vendor account settlement') : t('payments.generalAllocation', 'This amount is part of a general payment.')} {payment.vendor_goods_source?.invoice_number || `GPAY-${payment.general_payment}`}</span>
        <Button variant="outline" onClick={() => navigate(payment.vendor_goods_source ? `/raw-material-sales/${payment.vendor_goods_source.id}` : `${config.listPath}/general/${payment.general_payment}`)}>{t('payments.generalViewReceipt', 'View receipt')}</Button>
      </div>}
      <Card className="border-border/70 shadow-sm overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/10 px-4 py-3 sm:px-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 -ms-1"
              onClick={() => navigate(config.listPath)}
            >
              <ArrowLeft className="me-1.5 h-4 w-4" />
              {t('common.back')}
            </Button>
            <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
            <div className="min-w-0 flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CreditCard className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold leading-tight sm:text-lg">
                  {t('payments.paymentDetails')}
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-mono font-medium text-foreground/80">{invoiceLabel}</span>
                  <span className="mx-1.5 text-border">·</span>
                  {formatDate(payment.payment_date)}
                  <span className="mx-1.5 text-border">·</span>
                  <span className="tabular-nums text-foreground/80">{amountLabel}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Badge variant="outline" className="h-7 font-normal">
              {typeLabel}
            </Badge>
            <Badge variant="secondary" className="h-7 font-normal capitalize">
              {methodLabel}
            </Badge>
            {currencyCode ? (
              <Badge variant="secondary" className="h-7 font-mono font-normal">
                {currencyCode}
              </Badge>
            ) : null}
            <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
            {!isIntermediary && (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => navigate(config.editPath(payment.id))}
              >
                <Edit className="me-1.5 h-3.5 w-3.5" />
                {t('common.edit')}
              </Button>
            )}
            {isIntermediary && payment.intermediary_loan ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => navigate(`/loans/${payment.intermediary_loan}`)}
              >
                <ExternalLink className="me-1.5 h-3.5 w-3.5" />
                {t('payments.settleIntermediaryDebt', 'Settle Intermediary Debt')}
              </Button>
            ) : null}
            {orderId ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => navigate(orderPath)}
              >
                <ExternalLink className="me-1.5 h-3.5 w-3.5" />
                {type === 'purchase'
                  ? t('payments.viewPurchase', 'View purchase')
                  : t('payments.viewSale')}
              </Button>
            ) : null}
          </div>
        </div>

        <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-3 p-4 sm:p-5">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('payments.amount')}
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-primary">{amountLabel}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('payments.paymentDate')}
            </p>
            <p className="mt-0.5 text-sm font-medium">{formatDate(payment.payment_date)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('payments.paymentMethod', 'Payment method')}
            </p>
            <p className="mt-0.5 text-sm font-medium capitalize">{methodLabel}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('payments.relatedInvoice')}
            </p>
            <p className="mt-0.5 text-sm font-medium font-mono">
              {payment.related_object_details?.invoice_number || '—'}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {type === 'purchase'
                ? t('rawMaterialPurchases.vendor', 'Vendor')
                : t('sales.customer')}
            </p>
            <p className="mt-0.5 text-sm font-medium">{partyName || '—'}</p>
          </div>
          {payment.intermediary_vendor_details?.name ? (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('payments.intermediaryParty', 'Intermediary (Sarafi/Bank)')}
              </p>
              <p className="mt-0.5 text-sm font-medium">{payment.intermediary_vendor_details.name}</p>
            </div>
          ) : null}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('payments.currency')}
            </p>
            <p className="mt-0.5 text-sm font-medium font-mono">
              {payment.currency_details
                ? `${payment.currency_details.code}${
                    payment.currency_details.symbol ? ` (${payment.currency_details.symbol})` : ''
                  }`
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('payments.referenceNumber')}
            </p>
            <p className="mt-0.5 text-sm font-medium font-mono">{payment.reference_number || '—'}</p>
          </div>
          {payment.notes ? (
            <div className="col-span-2 sm:col-span-3 lg:col-span-4 xl:col-span-5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('payments.notes')}
              </p>
              <p className="mt-0.5 text-sm">{payment.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/60 bg-muted/10 py-3 px-4 sm:px-5">
          <CardTitle className="text-base">{t('common.attachments.title', 'Documents')}</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <AttachedDocumentsList documents={draftsFromDocuments(payment.documents)} />
        </CardContent>
      </Card>

      <JournalEntriesSection model="payment" objectId={payment.id} />
    </div>
  );
};

export default PaymentDetailPage;
