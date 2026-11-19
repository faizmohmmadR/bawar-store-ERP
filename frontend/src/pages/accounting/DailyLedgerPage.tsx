import { useEffect, useMemo, useState } from 'react';
import useFetchObjects from '@/api/useFetchObjects';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import {
  DAILY_LEDGER_ENDPOINT,
  DAILY_LEDGER_SOURCE,
  type DailyLedgerPeriodMode,
} from '@/lib/dailyLedger/constants';
import {
  formatDailyLedgerPeriodLabel,
  todayIsoDate,
} from '@/lib/dailyLedger/utils';
import type { DailyLedgerResponse } from '@/types/dailyLedger';
import { DailyLedgerPrintStyles } from '@/components/accounting/dailyLedger/DailyLedgerPrintStyles';
import { DailyLedgerToolbar } from '@/components/accounting/dailyLedger/DailyLedgerToolbar';
import { DailyLedgerSummaryCards } from '@/components/accounting/dailyLedger/DailyLedgerSummaryCards';
import { DailyLedgerCurrencyBreakdown } from '@/components/accounting/dailyLedger/DailyLedgerCurrencyBreakdown';
import { DailyLedgerSectionTable } from '@/components/accounting/dailyLedger/DailyLedgerSectionTable';
import { DailyLedgerEntriesTable } from '@/components/accounting/dailyLedger/DailyLedgerEntriesTable';

export default function DailyLedgerPage() {
  const { t, language } = useLanguage();
  const { calendar } = useCalendarPreference();

  const today = todayIsoDate();
  const [periodMode, setPeriodMode] = useState<DailyLedgerPeriodMode>('daily');
  const [selectedDate, setSelectedDate] = useState(today);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [section, setSection] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [searchValue, setSearchValue] = useState('');

  const effectiveStart = periodMode === 'daily' ? selectedDate : startDate;
  const effectiveEnd = periodMode === 'daily' ? selectedDate : endDate;

  useEffect(() => {
    setPage(1);
  }, [periodMode, selectedDate, startDate, endDate, section, searchValue]);

  useEffect(() => {
    if (periodMode === 'daily') {
      setStartDate(selectedDate);
      setEndDate(selectedDate);
    }
  }, [periodMode, selectedDate]);

  useEffect(() => {
    if (periodMode === 'range' && endDate < startDate) {
      setEndDate(startDate);
    }
  }, [periodMode, startDate, endDate]);

  const dateParams = useMemo(() => {
    if (periodMode === 'daily') {
      return { date: selectedDate };
    }
    return {
      start_date: startDate,
      end_date: endDate,
      period: 'custom',
    };
  }, [periodMode, selectedDate, startDate, endDate]);

  const { data, isLoading, isFetching } = useFetchObjects<DailyLedgerResponse>({
    queryKey: [
      'daily-ledger',
      DAILY_LEDGER_SOURCE,
      periodMode,
      effectiveStart,
      effectiveEnd,
      section,
      String(page),
      String(pageSize),
      searchValue,
    ],
    endpoint: DAILY_LEDGER_ENDPOINT,
    params: {
      ...dateParams,
      source: DAILY_LEDGER_SOURCE,
      page,
      page_size: pageSize,
      ...(section !== 'all' && { section }),
      ...(searchValue.trim() && { search: searchValue.trim() }),
    },
    options: { staleTime: 0 },
  });

  const { data: printData } = useFetchObjects<DailyLedgerResponse>({
    queryKey: [
      'daily-ledger-print',
      DAILY_LEDGER_SOURCE,
      periodMode,
      effectiveStart,
      effectiveEnd,
      section,
      searchValue,
    ],
    endpoint: DAILY_LEDGER_ENDPOINT,
    params: {
      ...dateParams,
      source: DAILY_LEDGER_SOURCE,
      all: 'true',
      ...(section !== 'all' && { section }),
      ...(searchValue.trim() && { search: searchValue.trim() }),
    },
    options: { staleTime: 30_000 },
  });

  const rows = data?.results || [];
  const printRows = printData?.results || rows;
  const meta = data?.meta;
  const baseCode = meta?.base_currency?.code || meta?.totals?.base_currency_code || 'AFN';
  const baseSymbol = meta?.base_currency?.symbol || baseCode;
  const totals = meta?.totals;

  const periodLabel = useMemo(
    () =>
      formatDailyLedgerPeriodLabel(effectiveStart, effectiveEnd, language, calendar),
    [effectiveStart, effectiveEnd, language, calendar],
  );

  return (
    <>
      <DailyLedgerPrintStyles />

      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8">
        <DailyLedgerToolbar
          periodMode={periodMode}
          onPeriodModeChange={setPeriodMode}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          startDate={startDate}
          onStartDateChange={setStartDate}
          endDate={endDate}
          onEndDateChange={setEndDate}
          section={section}
          onSectionChange={setSection}
          baseCode={baseCode}
          baseSymbol={baseSymbol}
        />

        <div id="daily-ledger-print" className="space-y-5">
          <div className="mb-6 hidden space-y-1 text-center print:block">
            <h1 className="text-2xl font-bold">
              {t('accounts.dailyLedger', 'Daily Transaction Book')}
            </h1>
            <p className="text-sm">{periodLabel}</p>
            <p className="text-xs text-muted-foreground">
              {t('accounts.reportingCurrency', 'Reporting currency')}: {baseCode}
            </p>
          </div>

          {totals && <DailyLedgerSummaryCards totals={totals} baseCode={baseCode} />}

          {meta?.by_currency && (
            <DailyLedgerCurrencyBreakdown rows={meta.by_currency} />
          )}

          {meta?.sections && (
            <DailyLedgerSectionTable sections={meta.sections} baseCode={baseCode} />
          )}

          <DailyLedgerEntriesTable
            rows={rows}
            printRows={printRows}
            baseCode={baseCode}
            periodLabel={periodLabel}
            isLoading={isLoading}
            isFetching={isFetching}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            page={page}
            pageSize={pageSize}
            total={data?.count || 0}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            isRange={periodMode === 'range'}
          />
        </div>
      </div>
    </>
  );
}
