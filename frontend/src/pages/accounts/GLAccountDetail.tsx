import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Edit,
  ExternalLink,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import DataTable, { TableColumn } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import type { CalendarSystem } from '@/contexts/CalendarPreferenceContext';
import type { Language } from '@/i18n';
import useFetchObjects from '@/api/useFetchObjects';
import { formatAppDate } from '@/lib/calendarDate';
import { FALLBACK_BASE_CODE, FALLBACK_BASE_SYMBOL, type CurrencyDetails } from '@/lib/currencies';
import { formatJournalDate, glCategoryLabel, journalSourceLabel } from '@/lib/journalLabels';

type GlAccountTotals = {
  total_debit: number;
  total_credit: number;
  balance: number;
  total_base_debit?: number;
  total_base_credit?: number;
  base_balance?: number;
  line_count?: number;
  currencies?: string[];
  is_mixed_currency?: boolean;
  amount_kind?: 'native' | 'afn_equivalent' | string;
};

type GlAccountDetail = {
  id: number;
  code: string;
  name: string;
  category: string;
  category_display?: string;
  currency?: number | null;
  currency_code?: string;
  currency_details?: CurrencyDetails | null;
  description?: string;
  is_system: boolean;
  is_active: boolean;
  totals?: GlAccountTotals;
  all_time_totals?: GlAccountTotals;
};

type GlJournalLine = {
  id: number;
  journal_entry_id?: number;
  entry_date: string;
  entry_type_name?: string;
  source_model?: string;
  source_object_id?: number;
  source_path?: string;
  reference_number?: string;
  journal_description?: string;
  gl_account_code?: string;
  gl_account_name?: string;
  gl_account_category?: string;
  currency?: number | null;
  currency_code?: string | null;
  currency_details?: CurrencyDetails | null;
  exchange_rate?: number | string | null;
  debit_amount: number;
  credit_amount: number;
  base_debit?: number;
  base_credit?: number;
  line_description?: string;
  notes?: string;
  is_auto?: boolean;
  running_balance?: number;
  running_balance_base?: number;
};

type LedgerHistoryResponse = {
  results?: GlJournalLine[];
  count?: number;
  totals?: GlAccountTotals;
  all_time_totals?: GlAccountTotals;
};

function formatPeriodLabel(
  startDate: string,
  endDate: string,
  t: (key: string, fallback?: string) => string,
  calendar: CalendarSystem,
  language: Language,
) {
  if (!startDate && !endDate) return t('reports.allTime', 'All time');
  const fmt = (value: string) => formatAppDate(value, calendar, { language });
  if (startDate && endDate) return `${fmt(startDate)} — ${fmt(endDate)}`;
  return startDate ? fmt(startDate) : fmt(endDate);
}

function formatMoney(
  value: number,
  language: string,
  currencyCode?: string | null,
  opts?: { showZeroAsDash?: boolean },
) {
  if (opts?.showZeroAsDash && !(Number(value) > 0)) return '—';
  const formatted = Number(value || 0).toLocaleString(language === 'fa' ? 'fa-AF' : 'en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return currencyCode ? `${formatted} ${currencyCode}` : formatted;
}

export default function GLAccountDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, language } = useLanguage();
  const { calendar } = useCalendarPreference();
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [searchValue, setSearchValue] = useState('');

  const startDate = searchParams.get('start_date') || '';
  const endDate = searchParams.get('end_date') || '';
  const sourceModel = searchParams.get('source_model') || '';
  const hasPeriodFilter = !!(startDate || endDate || sourceModel);

  const { data: account, isLoading: accountLoading } = useFetchObjects<GlAccountDetail>({
    queryKey: ['gl-account', id, startDate, endDate],
    endpoint: `gl-accounts/${id}/`,
    params: {
      ...(startDate && { start_date: startDate }),
      ...(endDate && { end_date: endDate }),
    },
    enabled: !!id,
  });

  const { data: ledgerData, isLoading: entriesLoading } = useFetchObjects<
    LedgerHistoryResponse | GlJournalLine[]
  >({
    queryKey: [
      'gl-account-ledger',
      id,
      currentPage,
      pageSize,
      startDate,
      endDate,
      sourceModel,
      searchValue,
    ],
    endpoint: `gl-accounts/${id}/ledger_history/`,
    params: {
      page: currentPage,
      page_size: pageSize,
      ...(startDate && { start_date: startDate }),
      ...(endDate && { end_date: endDate }),
      ...(sourceModel && { source_model: sourceModel }),
      ...(searchValue.trim() && { search: searchValue.trim() }),
    },
    enabled: !!id,
  });

  const entries: GlJournalLine[] = Array.isArray(ledgerData)
    ? ledgerData
    : ledgerData?.results || [];
  const totalEntries = Array.isArray(ledgerData)
    ? ledgerData.length
    : ledgerData?.count || entries.length;
  const totals = Array.isArray(ledgerData) ? undefined : ledgerData?.totals ?? account?.totals;
  const allTimeTotals = Array.isArray(ledgerData)
    ? undefined
    : ledgerData?.all_time_totals ?? account?.all_time_totals;

  const accountCurrencyCode =
    account?.currency_code || account?.currency_details?.code || FALLBACK_BASE_CODE;
  const isMixed =
    totals?.is_mixed_currency ||
    allTimeTotals?.is_mixed_currency ||
    (totals?.currencies?.length || 0) > 1;
  const useAfnSummary =
    isMixed || totals?.amount_kind === 'afn_equivalent' || !account?.currency;

  const summaryCurrencyCode = useAfnSummary ? FALLBACK_BASE_CODE : accountCurrencyCode;
  const summaryDebit = useAfnSummary
    ? Number(totals?.total_base_debit ?? totals?.total_debit ?? 0)
    : Number(totals?.total_debit ?? 0);
  const summaryCredit = useAfnSummary
    ? Number(totals?.total_base_credit ?? totals?.total_credit ?? 0)
    : Number(totals?.total_credit ?? 0);
  const summaryBalance = useAfnSummary
    ? Number(totals?.base_balance ?? totals?.balance ?? 0)
    : Number(totals?.balance ?? 0);

  const allTimeDebit = useAfnSummary
    ? Number(allTimeTotals?.total_base_debit ?? allTimeTotals?.total_debit ?? 0)
    : Number(allTimeTotals?.total_debit ?? 0);
  const allTimeCredit = useAfnSummary
    ? Number(allTimeTotals?.total_base_credit ?? allTimeTotals?.total_credit ?? 0)
    : Number(allTimeTotals?.total_credit ?? 0);
  const allTimeBalance = useAfnSummary
    ? Number(allTimeTotals?.base_balance ?? allTimeTotals?.balance ?? 0)
    : Number(allTimeTotals?.balance ?? 0);

  const periodLabel = useMemo(
    () => formatPeriodLabel(startDate, endDate, t, calendar, language),
    [calendar, endDate, language, startDate, t],
  );

  const clearFilters = () => {
    setSearchParams({});
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, sourceModel, searchValue]);

  const columns: TableColumn[] = [
    {
      key: 'entry_date',
      title: t('accounts.date'),
      render: (value) => (
        <span className="text-xs whitespace-nowrap">
          {formatJournalDate(value, language, {
            calendar,
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'reference_number',
      title: t('accounts.reference'),
      render: (value, row: GlJournalLine) => (
        <div className="space-y-1">
          <span className="text-xs font-mono font-medium">
            {value || `JE-${row.journal_entry_id}`}
          </span>
          <div className="flex flex-col items-start gap-0.5">
            {row.journal_entry_id && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/journal-entries/${row.journal_entry_id}`);
                }}
              >
                <ExternalLink className="h-3 w-3 me-1" />
                {t('accounts.viewJournalEntry')}
              </Button>
            )}
            {row.source_path && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(row.source_path!);
                }}
              >
                <ExternalLink className="h-3 w-3 me-1" />
                {journalSourceLabel(row.source_model, t)}
              </Button>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'entry_type_name',
      title: t('accounts.source'),
      render: (_, row: GlJournalLine) => (
        <div className="flex flex-col gap-1">
          <Badge variant="outline" className="w-fit text-xs">
            {row.entry_type_name || journalSourceLabel(row.source_model, t)}
          </Badge>
          {row.is_auto !== undefined && (
            <Badge variant="secondary" className="w-fit text-xs">
              {row.is_auto ? t('accounts.autoEntry') : t('accounts.manualEntry')}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'currency_code',
      title: t('accounts.currency'),
      render: (value, row: GlJournalLine) => (
        <Badge variant="secondary" className="text-xs">
          {value || row.currency_details?.code || FALLBACK_BASE_CODE}
        </Badge>
      ),
    },
    {
      key: 'debit_amount',
      title: t('accounts.debit'),
      render: (value, row: GlJournalLine) => (
        <span className="text-xs font-semibold text-primary tabular-nums whitespace-nowrap">
          {formatMoney(Number(value || 0), language, row.currency_code || row.currency_details?.code, {
            showZeroAsDash: true,
          })}
        </span>
      ),
    },
    {
      key: 'credit_amount',
      title: t('accounts.credit'),
      render: (value, row: GlJournalLine) => (
        <span className="text-xs font-semibold text-red-600 tabular-nums whitespace-nowrap">
          {formatMoney(Number(value || 0), language, row.currency_code || row.currency_details?.code, {
            showZeroAsDash: true,
          })}
        </span>
      ),
    },
    {
      key: 'exchange_rate',
      title: t('accounts.exchangeRate', 'Rate'),
      render: (value) => {
        const rate = Number(value || 0);
        if (!(rate > 0)) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <span className="text-xs tabular-nums text-muted-foreground">
            {rate.toLocaleString(language === 'fa' ? 'fa-AF' : 'en-US', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 6,
            })}
          </span>
        );
      },
    },
    {
      key: 'base_debit',
      title: t('accounts.afnDebit', 'AFN Debit'),
      render: (value) => (
        <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
          {formatMoney(Number(value || 0), language, FALLBACK_BASE_CODE, { showZeroAsDash: true })}
        </span>
      ),
    },
    {
      key: 'base_credit',
      title: t('accounts.afnCredit', 'AFN Credit'),
      render: (value) => (
        <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
          {formatMoney(Number(value || 0), language, FALLBACK_BASE_CODE, { showZeroAsDash: true })}
        </span>
      ),
    },
    {
      key: 'running_balance',
      title: t('accounts.balance'),
      render: (_, row: GlJournalLine) => {
        if (isMixed || useAfnSummary) {
          return (
            <span className="text-xs font-semibold tabular-nums whitespace-nowrap">
              {formatMoney(Number(row.running_balance_base ?? 0), language, FALLBACK_BASE_CODE)}
            </span>
          );
        }
        return (
          <span className="text-xs font-semibold tabular-nums whitespace-nowrap">
            {formatMoney(Number(row.running_balance ?? 0), language, accountCurrencyCode)}
          </span>
        );
      },
    },
    {
      key: 'line_description',
      title: t('accounts.lineDescription'),
      render: (_, row: GlJournalLine) => (
        <div
          className="max-w-[220px] text-xs truncate"
          title={row.line_description || row.journal_description || ''}
        >
          {row.line_description || row.journal_description || '—'}
        </div>
      ),
    },
  ];

  if (accountLoading && !account) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('accounts.noGlAccounts', 'GL account not found')}
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1800px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <Card>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <Button variant="outline" size="icon" onClick={() => navigate('/gl-accounts')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <BookOpen className="h-6 w-6 text-primary shrink-0" />
                  <h1 className="text-xl sm:text-2xl font-heading font-bold truncate">
                    {account.code} — {account.name}
                  </h1>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline">
                    {account.category_display || glCategoryLabel(account.category, t)}
                  </Badge>
                  <Badge variant="outline">{accountCurrencyCode}</Badge>
                  {isMixed && (
                    <Badge variant="secondary">
                      {t('accounts.mixedCurrencies', 'Mixed currencies')}
                    </Badge>
                  )}
                  <Badge variant={account.is_active ? 'default' : 'destructive'}>
                    {account.is_active ? t('common.active') : t('common.inactive')}
                  </Badge>
                  {account.is_system && (
                    <Badge variant="secondary">{t('accounts.systemAccount', 'System')}</Badge>
                  )}
                </div>
                {account.description && (
                  <p className="text-sm text-muted-foreground mt-2">{account.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {useAfnSummary
                    ? t(
                        'accounts.glMixedCurrencySummaryHint',
                        'This account posts in multiple currencies. Summary cards and running balance use AFN reporting equivalents.',
                      )
                    : t(
                        'accounts.glNativeCurrencySummaryHint',
                        'Summary amounts are in this account’s book currency. AFN columns on each line are reporting equivalents only.',
                      )}
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate(`/gl-accounts/${id}/edit`)}>
              <Edit className="h-4 w-4 me-2" />
              {t('common.edit')}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground border-t pt-4">
            <Calendar className="h-4 w-4" />
            <span>
              {t('reports.period')}: {periodLabel}
            </span>
            {sourceModel && <Badge variant="outline">{journalSourceLabel(sourceModel, t)}</Badge>}
            {hasPeriodFilter && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearFilters}>
                <X className="h-3 w-3 me-1" />
                {t('common.clearFilters', 'Clear filters')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">
                  {t('accounts.totalDebit')}
                  <span className="ms-1 text-xs">({summaryCurrencyCode})</span>
                </p>
                <p className="text-2xl font-bold text-primary">
                  {formatMoney(summaryDebit, language, summaryCurrencyCode)}
                </p>
                {allTimeTotals && hasPeriodFilter && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('reports.allTime', 'All time')}:{' '}
                    {formatMoney(allTimeDebit, language, summaryCurrencyCode)}
                  </p>
                )}
              </div>
              <TrendingUp className="h-8 w-8 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">
                  {t('accounts.totalCredit')}
                  <span className="ms-1 text-xs">({summaryCurrencyCode})</span>
                </p>
                <p className="text-2xl font-bold text-red-600">
                  {formatMoney(summaryCredit, language, summaryCurrencyCode)}
                </p>
                {allTimeTotals && hasPeriodFilter && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('reports.allTime', 'All time')}:{' '}
                    {formatMoney(allTimeCredit, language, summaryCurrencyCode)}
                  </p>
                )}
              </div>
              <TrendingDown className="h-8 w-8 text-red-600 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">
                  {t('accounts.balance')}
                  <span className="ms-1 text-xs">({summaryCurrencyCode})</span>
                </p>
                <p className="text-2xl font-bold">
                  {formatMoney(summaryBalance, language, summaryCurrencyCode)}
                </p>
                {allTimeTotals && hasPeriodFilter && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('reports.allTime', 'All time')}:{' '}
                    {formatMoney(allTimeBalance, language, summaryCurrencyCode)}
                  </p>
                )}
                {!useAfnSummary && totals?.total_base_debit != null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {FALLBACK_BASE_SYMBOL} {t('accounts.afnEquivalentReporting')}:{' '}
                    {formatMoney(Number(totals.base_balance ?? 0), language, FALLBACK_BASE_CODE)}
                  </p>
                )}
              </div>
              <Wallet className="h-8 w-8 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            {t('accounts.journalLines')}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t(
              'accounts.journalLinesNativeHint',
              'Native amounts are in the line currency. AFN columns are reporting equivalents, not Cash AFN.',
            )}
          </p>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <DataTable
            data={entries}
            columns={columns}
            loading={entriesLoading}
            searchable
            searchValue={searchValue}
            onSearch={setSearchValue}
            pagination={{
              current: currentPage,
              pageSize,
              total: totalEntries,
              onPageChange: setCurrentPage,
              showSizeChanger: true,
              pageSizeOptions: [10, 25, 50, 100],
              onPageSizeChange: (size) => {
                setPageSize(size);
                setCurrentPage(1);
              },
            }}
            emptyIcon={<Receipt className="h-8 w-8 text-muted-foreground" />}
            emptyTitle={
              hasPeriodFilter
                ? t('accounts.noJournalEntriesForPeriod', 'No entries in this period')
                : t('accounts.noJournalEntriesForSource')
            }
            emptyDescription={
              hasPeriodFilter
                ? t(
                    'accounts.noJournalEntriesPeriodDesc',
                    'Try clearing the period filter or choose a wider date range.',
                  )
                : t('accounts.noJournalEntriesDesc')
            }
            loadingText={t('accounts.loadingEntries')}
            maxHeight="600px"
            stickyHeader
          />
        </CardContent>
      </Card>
    </div>
  );
}
