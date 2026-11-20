import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, Plus, Edit, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { Payment } from '@/types/payment';
import { getPaymentConfig, PaymentModuleType } from './paymentConfig';
import {
  formatMoney,
  getOrderCurrency,
  getOrderTotal,
  getPartyName,
  OrderRecord,
} from './orderHelpers';

interface OrderPaymentsPageProps {
  type: PaymentModuleType;
}

const OrderPaymentsPage = ({ type }: OrderPaymentsPageProps) => {
  const { orderId } = useParams<{ orderId: string }>();
  const { t } = useLanguage();
  const { formatDateTime } = useFormatAppDate();
  const navigate = useNavigate();
  const config = getPaymentConfig(type);

  const { data: orderData, isLoading: orderLoading } = useFetchObjects<OrderRecord>({
    queryKey: [config.ordersEndpoint, orderId],
    endpoint: `${config.ordersEndpoint}/${orderId}/`,
    enabled: !!orderId,
  });

  const { data: paymentsData, isLoading: paymentsLoading } = useFetchObjects({
    queryKey: [config.queryKey, 'order', orderId],
    endpoint: config.forOrderEndpoint(orderId!),
    enabled: !!orderId,
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: [config.queryKey, 'order', orderId!],
    endpoint: 'payments',
  });

  const payments: Payment[] = Array.isArray(paymentsData)
    ? paymentsData
    : paymentsData?.results || [];

  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const currency = orderData ? getOrderCurrency(orderData) : null;
  const total = orderData ? getOrderTotal(orderData) : 0;
  const totalDue = Math.max(0, total - totalPaid);
  const isLoading = orderLoading || paymentsLoading;

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">{t('common.loading')}</div>;
  }

  if (!orderData) {
    return <div className="flex items-center justify-center h-64">{t('payments.noPayments')}</div>;
  }

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      <Button
        variant="ghost"
        onClick={() =>
          navigate(
            type === 'purchase'
              ? `/purchases/${orderId}`
              : `/sales/${orderId}`,
          )
        }
        className="mb-4"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t('common.back')}
      </Button>

      <div className="bg-gradient-to-r from-primary to-accent rounded-lg p-6 mb-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">{t('payments.paymentHistory')}</h1>
            <p className="text-primary-foreground/80">{orderData.invoice_number}</p>
          </div>
          <CreditCard className="h-16 w-16 opacity-50" />
        </div>
      </div>

      <div className="flex justify-end gap-2 mb-4">
        <Button variant="outline" onClick={() => navigate(config.listPath)}>
          {t('payments.viewAll')}
        </Button>
        <Button onClick={() => navigate(config.orderAddPath(orderId!))}>
          <Plus className="h-4 w-4" />
          {t('payments.addPayment')}
        </Button>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {t('payments.relatedSale')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
                {t('sales.invoiceNumber')}
              </p>
              <p className="font-medium text-lg">{orderData.invoice_number}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {t('sales.customer')}
              </p>
              <p className="font-medium text-lg">{getPartyName(orderData, type)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('payments.totalAmount')}</p>
              <p className="font-medium text-lg text-primary">
                {formatMoney(total, currency)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('payments.totalPaid')}</p>
              <p className="font-medium text-lg text-primary">
                {formatMoney(totalPaid, currency)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('payments.totalDue')}</p>
              <p className={`font-medium text-lg ${totalDue > 0 ? 'text-destructive' : 'text-primary'}`}>
                {formatMoney(totalDue, currency)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('payments.currency')}</p>
              <Badge variant="secondary" className="mt-1">
                {currency ? `${currency.code} (${currency.symbol})` : t('payments.notAvailable')}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('payments.paymentHistory')}</CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>{t('payments.noPaymentsForOrder')}</p>
                <Button className="mt-4" onClick={() => navigate(config.orderAddPath(orderId!))}>
                  <Plus className="h-4 w-4" />
                  {t('payments.addPayment')}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0"
                  >
                    <div>
                      <p className="font-medium text-primary">
                        {payment.currency_details?.symbol || currency?.symbol}
                        {Number(payment.amount).toFixed(2)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDateTime(payment.payment_date)}
                      </p>
                      {payment.reference_number && (
                        <p className="text-sm font-mono text-muted-foreground">
                          {payment.reference_number}
                        </p>
                      )}
                      {payment.notes && <p className="text-sm mt-1">{payment.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(payment.vendor_goods_source ? `/raw-material-sales/${payment.vendor_goods_source.id}` : payment.general_payment ? `${config.listPath}/general/${payment.general_payment}` : config.detailPath(payment.id))}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(payment.vendor_goods_source ? `/raw-material-sales/${payment.vendor_goods_source.id}/edit` : payment.general_payment ? `${config.listPath}/general/${payment.general_payment}/edit` : config.editPath(payment.id))}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {!payment.general_payment && <Button variant="ghost" size="sm" onClick={() => handleDelete(payment.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog />
    </div>
  );
};

export default OrderPaymentsPage;
