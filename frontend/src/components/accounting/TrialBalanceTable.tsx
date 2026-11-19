import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatementAmount } from '@/components/accounting/StatementAmount';
import {
  ReportStatementFrame,
  reportModeLabel,
} from '@/components/accounting/ReportStatementFrame';
import { useLanguage } from '@/contexts/LanguageContext';
import type { TrialBalanceResponse } from '@/types/accountingReports';
import { cn } from '@/lib/utils';

export function TrialBalanceTable({ data }: { data: TrialBalanceResponse }) {
  const { t } = useLanguage();
  const currency = data.currency_details || data.base_currency;
  const modeLabel = reportModeLabel(data, t, currency);

  return (
    <ReportStatementFrame
      title={t('accounts.trialBalance')}
      modeLabel={modeLabel}
      currency={currency}
      showBalanceStatus
      isBalanced={data.totals.is_balanced}
      expectsBalance={data.expects_balance}
      balanceNote={data.balance_note}
      difference={data.totals.difference}
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-20 ps-5 text-xs font-semibold uppercase tracking-wide">
                {t('accounts.code', 'Code')}
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">
                {t('accounts.account', 'Account')}
              </TableHead>
              <TableHead className="w-28 text-xs font-semibold uppercase tracking-wide">
                {t('accounts.type', 'Type')}
              </TableHead>
              <TableHead className="w-40 text-start text-xs font-semibold uppercase tracking-wide">
                {t('accounts.debit')}
              </TableHead>
              <TableHead className="w-40 text-start text-xs font-semibold uppercase tracking-wide">
                {t('accounts.credit')}
              </TableHead>
              <TableHead className="w-40 pe-5 text-start text-xs font-semibold uppercase tracking-wide">
                {t('accounts.balance')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center text-muted-foreground">
                  {t('accounts.noReportData')}
                </TableCell>
              </TableRow>
            ) : (
              data.rows.map((row) => (
                <TableRow key={row.gl_account_id ?? row.code} className="hover:bg-muted/15">
                  <TableCell className="ps-5 font-mono text-xs text-muted-foreground">
                    {row.code}
                  </TableCell>
                  <TableCell className="text-sm font-medium">{row.name}</TableCell>
                  <TableCell className="text-xs capitalize text-muted-foreground">
                    {t(`accounts.glCategories.${row.category}`, row.category)}
                  </TableCell>
                  <TableCell className="text-start">
                    <StatementAmount value={row.total_debit} currency={currency} dashZero />
                  </TableCell>
                  <TableCell className="text-start">
                    <StatementAmount value={row.total_credit} currency={currency} dashZero />
                  </TableCell>
                  <TableCell className="pe-5 text-start">
                    <StatementAmount value={row.balance} currency={currency} emphasis />
                  </TableCell>
                </TableRow>
              ))
            )}
            {data.rows.length > 0 && (
              <TableRow className="border-t-2 bg-muted/20 font-semibold hover:bg-muted/20">
                <TableCell colSpan={3} className="ps-5 text-sm">
                  {t('accounts.total')}
                </TableCell>
                <TableCell className="text-start">
                  <StatementAmount value={data.totals.total_debit} currency={currency} emphasis />
                </TableCell>
                <TableCell className="text-start">
                  <StatementAmount value={data.totals.total_credit} currency={currency} emphasis />
                </TableCell>
                <TableCell className="pe-5 text-start">
                  <StatementAmount
                    value={data.totals.difference}
                    currency={currency}
                    emphasis
                    className={cn(!data.totals.is_balanced && 'text-red-600')}
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </ReportStatementFrame>
  );
}
