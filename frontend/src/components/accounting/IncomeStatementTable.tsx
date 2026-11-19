import { StatementAmount } from '@/components/accounting/StatementAmount';
import {
  ReportStatementFrame,
  StatementLineRow,
  StatementSectionHeading,
  StatementTotalRow,
  reportModeLabel,
} from '@/components/accounting/ReportStatementFrame';
import { useLanguage } from '@/contexts/LanguageContext';
import type { CurrencyDetails } from '@/lib/currencies';
import type { GlReportRow, IncomeStatementResponse } from '@/types/accountingReports';

function LineItems({
  rows,
  currency,
}: {
  rows: GlReportRow[];
  currency?: CurrencyDetails | null;
}) {
  if (rows.length === 0) {
    return <div className="px-4 py-4 text-sm text-muted-foreground sm:px-5">—</div>;
  }
  return rows.map((row) => (
    <StatementLineRow
      key={`${row.code}-${row.name}`}
      code={row.code}
      name={row.name}
      amount={row.amount}
      currency={currency}
    />
  ));
}

export function IncomeStatementTable({ data }: { data: IncomeStatementResponse }) {
  const { t } = useLanguage();
  const netIncome = Number(data.net_income);
  const currency = data.currency_details || data.base_currency;
  const modeLabel = reportModeLabel(data, t, currency);
  const showCogs = Boolean(data.cogs_accounts?.length) || Number(data.cogs || 0) !== 0;

  return (
    <ReportStatementFrame
      title={t('accounts.incomeStatement')}
      modeLabel={modeLabel}
      currency={currency}
      balanceNote={data.balance_note}
      isBalanced={data.expects_balance === false ? null : data.totals?.is_balanced}
      showBalanceStatus={false}
    >
      <div className="mx-auto max-w-3xl">
        <StatementSectionHeading>{t('accounts.revenue')}</StatementSectionHeading>
        <LineItems rows={data.revenue_accounts} currency={currency} />
        <StatementTotalRow
          label={t('accounts.totalRevenue')}
          amount={data.revenue}
          currency={currency}
          emphasis
          tone="primary"
        />

        {showCogs && (
          <>
            <StatementSectionHeading>
              {t('accounts.cogs', 'Cost of Goods Sold')}
            </StatementSectionHeading>
            <LineItems rows={data.cogs_accounts || []} currency={currency} />
            <StatementTotalRow
              label={t('accounts.cogs', 'COGS')}
              amount={data.cogs}
              currency={currency}
            />
            <StatementTotalRow
              label={t('accounts.grossProfit', 'Gross Profit')}
              amount={data.gross_profit}
              currency={currency}
              emphasis
            />
          </>
        )}

        <StatementSectionHeading>{t('accounts.expenses')}</StatementSectionHeading>
        <LineItems rows={data.expense_accounts} currency={currency} />
        <StatementTotalRow
          label={t('accounts.totalExpenses')}
          amount={data.expenses}
          currency={currency}
          emphasis
        />

        <div className="flex items-center justify-between gap-4 border-t-2 bg-muted/40 px-4 py-4 font-semibold sm:px-5">
          <span>{t('accounts.netIncome')}</span>
          <StatementAmount
            value={data.net_income}
            currency={currency}
            emphasis
            className={netIncome >= 0 ? 'text-primary' : 'text-red-600'}
          />
        </div>
      </div>
    </ReportStatementFrame>
  );
}
