import { Users, Truck, Banknote, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { PaymentModuleType } from '@/pages/payments/shared/paymentConfig';
import {
  formatMoney,
  getOrderCurrency,
  getOrderPaid,
  getOrderRemaining,
  getOrderTotal,
  getPartyName,
  OrderRecord,
} from '@/pages/payments/shared/orderHelpers';

interface OrderPaymentSummaryProps {
  type: PaymentModuleType;
  order: OrderRecord;
  totalPaid?: number;
  loading?: boolean;
}

const OrderPaymentSummary = ({ type, order, totalPaid, loading }: OrderPaymentSummaryProps) => {
  const { t } = useLanguage();
  const currency = getOrderCurrency(order);
  const total = getOrderTotal(order);
  const paid = totalPaid ?? getOrderPaid(order);
  const remaining = Math.max(0, total - paid);
  const paidPercent = total > 0 ? Math.min(100, (paid / total) * 100) : 0;

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-2 border-primary/10 shadow-sm">
      <div
        className={`h-1.5 ${
          remaining <= 0
            ? 'bg-gradient-to-r from-green-500 to-primary'
            : 'bg-gradient-to-r from-primary to-accent'
        }`}
        style={{ width: `${paidPercent}%`, minWidth: paid > 0 ? '4%' : '0' }}
      />
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              {t('sales.invoiceNumber')}
            </p>
            <p className="text-xl font-bold">{order.invoice_number}</p>
          </div>
          <Badge variant={remaining <= 0 ? 'default' : 'destructive'} className="text-sm">
            {remaining <= 0 ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t('payments.fullyPaid')}
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                {t('payments.outstanding')}
              </span>
            )}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
            {type === 'sale' ? (
              <Users className="h-5 w-5 text-primary shrink-0" />
            ) : (
              <Truck className="h-5 w-5 text-accent shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {t('sales.customer')}
              </p>
              <p className="font-medium truncate">{getPartyName(order, type)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
            <Banknote className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">{t('payments.currency')}</p>
              <p className="font-medium">
                {currency?.code} ({currency?.symbol})
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2">
          <div className="rounded-lg border bg-background p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">{t('payments.totalAmount')}</p>
            <p className="font-bold text-base">{formatMoney(total, currency)}</p>
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/10 dark:bg-green-950/20 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">{t('payments.totalPaid')}</p>
            <p className="font-bold text-base text-primary dark:text-green-400">
              {formatMoney(paid, currency)}
            </p>
          </div>
          <div
            className={`rounded-lg border p-3 text-center ${
              remaining > 0
                ? 'border-red-200 bg-red-50 dark:bg-red-950/20'
                : 'border-primary/30 bg-primary/10 dark:bg-green-950/20'
            }`}
          >
            <p className="text-xs text-muted-foreground mb-1">{t('payments.totalDue')}</p>
            <p
              className={`font-bold text-base ${
                remaining > 0 ? 'text-red-700 dark:text-red-400' : 'text-primary dark:text-green-400'
              }`}
            >
              {formatMoney(remaining, currency)}
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t('payments.paymentProgress')}</span>
            <span>{paidPercent.toFixed(0)}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                remaining <= 0 ? 'bg-primary/100' : 'bg-primary'
              }`}
              style={{ width: `${paidPercent}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default OrderPaymentSummary;
