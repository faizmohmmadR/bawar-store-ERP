import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  ExternalLink,
  Receipt,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import DataTable, { TableColumn } from '@/components/ui/data-table';
import useFetchObjects from '@/api/useFetchObjects';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import type { CalendarSystem } from '@/contexts/CalendarPreferenceContext';
import type { Language } from '@/i18n';
import { formatAppDate } from '@/lib/calendarDate';
import { formatNumber } from '@/lib/formatNumber';
import { formatJournalDate } from '@/lib/journalLabels';

type ReportHistoryRow = {
  id: string;
  section: string;
  record_type: string;
  record_type_label: string;
  entry_date: string;
  reference_number?: string;
  description?: string;
  amount: number;
  amount_base: number;
  currency: string;
  contact_name?: string;
  status?: string;
  direction?: 'in' | 'out' | 'neutral';
  source_path?: string;
  paid_amount?: number | null;
  remaining_amount?: number | null;
};

type ReportHistoryResponse = {
  results?: ReportHistoryRow[];
  count?: number;
  meta?: {
    title?: string;
    sections?: string[];
    metric?: string;
    breakdown?: string;
    currency?: string;
    period?: { start_date?: string; end_date?: string };
    totals?: {
      amount: number;
      amount_base: number;
      record_count: number;
      cash_in?: number;
      cash_out?: number;
    };
  };
};

function formatPeriodLabel(
  start: string | undefined,
  end: string | undefined,
  calendar: CalendarSystem,
  language: Language,
) {
  const fmt = (value?: string) => {
    if (!value) return '';
    return formatAppDate(value, calendar, { language });
  };
  if (start && end) return `${fmt(start)} — ${fmt(end)}`;
  return fmt(start) || fmt(end) || '';
}

export default function ReportHistoryPage() {
  const [searchParams] = useSearchParams();
  const { t, language } = useLanguage();
  const { calendar } = useCalendarPreference();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [searchValue, setSearchValue] = useState('');

  const metric = searchParams.get('metric') || '';
  const breakdown = searchParams.get('breakdown') || '';
  const section = searchParams.get('section') || '';
  const startDate = searchParams.get('start_date') || '';
  const endDate = searchParams.get('end_date') || '';
  const currency = searchParams.get('currency') || '';

  const { data, isLoading } = useFetchObjects<ReportHistoryResponse>({
    queryKey: ['report-history', metric, breakdown, section, startDate, endDate, currency, page, pageSize, searchValue],
    endpoint: 'reports/history',
    params: {
      page,
      page_size: pageSize,
      ...(metric && { metric }),
      ...(breakdown && { breakdown }),
      ...(section && { section }),
      ...(startDate && { start_date: startDate }),
      ...(endDate && { end_date: endDate }),
      ...(currency && { currency }),
      ...(searchValue.trim() && { search: searchValue.trim() }),
    },
    enabled: !!(metric || breakdown || section),
    options: { staleTime: 0 },
  });

  useEffect(() => {
    setPage(1);
  }, [metric, breakdown, section, startDate, endDate, currency, searchValue]);

  const rows = data?.results || [];
  const total = data?.count || 0;
  const meta = data?.meta;
  const totals = meta?.totals;

  const title = useMemo(() => {
    if (meta?.title) return meta.title;
    if (metric) return metric.replace(/_/g, ' ');
    if (breakdown) return breakdown;
    return t('reports.reportHistory', 'Report Drilldown');
  }, [breakdown, meta?.title, metric, t]);

  const periodLabel = formatPeriodLabel(
    meta?.period?.start_date || startDate,
    meta?.period?.end_date || endDate,
    calendar,
    language,
  );

  const fmt = (value: number, curr?: string) =>
    `${formatNumber(value)}${curr ? ` ${curr}` : ''}`;

  const statusLabel = (status?: string) => {
    if (!status) return '—';
    const key = `reports.${status}`;
    const translated = t(key);
    return translated !== key ? translated : status;
  };

  const columns: TableColumn[] = [
    {
      key: 'entry_date',
      title: t('reports.date'),
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
      key: 'record_type_label',
      title: t('reports.type', 'Type'),
      render: (value, row: ReportHistoryRow) => (
        <Badge variant="outline" className="text-xs">
          {value || row.record_type}
        </Badge>
      ),
    },
    {
      key: 'reference_number',
      title: t('reports.reference'),
      render: (value, row: ReportHistoryRow) => (
        <div className="space-y-1">
          <span className="text-xs font-mono font-medium">{value || row.id}</span>
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
              {t('reports.viewRecord', 'View record')}
            </Button>
          )}
        </div>
      ),
    },
    {
      key: 'contact_name',
      title: t('reports.holder', 'Contact'),
      render: (value, row: ReportHistoryRow) => (
        <span className="text-xs">{value || row.contact_name || '—'}</span>
      ),
    },
    {
      key: 'amount',
      title: t('reports.amount'),
      render: (value, row: ReportHistoryRow) => {
        const num = Number(value || 0);
        const color =
          row.direction === 'in'
            ? 'text-primary'
            : row.direction === 'out'
              ? 'text-red-600'
              : num < 0
                ? 'text-red-600'
                : 'text-foreground';
        return (
          <span className={`text-xs font-semibold ${color}`}>
            {fmt(Math.abs(num), row.currency)}
          </span>
        );
      },
    },
    {
      key: 'remaining_amount',
      title: t('reports.balance'),
      render: (_, row: ReportHistoryRow) => (
        <span className="text-xs">
          {row.remaining_amount != null && row.remaining_amount > 0
            ? fmt(row.remaining_amount, row.currency)
            : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      title: t('reports.status'),
      render: (value) => (
        <Badge variant="secondary" className="text-xs capitalize">
          {statusLabel(value)}
        </Badge>
      ),
    },
    {
      key: 'description',
      title: t('reports.description'),
      render: (value) => (
        <div className="max-w-[220px] text-xs truncate" title={value || ''}>
          {value || '—'}
        </div>
      ),
    },
  ];

  if (!metric && !breakdown && !section) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('reports.noHistoryContext', 'Select a report metric or breakdown to view history.')}
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1800px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <Card>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <Button variant="outline" size="icon" asChild>
                <Link to="/reports">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <BarChart3 className="h-6 w-6 text-primary shrink-0" />
                  <h1 className="text-xl sm:text-2xl font-heading font-bold truncate">
                    {title}
                  </h1>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('reports.reportHistorySubtitle', 'Source documents behind the selected report figure')}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {periodLabel && (
                    <Badge variant="outline">{t('reports.period')}: {periodLabel}</Badge>
                  )}
                  {currency && <Badge variant="outline">{currency}</Badge>}
                  {totals?.record_count != null && (
                    <Badge variant="secondary">
                      {totals.record_count} {t('reports.transactions')}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {totals && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">{t('reports.total')}</p>
                  <p className="text-2xl font-bold">{fmt(totals.amount_base, currency || undefined)}</p>
                </div>
                <Receipt className="h-8 w-8 text-primary opacity-80" />
              </div>
            </CardContent>
          </Card>
          {totals.cash_in != null && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('reports.totalCashIn')}</p>
                    <p className="text-2xl font-bold text-primary">{fmt(totals.cash_in, currency || undefined)}</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-primary opacity-80" />
                </div>
              </CardContent>
            </Card>
          )}
          {totals.cash_out != null && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('reports.totalCashOut')}</p>
                    <p className="text-2xl font-bold text-red-600">{fmt(totals.cash_out, currency || undefined)}</p>
                  </div>
                  <TrendingDown className="h-8 w-8 text-red-600 opacity-80" />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('reports.reportHistory', 'Report Drilldown')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <DataTable
            data={rows}
            columns={columns}
            loading={isLoading}
            searchable
            searchValue={searchValue}
            onSearch={setSearchValue}
            pagination={{
              current: page,
              pageSize,
              total,
              onPageChange: setPage,
              showSizeChanger: true,
              pageSizeOptions: [10, 25, 50, 100],
              onPageSizeChange: (size) => {
                setPageSize(size);
                setPage(1);
              },
            }}
            emptyIcon={<Receipt className="h-8 w-8 text-muted-foreground" />}
            emptyTitle={t('reports.noFinancialData')}
            emptyDescription={t('reports.noHistoryForPeriod', 'No records found for this report section and period.')}
            loadingText={t('reports.loadingFinancialReports')}
            maxHeight="600px"
            stickyHeader
          />
        </CardContent>
      </Card>
    </div>
  );
}
