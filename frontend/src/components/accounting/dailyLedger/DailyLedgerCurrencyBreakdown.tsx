import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatLedgerAmount } from '@/lib/dailyLedger/utils';
import type { DailyLedgerCurrencySummary } from '@/types/dailyLedger';

interface DailyLedgerCurrencyBreakdownProps {
  rows: DailyLedgerCurrencySummary[];
}

export function DailyLedgerCurrencyBreakdown({ rows }: DailyLedgerCurrencyBreakdownProps) {
  const { t } = useLanguage();

  if (!rows?.length) return null;

  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b py-3">
        <CardTitle className="text-sm font-semibold">
          {t('accounts.byTransactionCurrency', 'By transaction currency')}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((row) => (
            <div
              key={row.currency}
              className="rounded-lg border bg-muted/20 px-3 py-2.5 text-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold tracking-wide">{row.currency}</span>
                <span className="text-xs text-muted-foreground">
                  {row.count} {t('reports.transactions').toLowerCase()}
                </span>
              </div>
              <div className="flex justify-between text-xs text-emerald-700 dark:text-emerald-400">
                <span>{t('reports.totalCashIn')}</span>
                <span className="tabular-nums font-medium">
                  {formatLedgerAmount(row.cash_in, row.currency)}
                </span>
              </div>
              <div className="mt-1 flex justify-between text-xs text-red-600">
                <span>{t('reports.totalCashOut')}</span>
                <span className="tabular-nums font-medium">
                  {formatLedgerAmount(row.cash_out, row.currency)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
