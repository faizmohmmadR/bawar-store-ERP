import { ArrowDownRight, ArrowUpRight, Receipt, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatLedgerAmount } from '@/lib/dailyLedger/utils';
import type { DailyLedgerTotals } from '@/types/dailyLedger';
import { cn } from '@/lib/utils';

interface DailyLedgerSummaryCardsProps {
  totals: DailyLedgerTotals;
  baseCode: string;
}

export function DailyLedgerSummaryCards({ totals, baseCode }: DailyLedgerSummaryCardsProps) {
  const { t } = useLanguage();
  const fmt = (value: number) => formatLedgerAmount(value, baseCode);
  const netPositive = totals.net_cash_base >= 0;

  const cards = [
    {
      key: 'count',
      label: t('reports.transactions'),
      value: String(totals.record_count),
      hint: t('accounts.ledgerLines', 'Journal lines'),
      icon: Receipt,
      valueClass: 'text-foreground',
      iconClass: 'text-muted-foreground',
    },
    {
      key: 'in',
      label: t('reports.totalCashIn'),
      value: fmt(totals.cash_in_base),
      hint: t('accounts.cashPaymentsInOnly', 'Cash / bank inflows'),
      icon: ArrowUpRight,
      valueClass: 'text-emerald-700 dark:text-emerald-400',
      iconClass: 'text-emerald-600/70',
    },
    {
      key: 'out',
      label: t('reports.totalCashOut'),
      value: fmt(totals.cash_out_base),
      hint: t('accounts.cashPaymentsOutOnly', 'Cash / bank outflows'),
      icon: ArrowDownRight,
      valueClass: 'text-red-600',
      iconClass: 'text-red-500/70',
    },
    {
      key: 'net',
      label: t('accounts.netCashMovement', 'Net cash'),
      value: fmt(totals.net_cash_base),
      hint: t('accounts.afnEquivalentReporting', 'AFN reporting'),
      icon: Wallet,
      valueClass: netPositive
        ? 'text-emerald-700 dark:text-emerald-400'
        : 'text-red-600',
      iconClass: 'text-muted-foreground',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.key} className="shadow-sm">
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {card.label}
                </p>
                <p className={cn('truncate text-xl font-semibold tabular-nums', card.valueClass)}>
                  {card.value}
                </p>
                <p className="text-[11px] text-muted-foreground">{card.hint}</p>
              </div>
              <Icon className={cn('h-5 w-5 shrink-0', card.iconClass)} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
