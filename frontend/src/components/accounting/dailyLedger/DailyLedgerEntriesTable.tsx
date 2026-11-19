import { useMemo } from 'react';
import { Loader2, Receipt } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import DataTable, { TableColumn } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { formatNumber } from '@/lib/formatNumber';
import { formatJournalDate } from '@/lib/journalLabels';
import type { DailyLedgerRow } from '@/types/dailyLedger';

interface DailyLedgerEntriesTableProps {
  rows: DailyLedgerRow[];
  printRows: DailyLedgerRow[];
  baseCode: string;
  periodLabel: string;
  isLoading: boolean;
  isFetching: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  isRange?: boolean;
}

export function DailyLedgerEntriesTable({
  rows,
  printRows,
  baseCode,
  periodLabel,
  isLoading,
  isFetching,
  searchValue,
  onSearchChange,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  isRange = false,
}: DailyLedgerEntriesTableProps) {
  const { t, language } = useLanguage();
  const { calendar } = useCalendarPreference();

  const fmt = (value: number, curr?: string) => {
    if (!value) return '—';
    return `${formatNumber(value)}${curr ? ` ${curr}` : ''}`;
  };

  const columns: TableColumn[] = useMemo(
    () => [
      {
        key: 'entry_date',
        title: t('reports.date'),
        render: (value) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {formatJournalDate(value, language, {
              calendar,
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        ),
      },
      {
        key: 'section_label',
        title: t('accounts.type', 'Type'),
        render: (_value, row: DailyLedgerRow) => (
          <Badge variant="outline" className="text-[10px] font-medium">
            {row.section_label || row.record_type_label || row.section || '—'}
          </Badge>
        ),
      },
      {
        key: 'reference_number',
        title: t('reports.reference'),
        render: (value, row: DailyLedgerRow) => (
          <span className="font-mono text-xs font-medium">{value || row.id}</span>
        ),
      },
      {
        key: 'contact_name',
        title: t('accounts.party', 'Party'),
        render: (value, row: DailyLedgerRow) => (
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{value || '—'}</p>
            {row.account_code && (
              <p className="font-mono text-[10px] text-muted-foreground">
                {row.account_code} {row.account_name || ''}
              </p>
            )}
          </div>
        ),
      },
      {
        key: 'description',
        title: t('reports.description'),
        render: (value) => (
          <div className="max-w-[200px] truncate text-xs text-muted-foreground" title={value || ''}>
            {value || '—'}
          </div>
        ),
      },
      {
        key: 'currency',
        title: t('accounts.currency', 'Currency'),
        render: (value) => (
          <span className="font-mono text-xs font-medium">{value || '—'}</span>
        ),
      },
      {
        key: 'amount',
        title: t('accounts.nativeAmount', 'Native'),
        render: (_value, row: DailyLedgerRow) => {
          const num = Number((row.native_amount ?? row.amount) || 0);
          return (
            <span className="text-xs font-semibold tabular-nums">
              {fmt(Math.abs(num), row.currency)}
            </span>
          );
        },
      },
      {
        key: 'amount_base',
        title: t('accounts.afnReportingShort', 'AFN Reporting'),
        render: (_value, row: DailyLedgerRow) => {
          const num = Number((row.afn_equivalent ?? row.amount_base) || 0);
          return (
            <span className="text-xs font-semibold tabular-nums">
              {fmt(Math.abs(num), baseCode)}
            </span>
          );
        },
      },
      {
        key: 'direction',
        title: t('accounts.direction', 'Flow'),
        render: (_value, row: DailyLedgerRow) => {
          const dir = row.is_cash_in
            ? 'in'
            : row.is_cash_out
              ? 'out'
              : row.direction || 'neutral';
          const label =
            dir === 'in'
              ? t('accounts.cashIn', 'In')
              : dir === 'out'
                ? t('accounts.cashOut', 'Out')
                : t('accounts.neutral', '—');
          return (
            <Badge
              variant="outline"
              className={
                dir === 'in'
                  ? 'border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-400'
                  : dir === 'out'
                    ? 'border-red-200 text-red-700 dark:border-red-900 dark:text-red-400'
                    : 'text-muted-foreground'
              }
            >
              {label}
            </Badge>
          );
        },
      },
    ],
    [baseCode, calendar, language, t],
  );

  return (
    <Card className="overflow-hidden shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b py-4">
        <div className="min-w-0 space-y-0.5">
          <CardTitle className="text-base font-semibold">
            {t('accounts.dailyLedgerEntries', 'Transactions')}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{periodLabel}</p>
        </div>
        {isFetching && !isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground no-print" />
        )}
      </CardHeader>
      <CardContent className="p-0 no-print">
        <DataTable
          data={rows}
          columns={columns}
          loading={isLoading}
          searchable
          searchValue={searchValue}
          onSearch={onSearchChange}
          pagination={{
            current: page,
            pageSize,
            total,
            onPageChange,
            showSizeChanger: true,
            pageSizeOptions: [25, 50, 100, 200],
            onPageSizeChange: (size) => {
              onPageSizeChange(size);
              onPageChange(1);
            },
          }}
          emptyIcon={<Receipt className="h-8 w-8 text-muted-foreground" />}
          emptyTitle={
            isRange
              ? t('accounts.noRangeTransactions', 'No transactions in this range')
              : t('accounts.noDailyTransactions', 'No transactions on this day')
          }
          emptyDescription={t(
            'accounts.noDailyTransactionsDesc',
            'Try another date or remove filters.',
          )}
          loadingText={t('reports.loadingFinancialReports')}
          maxHeight="640px"
          stickyHeader
        />
      </CardContent>

      <CardContent className="hidden print:block p-4">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b">
              {columns.map((col) => (
                <th key={col.key} className="px-1 py-2 text-start font-semibold">
                  {col.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {printRows.map((row) => (
              <tr key={row.id} className="border-b">
                {columns.map((col) => (
                  <td key={col.key} className="px-1 py-1.5 align-top">
                    {col.render?.(row[col.key as keyof DailyLedgerRow], row, 0) ??
                      row[col.key as keyof DailyLedgerRow]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
