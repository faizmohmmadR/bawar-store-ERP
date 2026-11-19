import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, CreditCard, DollarSign, Edit, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import useFetchObjects from '@/api/useFetchObjects';
import type { Loan } from '@/types/loan';
import { getLoanDirectionLabel, getLoanScenarioLabel } from '@/lib/loanUtils';
import { formatLoanMoney, getLoanCurrencyCode } from '@/lib/loanFormat';
import JournalEntriesSection from '@/components/accounting/JournalEntriesSection';

const LoanDetails = () => {
  const { t } = useLanguage();
  const { formatDateTime } = useFormatAppDate();
  const navigate = useNavigate();
  const { id } = useParams();

  const { data: loan, isLoading } = useFetchObjects<Loan>({
    queryKey: ['loan', id],
    endpoint: `loans/${id}/`,
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">{t('common.loading')}</div>;
  }

  if (!loan) {
    return <div className="flex items-center justify-center h-64">{t('loans.notFound')}</div>;
  }

  const loanerType = loan.loaner_type;
  const scenarioLabel = getLoanScenarioLabel(loanerType, loan.loan_type, t);
  const directionLabel = getLoanDirectionLabel(loanerType, loan.loan_type, t);
  const balanceDue = loan.balance_due ?? Number(loan.amount) - Number(loan.amount_paid || 0);
  const paidPercent = loan.amount
    ? Math.min(100, (Number(loan.amount_paid || 0) / Number(loan.amount)) * 100)
    : 0;
  const loanerName = loan.loaner_name || t('common.notAvailable');
  const currencyCode = getLoanCurrencyCode(loan);
  const methodLabel = t(
    `payments.methods.${loan.payment_method || 'cash'}`,
    loan.payment_method || 'cash',
  );
  const amountLabel = `${formatLoanMoney(loan.amount, loan)} ${currencyCode}`.trim();

  return (
    <div className="w-full max-w-[1800px] mx-auto p-4 sm:p-6 lg:p-8 space-y-5">
      <Card className="border-border/70 shadow-sm overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/10 px-4 py-3 sm:px-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 -ms-1"
              onClick={() => navigate('/loans')}
            >
              <ArrowLeft className="me-1.5 h-4 w-4" />
              {t('common.back')}
            </Button>
            <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
            <div className="min-w-0 flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <DollarSign className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold leading-tight sm:text-lg">
                  {t('loans.loanDetails')}
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/80">{loanerName}</span>
                  <span className="mx-1.5 text-border">·</span>
                  {formatDateTime(loan.loan_date)}
                  <span className="mx-1.5 text-border">·</span>
                  <span className="tabular-nums text-foreground/80">{amountLabel}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Badge variant="secondary" className="h-7 font-normal">
              {directionLabel}
            </Badge>
            {loan.is_paid ? (
              <Badge className="h-7 bg-primary/15 text-primary border-primary/30 font-normal">
                <CheckCircle className="h-3 w-3 me-1" />
                {t('loans.status.paid')}
              </Badge>
            ) : (
              <Badge className="h-7 bg-red-100 text-red-700 border-red-200 font-normal">
                <XCircle className="h-3 w-3 me-1" />
                {t('loans.status.unpaid')}
              </Badge>
            )}
            {loan.is_opening_balance ? (
              <Badge variant="outline" className="h-7 font-normal">
                {t('loans.openingBalanceShort')}
              </Badge>
            ) : (
              <Badge variant="secondary" className="h-7 font-normal capitalize">
                {methodLabel}
              </Badge>
            )}
            {currencyCode ? (
              <Badge variant="secondary" className="h-7 font-mono font-normal">
                {currencyCode}
              </Badge>
            ) : null}
            <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
            <Button variant="outline" size="sm" onClick={() => navigate(`/loan-payments?loan=${id}`)}>{t('loans.paymentHistory')}</Button>
            {!loan.is_paid && (
              <Button size="sm" className="h-8" onClick={() => navigate(`/loan-payments/add?loan=${id}`)}>
                <CreditCard className="me-1.5 h-3.5 w-3.5" />
                {t('loans.addPayment')}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => navigate(`/loans/${id}/edit`)}
            >
              <Edit className="me-1.5 h-3.5 w-3.5" />
              {t('loans.edit')}
            </Button>
          </div>
        </div>

        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('loans.amount')}
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">{amountLabel}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('loans.amountPaid')}
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-primary">
                {formatLoanMoney(loan.amount_paid || 0, loan)}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('loans.balanceDue')}
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-red-600">
                {formatLoanMoney(balanceDue, loan)}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('loans.loanDate')}
              </p>
              <p className="mt-0.5 text-sm font-medium">{formatDateTime(loan.loan_date)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('loans.loanerType')}
              </p>
              <p className="mt-0.5 text-sm font-medium">
                {loanerType === 'vendor'
                  ? t('loans.loanerTypes.vendor')
                  : t('loans.loanerTypes.customer')}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('loans.loanType')}
              </p>
              <p className="mt-0.5 text-sm font-medium">{scenarioLabel}</p>
            </div>
            {!loan.is_opening_balance && !loan.source_payment ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('loans.paymentAccount', 'Paid from / Received in')}
                </p>
                <p className="mt-0.5 text-sm font-medium capitalize">{methodLabel}</p>
              </div>
            ) : null}
            {loan.bill_number ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('loans.billNumber')}
                </p>
                <p className="mt-0.5 text-sm font-medium font-mono">#{loan.bill_number}</p>
              </div>
            ) : null}
            {loan.bill_file && <div><a href={loan.bill_file} target="_blank" rel="noreferrer" className="text-sm text-primary underline">{t('loans.viewBill')}</a></div>}
            {loan.notes ? (
              <div className="col-span-2 sm:col-span-3 lg:col-span-4 xl:col-span-5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('loans.notes')}
                </p>
                <p className="mt-0.5 text-sm">{loan.notes}</p>
              </div>
            ) : null}
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">{t('loans.paid')}</span>
              <span className="font-medium tabular-nums">{Math.round(paidPercent)}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className="bg-primary h-1.5 rounded-full transition-all"
                style={{ width: `${paidPercent}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {!!loan.payments?.length && (
        <Card className="border-border/70 shadow-sm overflow-hidden">
          <CardHeader className="border-b border-border/60 bg-muted/10 py-3 px-4 sm:px-5">
            <CardTitle className="text-base">{t('loans.paymentHistory')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {loan.payments.map(
                (payment) => (
                  <div
                    key={payment.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatLoanMoney(payment.amount, loan)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(payment.payment_date)}
                        {payment.payment_method
                          ? ` · ${t(`payments.methods.${payment.payment_method}`, payment.payment_method)}`
                          : ''}
                        {payment.reference_number
                          ? ` · ${t('loans.referenceShort')}: ${payment.reference_number}`
                          : ''}
                      </p>
                      {payment.bill_number && <p className="text-xs">{t('loans.billNumber')}: {payment.bill_number}</p>}
                      {payment.bill_file && <a href={payment.bill_file} target="_blank" rel="noreferrer" className="text-xs text-primary underline">{t('loans.viewBill')}</a>}
                      <Button variant="link" size="sm" onClick={() => navigate(`/loan-payments/${payment.id}/edit`)}>{t('loans.editPayment')}</Button>
                      {payment.notes ? (
                        <p className="text-xs mt-0.5 text-muted-foreground">{payment.notes}</p>
                      ) : null}
                    </div>
                  </div>
                ),
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <JournalEntriesSection model="loan" objectId={id!} includeRelated />


    </div>
  );
};

export default LoanDetails;
