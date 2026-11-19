import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit, ExternalLink, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import useFetchObjects from '@/api/useFetchObjects';
import JournalEntriesSection from '@/components/accounting/JournalEntriesSection';
import { formatOrderNumeric } from '@/lib/orderNumeric';
import { FALLBACK_BASE_SYMBOL } from '@/lib/currencies';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';
import type { SalesmanCommissionPayment } from '@/types/salesmanCommissionPayment';

const SalesmanCommissionPaymentDetails = () => {
  const { t } = useLanguage();
  const { formatDate } = useFormatAppDate();
  const navigate = useNavigate();
  const { id } = useParams();
  const afnSymbol = resolveCurrencySymbol(1) || FALLBACK_BASE_SYMBOL;

  const { data: payment, isLoading } = useFetchObjects<SalesmanCommissionPayment>({
    queryKey: ['salesman-commission-payments', id],
    endpoint: `salesman-commission-payments/${id}`,
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">{t('common.loading')}</div>
    );
  }

  if (!payment) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-muted-foreground">{t('salesmen.commissionPaymentNotFound')}</p>
        <Button variant="outline" onClick={() => navigate('/salesman-commission-payments')}>
          <ArrowLeft className="me-1.5 h-4 w-4" />
          {t('common.back')}
        </Button>
      </div>
    );
  }

  const amountLabel = `${formatOrderNumeric(Number(payment.amount) || 0)} ${afnSymbol}`;
  const methodLabel = t(
    `payments.methods.${payment.payment_method || 'cash'}`,
    payment.payment_method || 'cash',
  );
  const refLabel = payment.reference_number || `SCP-${payment.id}`;

  return (
    <div className="w-full max-w-[1800px] mx-auto p-4 sm:p-6 lg:p-8 space-y-5">
      <Card className="border-border/70 shadow-sm overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/10 px-4 py-3 sm:px-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 -ms-1"
              onClick={() => navigate('/salesman-commission-payments')}
            >
              <ArrowLeft className="me-1.5 h-4 w-4" />
              {t('common.back')}
            </Button>
            <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
            <div className="min-w-0 flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Wallet className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold leading-tight sm:text-lg">
                  {t('salesmen.commissionPaymentDetails')}
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-mono font-medium text-foreground/80">{refLabel}</span>
                  <span className="mx-1.5 text-border">·</span>
                  {formatDate(payment.payment_date)}
                  <span className="mx-1.5 text-border">·</span>
                  <span className="tabular-nums text-foreground/80">{amountLabel}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Badge variant="secondary" className="h-7 font-normal capitalize">
              {methodLabel}
            </Badge>
            <Badge variant="secondary" className="h-7 font-mono font-normal">
              AFN
            </Badge>
            <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => navigate(`/salesman-commission-payments/${payment.id}/edit`)}
            >
              <Edit className="me-1.5 h-3.5 w-3.5" />
              {t('common.edit')}
            </Button>
            {payment.salesman ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => navigate(`/salesmen/${payment.salesman}`)}
              >
                <ExternalLink className="me-1.5 h-3.5 w-3.5" />
                {t('salesmen.viewSalesman')}
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
              {t('payments.paymentMethod')}
            </p>
            <p className="mt-0.5 text-sm font-medium capitalize">{methodLabel}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('salesmen.name')}
            </p>
            <p className="mt-0.5 text-sm font-medium">
              {payment.salesman_details?.name || '—'}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('payments.currency')}
            </p>
            <p className="mt-0.5 text-sm font-medium font-mono">AFN ({afnSymbol})</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('payments.referenceNumber')}
            </p>
            <p className="mt-0.5 text-sm font-medium font-mono">{refLabel}</p>
          </div>
          {payment.notes ? (
            <div className="col-span-2 sm:col-span-3 lg:col-span-4 xl:col-span-5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('common.notes')}
              </p>
              <p className="mt-0.5 text-sm">{payment.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <JournalEntriesSection model="salesman-commission-payment" objectId={payment.id} />
    </div>
  );
};

export default SalesmanCommissionPaymentDetails;
