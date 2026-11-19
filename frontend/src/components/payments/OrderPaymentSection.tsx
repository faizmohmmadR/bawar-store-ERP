import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Plus, ExternalLink } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import useFetchObjects from '@/api/useFetchObjects';
import { getPaymentConfig } from '@/pages/payments/shared/paymentConfig';

interface Payment {
  id: number;
  general_payment?: number | null;
  vendor_goods_source?: { id: number; invoice_number: string };
  payment_type: 'sale' | 'purchase';
  amount: number;
  payment_date: string;
  currency_details?: { symbol?: string; code?: string };
  reference_number?: string | null;
}

interface OrderPaymentSectionProps {
  type?: 'sale' | 'purchase';
  orderId: string;
  totalAmount: number;
  currencySymbol?: string;
  allowPayment?: boolean;
}

const OrderPaymentSection = ({
  type = 'sale',
  orderId,
  totalAmount,
  currencySymbol = '',
  allowPayment = true,
}: OrderPaymentSectionProps) => {
  const { t } = useLanguage();
  const { formatDateTime } = useFormatAppDate();
  const navigate = useNavigate();
  const config = getPaymentConfig(type);

  const { data: paymentsData, isLoading } = useFetchObjects({
    queryKey: ['payments', type, orderId],
    endpoint: config.forOrderEndpoint(orderId),
    enabled: !!orderId,
  });

  const payments: Payment[] = Array.isArray(paymentsData)
    ? paymentsData
    : paymentsData?.results || [];

  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalDue = Math.max(0, Number(totalAmount) - totalPaid);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {t('payments.paymentHistory')}
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(config.orderPath(orderId))}>
              <ExternalLink className="h-4 w-4 mr-1" />
              {t('payments.viewAll')}
            </Button>
            <Button size="sm" disabled={!allowPayment} onClick={() => navigate(config.orderAddPath(orderId))}>
              <Plus className="h-4 w-4" />
              {t('payments.addPayment')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 p-4 bg-muted/50 rounded-lg">
          <div>
            <p className="text-sm text-muted-foreground">{t('payments.totalAmount')}</p>
            <p className="font-semibold">{currencySymbol}{Number(totalAmount).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('payments.totalPaid')}</p>
            <p className="font-semibold text-primary">{currencySymbol}{totalPaid.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('payments.totalDue')}</p>
            <p className={`font-bold ${totalDue > 0 ? 'text-destructive' : 'text-primary'}`}>
              {currencySymbol}{totalDue.toFixed(2)}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t('payments.noPaymentsForOrder')}
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((payment) => (
              <div key={payment.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                <div>
                  <p className="font-medium">
                    {payment.currency_details?.symbol || currencySymbol}
                    {Number(payment.amount).toFixed(2)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(payment.payment_date)}
                  </p>
                  {payment.reference_number && (
                    <p className="text-xs font-mono text-muted-foreground">{payment.reference_number}</p>
                  )}
                </div>
                {payment.vendor_goods_source ? <Button variant="outline" size="sm" onClick={() => navigate(`/raw-material-sales/${payment.vendor_goods_source!.id}`)}>{payment.vendor_goods_source.invoice_number}</Button> : payment.general_payment ? <Button variant="outline" size="sm" onClick={() => navigate(`${config.listPath}/general/${payment.general_payment}`)}>GPAY-{payment.general_payment}</Button> : <Badge variant="outline">{type === 'purchase' ? t('payments.purchasePayment', 'Purchase payment') : t('payments.salePayment')}</Badge>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderPaymentSection;
