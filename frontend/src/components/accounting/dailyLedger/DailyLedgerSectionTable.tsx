import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatLedgerAmount } from '@/lib/dailyLedger/utils';
import type { DailyLedgerSectionSummary } from '@/types/dailyLedger';

interface DailyLedgerSectionTableProps {
  sections: DailyLedgerSectionSummary[];
  baseCode: string;
}

export function DailyLedgerSectionTable({ sections, baseCode }: DailyLedgerSectionTableProps) {
  const { t } = useLanguage();

  if (sections.length === 0) return null;

  return (
    <Card className="shadow-sm print:break-inside-avoid">
      <CardHeader className="border-b py-3">
        <CardTitle className="text-sm font-semibold">
          {t('accounts.dailyLedgerSummary', 'Summary by type')}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t('reports.type', 'Type')}</th>
                <th className="px-4 py-2.5 text-start font-medium">
                  {t('reports.transactions')}
                </th>
                <th className="px-4 py-2.5 text-start font-medium">
                  {t('accounts.baseAmount', 'Base amount')} ({baseCode})
                </th>
              </tr>
            </thead>
            <tbody>
              {sections.map((sec) => (
                <tr key={sec.section} className="border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{sec.label}</span>
                    {sec.is_cash_movement && (
                      <span className="ms-2 text-xs text-muted-foreground">
                        ({t('accounts.cash', 'cash')})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-start tabular-nums text-muted-foreground">
                    {sec.count}
                  </td>
                  <td className="px-4 py-2.5 text-start tabular-nums font-medium">
                    {formatLedgerAmount(sec.amount_base, baseCode)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
