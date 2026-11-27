import { Link } from 'react-router-dom';
import { Banknote, Landmark, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatReportMoney } from '@/lib/formatNumber';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

export type ActivityRow = {
  key: string;
  label: string;
  amount_afn: number;
  count?: number;
  kind?: string;
  group?: string;
};

export type ActivitySummary = {
  currency?: string;
  rows?: ActivityRow[];
  totals?: {
    sales_net_afn?: number;
    purchases_afn?: number;
    expenses_afn?: number;
    gross_profit_afn?: number;
    net_profit_afn?: number;
    net_cash_flow_afn?: number;
  };
  balances?: {
    safe_drawer_afn?: number;
    cash_afn?: number;
    bank_afn?: number;
    sarafi_afn?: number;
    liquid_total_afn?: number;
  };
  notes?: string[];
};

/** Keep dashboard short: only these period lines, in this order. */
const SUMMARY_KEYS = [
  'sales_net',
  'sales_collected',
  'purchases_received',
  'expenses_paid',
  'payroll_paid',
  'loans_received',
  'loans_given',
  'gross_profit',
  'net_profit',
  'net_cash_flow',
] as const;

type Props = {
  activity?: ActivitySummary | null;
  periodLabel?: string;
  currency?: string;
};

export function DashboardActivitySection({ activity, periodLabel, currency }: Props) {
  const { t } = useLanguage();
  const code = currency || activity?.currency || 'AFN';
  const totals = activity?.totals || {};
  const balances = activity?.balances || {};
  const byKey = new Map((activity?.rows || []).map((row) => [row.key, row]));

  const periodCards = [
    {
      key: 'sales',
      label: t('core.dashboard.activityNetSales', 'Net sales'),
      value: Number(totals.sales_net_afn) || 0,
      tone: 'good' as const,
    },
    {
      key: 'purchases',
      label: t('core.dashboard.activityPurchasesTotal', 'Purchases'),
      value: Number(totals.purchases_afn) || 0,
      tone: 'neutral' as const,
    },
    {
      key: 'expenses',
      label: t('core.dashboard.activityExpensesTotal', 'Expenses & payroll'),
      value: Number(totals.expenses_afn) || 0,
      tone: 'bad' as const,
    },
    {
      key: 'profit',
      label: t('core.dashboard.activityNetProfit', 'Net profit'),
      value: Number(totals.net_profit_afn) || 0,
      tone: (Number(totals.net_profit_afn) || 0) >= 0 ? ('good' as const) : ('bad' as const),
    },
    {
      key: 'cashflow',
      label: t('core.dashboard.activityNetCash', 'Net cash flow'),
      value: Number(totals.net_cash_flow_afn) || 0,
      tone: (Number(totals.net_cash_flow_afn) || 0) >= 0 ? ('good' as const) : ('bad' as const),
    },
  ];

  const nowCards = [
    {
      key: 'safe',
      label: t('core.dashboard.balanceSafe', 'Safe (drawer)'),
      value: Number(balances.safe_drawer_afn) || 0,
      icon: <Banknote className="h-4 w-4" />,
      href: '/cash-register',
    },
    {
      key: 'cash',
      label: t('core.dashboard.balanceCash', 'Cash account'),
      value: Number(balances.cash_afn) || 0,
      icon: <Wallet className="h-4 w-4" />,
      href: '/gl-accounts',
    },
    {
      key: 'bank',
      label: t('core.dashboard.balanceBank', 'Bank'),
      value: Number(balances.bank_afn) || 0,
      icon: <Landmark className="h-4 w-4" />,
      href: '/gl-accounts',
    },
  ];

  const summaryRows = SUMMARY_KEYS.map((key) => byKey.get(key)).filter(
    (row): row is ActivityRow => Boolean(row),
  );

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            {t('core.dashboard.dailyActivity', 'Period activity')}
            {periodLabel ? (
              <span className="ms-2 text-sm font-normal text-muted-foreground">
                · {periodLabel}
              </span>
            ) : null}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'core.dashboard.activityOnlyHint',
              'Only amounts that happened in this period. Empty day = zeros.',
            )}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {periodCards.map((card) => (
            <Card
              key={card.key}
              className={cn(
                'border-l-4 shadow-none',
                card.tone === 'good' && 'border-l-emerald-500',
                card.tone === 'bad' && 'border-l-red-500',
                card.tone === 'neutral' && 'border-l-sky-500',
              )}
            >
              <CardContent className="space-y-1 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {card.label}
                </p>
                <p
                  className={cn(
                    'text-xl font-semibold tabular-nums',
                    card.tone === 'good' && 'text-emerald-700 dark:text-emerald-400',
                    card.tone === 'bad' && 'text-red-700 dark:text-red-400',
                  )}
                >
                  {formatReportMoney(card.value, code)}{' '}
                  <span className="text-sm font-medium text-muted-foreground">{code}</span>
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="shadow-none">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-muted-foreground">
                  <th className="px-4 py-2.5 text-start font-medium">
                    {t('core.dashboard.activityItem', 'Item')}
                  </th>
                  <th className="px-4 py-2.5 text-end font-medium">
                    {t('core.dashboard.activityAmount', 'Amount')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((row) => {
                  const amount = Number(row.amount_afn) || 0;
                  const positive = row.kind === 'income' || (row.kind === 'profit' && amount >= 0);
                  const negative = row.kind === 'expense' || (row.kind === 'profit' && amount < 0);
                  return (
                    <tr key={row.key} className="border-b last:border-0">
                      <td className="px-4 py-2.5 font-medium">{row.label}</td>
                      <td
                        className={cn(
                          'px-4 py-2.5 text-end tabular-nums font-semibold',
                          positive && 'text-emerald-700 dark:text-emerald-400',
                          negative && 'text-red-700 dark:text-red-400',
                        )}
                      >
                        {formatReportMoney(amount, code)} {code}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            {t('core.dashboard.currentBalances', 'Now')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'core.dashboard.balancesHint',
              'Current position — not period activity. Safe = drawer; Cash/Bank = accounts.',
            )}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {nowCards.map((card) => (
            <Link key={card.key} to={card.href} className="block">
              <Card className="shadow-none transition-colors hover:bg-muted/30">
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {card.label}
                    </p>
                    <p className="text-xl font-semibold tabular-nums">
                      {formatReportMoney(card.value, code)}{' '}
                      <span className="text-sm font-medium text-muted-foreground">{code}</span>
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/60 p-2 text-muted-foreground">
                    {card.icon}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
