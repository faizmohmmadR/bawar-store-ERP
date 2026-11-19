import { ReportAmount } from './ReportAmount';
import { HandCoins } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';

export type LoanReportMetric = 'loans_given' | 'loans_received' | 'loan_collections' | 'loan_repayments' | 'loans_receivable' | 'loans_payable' | 'principal_given' | 'principal_received';
export type LoanReportData = Record<LoanReportMetric, number> & {
  noncash_given: number;
  noncash_received: number;
};

export function LoanReportSection({ data, currency, onSelect }: {
  data: Partial<LoanReportData>;
  currency: string;
  onSelect: (metric: LoanReportMetric) => void;
}) {
  const { t } = useLanguage();
  const metrics: Array<{ key: LoanReportMetric; label: string; balance?: boolean }> = [
    { key: 'loans_receivable', label: t('reports.loansReceivable'), balance: true },
    { key: 'loans_payable', label: t('reports.loansPayable'), balance: true },
    { key: 'principal_given', label: t('reports.loanPrincipalGiven') },
    { key: 'principal_received', label: t('reports.loanPrincipalReceived') },
    { key: 'loans_given', label: t('reports.cashLent') },
    { key: 'loans_received', label: t('reports.cashBorrowed') },
    { key: 'loan_collections', label: t('reports.loanCollections') },
    { key: 'loan_repayments', label: t('reports.loanRepayments') },
  ];
  return <Card className="min-w-0 shadow-sm">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-base"><HandCoins className="h-4 w-4" />{t('reports.loanActivity')}</CardTitle>
      <CardDescription>{t('reports.loanReportHint')}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {metrics.map(metric => <button key={metric.key} type="button" onClick={() => onSelect(metric.key)}
          className="flex h-full min-w-0 flex-col rounded-lg border bg-muted/10 p-4 text-start transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <p className="min-h-12 text-sm leading-relaxed text-muted-foreground">{metric.label}</p>
          <p className="mt-1 text-lg font-semibold"><ReportAmount value={data[metric.key] || 0} currency={currency} /></p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{metric.balance ? t('reports.balanceAtPeriodEnd') : t('reports.activityInPeriod')}</p>
        </button>)}
      </div>
      <div className="space-y-3 rounded-lg bg-muted/30 p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">{t('reports.noncashLoansHint')}</p>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="space-y-1"><p className="text-muted-foreground">{t('reports.loanPrincipalGiven')}</p><ReportAmount value={data.noncash_given || 0} currency={currency} /></div>
          <div className="space-y-1"><p className="text-muted-foreground">{t('reports.loanPrincipalReceived')}</p><ReportAmount value={data.noncash_received || 0} currency={currency} /></div>
        </div>
      </div>
    </CardContent>
  </Card>;
}
