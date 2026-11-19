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
import type { BalanceSheetResponse, GlReportRow } from '@/types/accountingReports';

function SectionBlock({
  title,
  rows,
  totalLabel,
  total,
  currency,
}: {
  title: string;
  rows: GlReportRow[];
  totalLabel: string;
  total: number | string;
  currency?: CurrencyDetails | null;
}) {
  return (
    <div className="min-h-full">
      <StatementSectionHeading>{title}</StatementSectionHeading>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-muted-foreground sm:px-5">—</div>
      ) : (
        rows.map((row) => (
          <StatementLineRow
            key={`${row.code}-${row.name}`}
            code={row.code}
            name={row.name}
            amount={row.amount ?? row.balance}
            currency={currency}
          />
        ))
      )}
      <StatementTotalRow label={totalLabel} amount={total} currency={currency} emphasis />
    </div>
  );
}

export function BalanceSheetTable({ data }: { data: BalanceSheetResponse }) {
  const { t } = useLanguage();
  const currency = data.currency_details || data.base_currency;
  const modeLabel = reportModeLabel(data, t, currency);
  const equitySubtotal = Number(data.total_equity) - Number(data.net_income);
  const netIncome = Number(data.net_income);

  return (
    <ReportStatementFrame
      title={t('accounts.balanceSheet')}
      modeLabel={modeLabel}
      currency={currency}
      showBalanceStatus
      isBalanced={data.is_balanced}
      expectsBalance={data.expects_balance}
      balanceNote={data.balance_note}
      difference={data.difference}
    >
      <div className="grid lg:grid-cols-2">
        <div className="border-b lg:border-b-0 lg:border-e">
          <SectionBlock
            title={t('accounts.assets')}
            rows={data.assets}
            totalLabel={t('accounts.totalAssets')}
            total={data.total_assets}
            currency={currency}
          />
        </div>

        <div>
          <SectionBlock
            title={t('accounts.liabilities')}
            rows={data.liabilities}
            totalLabel={t('accounts.totalLiabilities')}
            total={data.total_liabilities}
            currency={currency}
          />

          <StatementSectionHeading>{t('accounts.equity')}</StatementSectionHeading>
          {data.equity_accounts.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground sm:px-5">—</div>
          ) : (
            data.equity_accounts.map((row) => (
              <StatementLineRow
                key={`${row.code}-${row.name}`}
                code={row.code}
                name={row.name}
                amount={row.amount ?? row.balance}
                currency={currency}
              />
            ))
          )}
          <StatementTotalRow
            label={t('accounts.equitySubtotal')}
            amount={equitySubtotal}
            currency={currency}
          />
          <div className="flex items-center justify-between gap-4 border-b border-border/50 px-4 py-2.5 sm:px-5">
            <span className="text-sm">{t('accounts.netIncome')}</span>
            <StatementAmount
              value={data.net_income}
              currency={currency}
              className={netIncome >= 0 ? 'text-primary' : 'text-red-600'}
            />
          </div>
          <StatementTotalRow
            label={t('accounts.totalEquity')}
            amount={data.total_equity}
            currency={currency}
            emphasis
          />
          <div className="flex items-center justify-between gap-4 border-t-2 bg-muted/40 px-4 py-4 font-semibold sm:px-5">
            <span className="text-sm">{t('accounts.totalLiabilitiesAndEquity')}</span>
            <StatementAmount
              value={data.total_liabilities_and_equity}
              currency={currency}
              emphasis
            />
          </div>
        </div>
      </div>
    </ReportStatementFrame>
  );
}
