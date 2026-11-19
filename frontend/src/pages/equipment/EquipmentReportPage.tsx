import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Banknote,
  Landmark,
  Loader2,
  Monitor,
  Scale,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ReportFilters } from '@/components/reports/ReportFilters';
import useFetchObjects from '@/api/useFetchObjects';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { buildFinancialReportParams } from '@/lib/reportPeriod';
import {
  ReportCurrencyLabel,
  ReportMoney,
  ReportNumber,
  ReportTh,
} from '@/components/reports/ReportAmount';
import { formatNumber, formatReportMoney } from '@/lib/formatNumber';
import { cn } from '@/lib/utils';

type StatusRow = {
  status: string;
  currency_code: string;
  count: number;
  cost_native: number;
  nbv_native: number;
  cost_afn: number;
  nbv_afn: number;
};
type CategoryRow = {
  category: string;
  currency_code: string;
  count: number;
  cost_native: number;
  nbv_native: number;
  cost_afn: number;
  nbv_afn: number;
};
type AcquisitionRow = {
  acquisition_type: string;
  currency_code: string;
  count: number;
  cost_native: number;
  cost_afn: number;
};
type CurrencyRow = {
  currency_id: number;
  code: string;
  symbol: string;
  name: string;
  active_count: number;
  disposed_count: number;
  gross_native: number;
  accum_dep_native: number;
  nbv_native: number;
  gross_afn: number;
  accum_dep_afn: number;
  nbv_afn: number;
  period_count: number;
  period_asset_native: number;
  period_expense_native: number;
  period_cash_out_native: number;
  period_asset_afn: number;
  period_expense_afn: number;
  period_cash_out_afn: number;
  period_dep_native: number;
  period_dep_afn: number;
  period_dep_count: number;
};
type AcquisitionItem = {
  id: number;
  name: string;
  category: string;
  status: string;
  acquisition_type: string;
  serial_number: string;
  quantity: number;
  cost_native: number;
  nbv_native: number;
  cost_afn: number;
  nbv_afn: number;
  currency_code: string;
  acquired_date: string | null;
  assigned_to: string;
};
type DepreciationRow = {
  id: number;
  equipment_id: number;
  equipment_name: string;
  year: number;
  amount_native: number;
  amount_afn: number;
  currency_code: string;
};

type EquipmentReportResponse = {
  currency: string;
  kpis: {
    active_count: number;
    disposed_count: number;
    gross_cost_afn: number;
    accumulated_depreciation_afn: number;
    net_book_value_afn: number;
    period_acquisition_count: number;
    period_asset_cost_afn: number;
    period_expense_cost_afn: number;
    period_cash_out_afn: number;
    period_depreciation_afn: number;
    period_depreciation_count: number;
    currency_count: number;
  };
  by_status?: StatusRow[];
  by_category?: CategoryRow[];
  by_acquisition?: AcquisitionRow[];
  by_currency?: Record<string, CurrencyRow>;
  currency_codes?: string[];
  acquisitions?: AcquisitionItem[];
  depreciation?: DepreciationRow[];
};

const PERIODS = ['daily', 'weekly', 'monthly', 'yearly', 'custom'];

function KpiCard({
  title,
  value,
  hint,
  currency,
  icon,
  tone = 'default',
  formatValue,
}: {
  title: string;
  value: number;
  hint?: React.ReactNode;
  currency?: string;
  icon: React.ReactNode;
  tone?: 'default' | 'good' | 'bad' | 'neutral';
  formatValue?: (value: number, currency?: string) => string;
}) {
  const toneClass =
    tone === 'good'
      ? 'border-l-emerald-500'
      : tone === 'bad'
        ? 'border-l-red-500'
        : tone === 'neutral'
          ? 'border-l-sky-500'
          : 'border-l-primary';

  const display = formatValue
    ? formatValue(value, currency)
    : formatReportMoney(value, currency);

  return (
    <Card className={cn('h-full border-l-4 shadow-sm', toneClass)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </p>
            <p
              dir="ltr"
              className="text-xl sm:text-2xl font-semibold tabular-nums whitespace-nowrap text-start"
            >
              <span>{display}</span>
              {currency ? <span className="ms-1">{currency}</span> : null}
            </p>
            {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
          </div>
          <div className="rounded-md bg-muted/60 p-2 text-muted-foreground shrink-0">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

const EquipmentReportPage = () => {
  const { calendar } = useCalendarPreference();
  const { t } = useLanguage();
  const [period, setPeriod] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const params = useMemo(
    () => buildFinancialReportParams(period, startDate, endDate, 'monthly', calendar),
    [calendar, period, startDate, endDate],
  );

  const { data, isLoading, isError } = useFetchObjects<EquipmentReportResponse>({
    queryKey: ['equipment_report', calendar, period, startDate, endDate],
    endpoint: 'equipment/report',
    params,
    options: { staleTime: 0 },
  });

  const kpis = data?.kpis;
  const byStatus = data?.by_status || [];
  const byCategory = data?.by_category || [];
  const byAcquisition = data?.by_acquisition || [];
  const currencyCodes = data?.currency_codes?.length
    ? data.currency_codes
    : Object.keys(data?.by_currency || {});
  const byCurrency = data?.by_currency || {};
  const acquisitions = data?.acquisitions || [];
  const depreciation = data?.depreciation || [];

  const primaryCode =
    currencyCodes.find((code) => (byCurrency[code]?.gross_afn || 0) > 0 && code !== 'AFN') ||
    currencyCodes.find((code) => (byCurrency[code]?.gross_native || 0) > 0) ||
    currencyCodes[0] ||
    'AFN';
  const primary = byCurrency[primaryCode];
  const singleCurrency = currencyCodes.length === 1;
  // One currency → show native; mixed → AFN company total (table keeps native rows).
  const kpiCode = singleCurrency ? primaryCode : 'AFN';
  const kpiGross = singleCurrency
    ? (primary?.gross_native ?? kpis?.gross_cost_afn ?? 0)
    : (kpis?.gross_cost_afn ?? 0);
  const kpiDep = singleCurrency
    ? (primary?.accum_dep_native ?? kpis?.accumulated_depreciation_afn ?? 0)
    : (kpis?.accumulated_depreciation_afn ?? 0);
  const kpiNbv = singleCurrency
    ? (primary?.nbv_native ?? kpis?.net_book_value_afn ?? 0)
    : (kpis?.net_book_value_afn ?? 0);
  const kpiPeriodAsset = singleCurrency
    ? (primary?.period_asset_native ?? kpis?.period_asset_cost_afn ?? 0)
    : (kpis?.period_asset_cost_afn ?? 0);
  const kpiPeriodExpense = singleCurrency
    ? (primary?.period_expense_native ?? kpis?.period_expense_cost_afn ?? 0)
    : (kpis?.period_expense_cost_afn ?? 0);
  const kpiPeriodCash = singleCurrency
    ? (primary?.period_cash_out_native ?? kpis?.period_cash_out_afn ?? 0)
    : (kpis?.period_cash_out_afn ?? 0);
  const kpiPeriodDep = singleCurrency
    ? (primary?.period_dep_native ?? kpis?.period_depreciation_afn ?? 0)
    : (kpis?.period_depreciation_afn ?? 0);

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      in_use: t('equipment.statusInUse', 'In use'),
      in_storage: t('equipment.statusInStorage', 'In storage'),
      under_repair: t('equipment.statusUnderRepair', 'Under repair'),
      disposed: t('equipment.statusDisposed', 'Disposed'),
    };
    return map[status] || status;
  };

  const categoryLabel = (category: string) =>
    t(`equipment.categories.${category}`, category || t('equipment.categories.other', 'Other'));

  const acquisitionLabel = (type: string) => {
    const map: Record<string, string> = {
      new_purchase: t('equipment.acquisitionNew', 'New purchase (asset)'),
      opening: t('equipment.acquisitionOpening', 'Already owned'),
      owner_contribution: t('equipment.acquisitionOwner', 'Owner contribution'),
      expense: t('equipment.acquisitionExpense', 'Record as expense'),
    };
    return map[type] || type;
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <ReportFilters
        title={t('equipment.reportTitle', 'Equipment Report')}
        subtitle={t(
          'equipment.reportHint',
          'Native currency amounts — AFN only as equivalent',
        )}
        icon={<Monitor className="h-7 w-7 text-primary shrink-0" />}
        headerAction={
          <Button variant="outline" asChild>
            <Link to="/equipment">
              <ArrowLeft className="h-4 w-4" />
              {t('equipment.title', 'Equipment')}
            </Link>
          </Button>
        }
        periods={PERIODS}
        period={period}
        onPeriodChange={setPeriod}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
      />

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t('reports.analyzingData')}</p>
        </div>
      )}

      {isError && !isLoading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t('equipment.reportLoadError', 'Could not load the equipment report.')}
          </CardContent>
        </Card>
      )}

      {!isLoading && kpis && (
        <>
          <div className="space-y-3">
            <div>
              <h2 className="text-base font-semibold">
                {t('equipment.reportPositionSection', 'Asset position')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {singleCurrency && primary
                  ? t(
                      'equipment.reportPositionNativeHint',
                      'Shown in the currency assets were saved in',
                    )
                  : t(
                      'equipment.reportPositionHint',
                      'Native amounts per currency — not mixed',
                    )}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
              <KpiCard
                title={t('equipment.reportActiveAssets', 'Active assets')}
                value={kpis.active_count}
                hint={`${formatNumber(kpis.disposed_count)} ${t('equipment.reportDisposed', 'disposed')}`}
                icon={<Monitor className="h-5 w-5" />}
                tone="good"
                formatValue={(v) => formatNumber(v)}
              />
              <KpiCard
                title={t('equipment.reportGrossCost', 'Gross cost')}
                value={kpiGross}
                currency={kpiCode}
                hint={
                  singleCurrency && primary && primaryCode !== 'AFN' ? (
                    <>
                      {t('equipment.reportAfnEq', 'AFN eq.')}{' '}
                      <ReportMoney value={primary.gross_afn} code="AFN" />
                    </>
                  ) : !singleCurrency ? (
                    t('equipment.reportAfnTotalHint', 'All currencies as AFN')
                  ) : undefined
                }
                icon={<Landmark className="h-5 w-5" />}
              />
              <KpiCard
                title={t('equipment.reportAccumDep', 'Accumulated depreciation')}
                value={kpiDep}
                currency={kpiCode}
                hint={
                  singleCurrency && primary && primaryCode !== 'AFN' ? (
                    <>
                      {t('equipment.reportAfnEq', 'AFN eq.')}{' '}
                      <ReportMoney value={primary.accum_dep_afn} code="AFN" />
                    </>
                  ) : undefined
                }
                icon={<Scale className="h-5 w-5" />}
                tone="neutral"
              />
              <KpiCard
                title={t('equipment.reportNetBookValue', 'Net book value')}
                value={kpiNbv}
                currency={kpiCode}
                hint={
                  singleCurrency && primary && primaryCode !== 'AFN' ? (
                    <>
                      {t('equipment.reportAfnEq', 'AFN eq.')}{' '}
                      <ReportMoney value={primary.nbv_afn} code="AFN" />
                    </>
                  ) : undefined
                }
                icon={<Banknote className="h-5 w-5" />}
                tone="good"
              />
            </div>
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t('equipment.reportPositionByCurrency', 'Position by currency')}
              </CardTitle>
              <CardDescription>
                {t(
                  'equipment.reportPositionByCurrencyHint',
                  'Native amounts per currency — never mixed',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('equipment.currency', 'Currency')}</ReportTh>
                    <ReportTh>{t('equipment.reportColActive', 'Active')}</ReportTh>
                    <ReportTh>{t('equipment.reportColCost', 'Cost')}</ReportTh>
                    <ReportTh>{t('equipment.reportColDep', 'Depreciation')}</ReportTh>
                    <ReportTh>{t('equipment.reportColNbv', 'NBV')}</ReportTh>
                    <ReportTh>{t('equipment.reportAfnEq', 'AFN eq.')}</ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {currencyCodes.map((code) => {
                    const row = byCurrency[code];
                    if (!row) return null;
                    return (
                      <tr key={code} className="border-b last:border-0">
                        <td className="py-2">
                          <ReportCurrencyLabel code={code} name={row.name} />
                        </td>
                        <td className="py-2">
                          <ReportNumber value={row.active_count} />
                          {row.disposed_count > 0 ? (
                            <span className="ms-1 text-xs text-muted-foreground">
                              ({formatNumber(row.disposed_count)}{' '}
                              {t('equipment.reportDisposed', 'disposed')})
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2">
                          <ReportMoney value={row.gross_native} code={code} />
                        </td>
                        <td className="py-2">
                          <ReportMoney value={row.accum_dep_native} code={code} />
                        </td>
                        <td className="py-2 font-medium">
                          <ReportMoney value={row.nbv_native} code={code} />
                        </td>
                        <td className="py-2 text-muted-foreground">
                          <ReportMoney value={row.nbv_afn} code="AFN" />
                        </td>
                      </tr>
                    );
                  })}
                  {!currencyCodes.length && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        {t('equipment.reportNoAssets', 'No equipment assets')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <div>
              <h2 className="text-base font-semibold">
                {t('equipment.reportPeriodSection', 'Period activity')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t(
                  'equipment.reportPeriodHint',
                  'Acquisitions and depreciation in native currency',
                )}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
              <KpiCard
                title={t('equipment.reportPeriodAssets', 'Assets acquired')}
                value={kpiPeriodAsset}
                currency={kpiCode}
                hint={`${formatNumber(kpis.period_acquisition_count)} ${t('equipment.reportItems', 'items')}`}
                icon={<Monitor className="h-5 w-5" />}
              />
              <KpiCard
                title={t('equipment.reportPeriodExpense', 'Expense purchases')}
                value={kpiPeriodExpense}
                currency={kpiCode}
                icon={<Wrench className="h-5 w-5" />}
                tone="neutral"
              />
              <KpiCard
                title={t('equipment.reportPeriodCashOut', 'Cash out')}
                value={kpiPeriodCash}
                currency={kpiCode}
                hint={t(
                  'equipment.reportPeriodCashOutHint',
                  'New purchases + expense items',
                )}
                icon={<Banknote className="h-5 w-5" />}
              />
              <KpiCard
                title={t('equipment.reportPeriodDepreciation', 'Depreciation')}
                value={kpiPeriodDep}
                currency={kpiCode}
                hint={`${formatNumber(kpis.period_depreciation_count)} ${t('equipment.reportEntries', 'entries')}`}
                icon={<Scale className="h-5 w-5" />}
                tone={kpiPeriodDep > 0 ? 'neutral' : 'default'}
              />
            </div>
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t('equipment.reportPeriodByCurrency', 'Period by currency')}
              </CardTitle>
              <CardDescription>
                {t(
                  'equipment.reportPeriodByCurrencyHint',
                  'Period acquisitions and depreciation in each currency',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('equipment.currency', 'Currency')}</ReportTh>
                    <ReportTh>{t('equipment.reportItems', 'Items')}</ReportTh>
                    <ReportTh>{t('equipment.reportColAssets', 'Assets')}</ReportTh>
                    <ReportTh>{t('equipment.reportColExpense', 'Expense')}</ReportTh>
                    <ReportTh>{t('equipment.reportColCashOut', 'Cash out')}</ReportTh>
                    <ReportTh>{t('equipment.reportColDep', 'Depreciation')}</ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {currencyCodes.map((code) => {
                    const row = byCurrency[code];
                    if (!row) return null;
                    if (
                      !row.period_count &&
                      !row.period_dep_count &&
                      !row.period_asset_native &&
                      !row.period_expense_native
                    ) {
                      return null;
                    }
                    return (
                      <tr key={`period-${code}`} className="border-b last:border-0">
                        <td className="py-2">
                          <ReportCurrencyLabel code={code} />
                        </td>
                        <td className="py-2">
                          <ReportNumber value={row.period_count} />
                        </td>
                        <td className="py-2">
                          <ReportMoney value={row.period_asset_native} code={code} />
                        </td>
                        <td className="py-2">
                          <ReportMoney value={row.period_expense_native} code={code} />
                        </td>
                        <td className="py-2 font-medium">
                          <ReportMoney value={row.period_cash_out_native} code={code} />
                        </td>
                        <td className="py-2">
                          <ReportMoney value={row.period_dep_native} code={code} />
                        </td>
                      </tr>
                    );
                  })}
                  {!currencyCodes.some((code) => {
                    const row = byCurrency[code];
                    return row && (row.period_count || row.period_dep_count);
                  }) && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        {t(
                          'equipment.reportNoAcquisitions',
                          'No acquisitions in this period',
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {t('equipment.reportByStatus', 'By status')}
                </CardTitle>
                <CardDescription>
                  {t('equipment.reportByStatusHint', 'Native amounts per currency')}
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <ReportTh>{t('equipment.status', 'Status')}</ReportTh>
                      <ReportTh>{t('equipment.currency', 'Currency')}</ReportTh>
                      <ReportTh>{t('equipment.reportCount', 'Count')}</ReportTh>
                      <ReportTh>{t('equipment.reportColCost', 'Cost')}</ReportTh>
                      <ReportTh>{t('equipment.reportColNbv', 'NBV')}</ReportTh>
                    </tr>
                  </thead>
                  <tbody>
                    {byStatus.map((row) => (
                      <tr
                        key={`${row.status}-${row.currency_code}`}
                        className="border-b last:border-0"
                      >
                        <td className="py-2 font-medium">{statusLabel(row.status)}</td>
                        <td className="py-2">
                          <ReportCurrencyLabel code={row.currency_code} />
                        </td>
                        <td className="py-2">
                          <ReportNumber value={row.count} />
                        </td>
                        <td className="py-2">
                          <ReportMoney value={row.cost_native} code={row.currency_code} />
                        </td>
                        <td className="py-2 font-medium">
                          <ReportMoney value={row.nbv_native} code={row.currency_code} />
                        </td>
                      </tr>
                    ))}
                    {!byStatus.length && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-muted-foreground">
                          {t('equipment.reportNoAssets', 'No equipment assets')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {t('equipment.reportByCategory', 'By category')}
                </CardTitle>
                <CardDescription>
                  {t('equipment.reportByCategoryHint', 'Active assets in native currency')}
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <ReportTh>{t('equipment.category', 'Category')}</ReportTh>
                      <ReportTh>{t('equipment.currency', 'Currency')}</ReportTh>
                      <ReportTh>{t('equipment.reportCount', 'Count')}</ReportTh>
                      <ReportTh>{t('equipment.reportColCost', 'Cost')}</ReportTh>
                      <ReportTh>{t('equipment.reportColNbv', 'NBV')}</ReportTh>
                    </tr>
                  </thead>
                  <tbody>
                    {byCategory.map((row) => (
                      <tr
                        key={`${row.category}-${row.currency_code}`}
                        className="border-b last:border-0"
                      >
                        <td className="py-2 font-medium">{categoryLabel(row.category)}</td>
                        <td className="py-2">
                          <ReportCurrencyLabel code={row.currency_code} />
                        </td>
                        <td className="py-2">
                          <ReportNumber value={row.count} />
                        </td>
                        <td className="py-2">
                          <ReportMoney value={row.cost_native} code={row.currency_code} />
                        </td>
                        <td className="py-2 font-medium">
                          <ReportMoney value={row.nbv_native} code={row.currency_code} />
                        </td>
                      </tr>
                    ))}
                    {!byCategory.length && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-muted-foreground">
                          {t('equipment.reportNoAssets', 'No equipment assets')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t('equipment.reportByAcquisition', 'Acquisitions by type')}
              </CardTitle>
              <CardDescription>
                {t(
                  'equipment.reportByAcquisitionHint',
                  'Items acquired in the selected period — native amounts',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('equipment.acquisitionType', 'How acquired')}</ReportTh>
                    <ReportTh>{t('equipment.currency', 'Currency')}</ReportTh>
                    <ReportTh>{t('equipment.reportCount', 'Count')}</ReportTh>
                    <ReportTh>{t('equipment.reportColCost', 'Cost')}</ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {byAcquisition.map((row) => (
                    <tr
                      key={`${row.acquisition_type}-${row.currency_code}`}
                      className="border-b last:border-0"
                    >
                      <td className="py-2 font-medium">
                        {acquisitionLabel(row.acquisition_type)}
                      </td>
                      <td className="py-2">
                        <ReportCurrencyLabel code={row.currency_code} />
                      </td>
                      <td className="py-2">
                        <ReportNumber value={row.count} />
                      </td>
                      <td className="py-2 font-medium">
                        <ReportMoney value={row.cost_native} code={row.currency_code} />
                      </td>
                    </tr>
                  ))}
                  {!byAcquisition.length && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-muted-foreground">
                        {t(
                          'equipment.reportNoAcquisitions',
                          'No acquisitions in this period',
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t('equipment.reportAcquisitions', 'Acquisitions in period')}
              </CardTitle>
              <CardDescription>
                {t(
                  'equipment.reportAcquisitionsHint',
                  'Top acquisitions in the currency they were saved',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('equipment.name', 'Name')}</ReportTh>
                    <ReportTh>{t('equipment.category', 'Category')}</ReportTh>
                    <ReportTh>{t('equipment.acquisitionType', 'How acquired')}</ReportTh>
                    <ReportTh>{t('equipment.currency', 'Currency')}</ReportTh>
                    <ReportTh>{t('equipment.reportColCost', 'Cost')}</ReportTh>
                    <ReportTh>{t('equipment.reportColNbv', 'NBV')}</ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {acquisitions.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        <Link
                          to={`/equipment/${row.id}`}
                          className="text-primary hover:underline"
                        >
                          {row.name}
                        </Link>
                        {row.serial_number ? (
                          <span dir="ltr" className="ms-2 text-xs text-muted-foreground">
                            {row.serial_number}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2">{categoryLabel(row.category)}</td>
                      <td className="py-2">{acquisitionLabel(row.acquisition_type)}</td>
                      <td className="py-2">
                        <ReportCurrencyLabel code={row.currency_code} />
                      </td>
                      <td className="py-2">
                        <ReportMoney value={row.cost_native} code={row.currency_code} />
                      </td>
                      <td className="py-2 font-medium">
                        <ReportMoney value={row.nbv_native} code={row.currency_code} />
                      </td>
                    </tr>
                  ))}
                  {!acquisitions.length && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        {t(
                          'equipment.reportNoAcquisitions',
                          'No acquisitions in this period',
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t('equipment.reportDepreciationSection', 'Depreciation entries')}
              </CardTitle>
              <CardDescription>
                {t(
                  'equipment.reportDepreciationHint',
                  'Yearly depreciation in the asset currency',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('equipment.name', 'Name')}</ReportTh>
                    <ReportTh>{t('equipment.depreciation.year', 'Year')}</ReportTh>
                    <ReportTh>{t('equipment.currency', 'Currency')}</ReportTh>
                    <ReportTh>{t('equipment.reportAmount', 'Amount')}</ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {depreciation.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        <Link
                          to={`/equipment/${row.equipment_id}`}
                          className="text-primary hover:underline"
                        >
                          {row.equipment_name}
                        </Link>
                      </td>
                      <td className="py-2">
                        <span dir="ltr" className="inline-block tabular-nums">
                          {row.year}
                        </span>
                      </td>
                      <td className="py-2">
                        <ReportCurrencyLabel code={row.currency_code} />
                      </td>
                      <td className="py-2 font-medium">
                        <ReportMoney value={row.amount_native} code={row.currency_code} />
                      </td>
                    </tr>
                  ))}
                  {!depreciation.length && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-muted-foreground">
                        {t(
                          'equipment.reportNoDepreciation',
                          'No depreciation entries in this period',
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default EquipmentReportPage;
