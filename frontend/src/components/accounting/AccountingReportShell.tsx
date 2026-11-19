import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { useMemo, useState, type ReactNode } from 'react';
import { CalendarDays, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { CurrencySelect, STATIC_CURRENCIES } from '@/components/forms/CurrencySelect';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import { buildGlReportParams, getReportPeriodOptions } from '@/lib/reportPeriod';
import { cn } from '@/lib/utils';

type AccountingReportShellProps<T> = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  headerAction?: ReactNode;
  endpoint: string;
  queryKey: string;
  defaultPeriod?: string;
  children: (data: T) => ReactNode;
};

export function AccountingReportShell<T>({
  title,
  subtitle,
  icon,
  headerAction,
  endpoint,
  queryKey,
  defaultPeriod = 'monthly',
  children,
}: AccountingReportShellProps<T>) {
  const { calendar } = useCalendarPreference();
  const { t } = useLanguage();
  const [period, setPeriod] = useState(defaultPeriod);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currencyId, setCurrencyId] = useState('1');
  const [mode, setMode] = useState<'native' | 'base'>('base');

  const periodOptions = useMemo(() => getReportPeriodOptions(t), [t]);
  const currency = useMemo(
    () => STATIC_CURRENCIES.find((c) => String(c.id) === currencyId),
    [currencyId],
  );

  const params = useMemo(
    () => buildGlReportParams(period, startDate, endDate, undefined, currencyId, mode, calendar),
    [calendar, period, startDate, endDate, currencyId, mode],
  );

  const { data, isLoading, isFetching, isError, refetch } = useFetchObjects<T>({
    queryKey: [queryKey, calendar, period, startDate, endDate, currencyId, mode],
    endpoint,
    params,
    options: { staleTime: 30_000 },
  });

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 p-4 sm:p-6">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2.5">
            {icon}
            <h1 className="truncate text-2xl font-heading font-bold tracking-tight">{title}</h1>
          </div>
          {subtitle && (
            <p className="max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {headerAction}
      </div>

      {/* Single filter toolbar */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="grid gap-0 lg:grid-cols-[1fr_auto]">
            {/* Period */}
            <div className="space-y-3 border-b p-4 sm:p-5 lg:border-b-0 lg:border-e">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                {t('reports.period')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {periodOptions.map((opt) => {
                  const active = period === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPeriod(opt.value)}
                      className={cn(
                        'h-8 rounded-md border px-3 text-xs font-medium transition-colors',
                        active
                          ? 'border-foreground/20 bg-foreground text-background'
                          : 'border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {period === 'custom' && (
                <div className="flex flex-wrap gap-3 pt-1">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t('reports.startDate')}
                    </Label>
                    <DatePickerInput
                      value={startDate}
                      onChange={setStartDate}
                      className="h-8 w-[10.5rem] text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t('reports.endDate')}
                    </Label>
                    <DatePickerInput
                      value={endDate}
                      onChange={setEndDate}
                      className="h-8 w-[10.5rem] text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* View + currency + refresh */}
            <div className="flex flex-col justify-between gap-4 p-4 sm:min-w-[280px] sm:p-5">
              <div className="space-y-3">
                <p className="text-sm font-medium">{t('accounts.reportView', 'Report view')}</p>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/70 p-1">
                  <button
                    type="button"
                    onClick={() => setMode('base')}
                    className={cn(
                      'h-9 rounded-md text-xs font-medium transition-colors',
                      mode === 'base'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t('accounts.afnReportingShort', 'AFN Reporting')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('native')}
                    className={cn(
                      'h-9 rounded-md text-xs font-medium transition-colors',
                      mode === 'native'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t('accounts.nativeBooksShort', 'Native Books')}
                  </button>
                </div>

                {mode === 'native' ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {t('accounts.lineCurrency', 'Line currency')}
                    </Label>
                    <CurrencySelect
                      value={currencyId}
                      onChange={setCurrencyId}
                      compact
                      autoSelectBase
                    />
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t(
                      'accounts.afnReportHintShort',
                      'All currencies converted to AFN at historical rates.',
                    )}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {mode === 'base'
                    ? t('accounts.reportingCurrency', 'Reporting currency') + ': AFN'
                    : `${t('accounts.books', 'Books')}: ${currency?.code || '—'}`}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => refetch()}
                  disabled={isFetching}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
                  <span className="ms-1.5">{t('common.refresh', 'Refresh')}</span>
                </Button>
              </div>
            </div>
          </div>

          {mode === 'native' && (
            <>
              <Separator />
              <p className="px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
                {t(
                  'accounts.nativeReportHintShort',
                  'Native books include only lines in the selected currency. Use AFN Reporting for a balanced company statement.',
                )}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {isLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('accounts.loadingReport')}</p>
          </CardContent>
        </Card>
      )}

      {isError && !isLoading && (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            {t('accounts.reportLoadError')}
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data && children(data)}
    </div>
  );
}
