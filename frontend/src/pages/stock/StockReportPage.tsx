import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertOctagon,
  ArrowLeft,
  Loader2,
  Package,
  Scale,
  Warehouse,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ReportFilters } from '@/components/reports/ReportFilters';
import {
  ReportCurrencyLabel,
  ReportMoney,
  ReportNumber,
  ReportTh,
} from '@/components/reports/ReportAmount';
import useFetchObjects from '@/api/useFetchObjects';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { buildFinancialReportParams } from '@/lib/reportPeriod';
import { formatNumber, formatReportMoney } from '@/lib/formatNumber';
import { cn } from '@/lib/utils';

type ConditionRow = {
  condition: string;
  sku_count: number;
  quantity: number;
  available: number;
  value_afn: number;
};

type DamageRow = {
  kind: string;
  label: string;
  count: number;
  quantity: number;
  unit: string;
  cost_afn: number;
};

type PackagingComponentRow = {
  component_type: string;
  quantity: number;
  unit: string;
  cost_afn: number;
  line_count: number;
};

type StockReportResponse = {
  currency: string;
  kpis: {
    stock_value_afn: number;
    stock_pieces: number;
    sku_count: number;
    good_value_afn: number;
    good_pieces: number;
    damaged_lot_value_afn: number;
    damaged_lot_pieces: number;
    waste_value_afn: number;
    waste_pieces: number;
    period_damage_loss_afn: number;
    period_damage_events: number;
    bottle_damage_events: number;
    bottles_damaged: number;
  };
  by_condition?: ConditionRow[];
  damages?: DamageRow[];
  packaging_components?: PackagingComponentRow[];
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
  hint?: string;
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
            <p dir="ltr" className="text-xl sm:text-2xl font-semibold tabular-nums whitespace-nowrap text-start">
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

const StockReportPage = () => {
  const { calendar } = useCalendarPreference();
  const { t } = useLanguage();
  const [period, setPeriod] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const params = useMemo(
    () => buildFinancialReportParams(period, startDate, endDate, 'monthly', calendar),
    [calendar, period, startDate, endDate],
  );

  const { data, isLoading, isError } = useFetchObjects<StockReportResponse>({
    queryKey: ['stock_report', calendar, period, startDate, endDate],
    endpoint: 'stocks/report',
    params,
    options: { staleTime: 0 },
  });

  const currency = data?.currency || 'AFN';
  const kpis = data?.kpis;
  const byCondition = data?.by_condition || [];
  const damages = data?.damages || [];
  const packagingComponents = data?.packaging_components || [];

  const conditionLabel = (condition: string) => {
    if (condition === 'good') return t('stock.condition.good', 'Good');
    if (condition === 'damaged') return t('stock.condition.damaged', 'Damaged');
    if (condition === 'waste') return t('stock.condition.waste', 'Waste');
    return condition;
  };

  const damageLabel = (kind: string) => {
    const map: Record<string, string> = {
      packaging_manual: t('stock.reportDamagePackaging', 'Packaging damage'),
      bottle_damage: t('stock.reportDamageBottles', 'Bottle damage'),
      bottle_spill: t('stock.reportDamageSpill', 'Bottle spill liquid'),
      tank_leak: t('stock.reportDamageTankLeak', 'Tank leak'),
      condition_reclass: t('stock.reportDamageReclass', 'Condition reclass'),
      write_off_damaged: t('stock.reportWriteOffDamaged', 'Write-off damaged'),
      write_off_expired: t('stock.reportWriteOffExpired', 'Write-off expired'),
      write_off_lost: t('stock.reportWriteOffLost', 'Write-off lost'),
    };
    return map[kind] || kind;
  };

  const componentLabel = (type: string) => {
    if (type === 'label') return t('packing.component_label', 'Label');
    if (type === 'plastic') return t('sales.plastic', 'Plastic');
    if (type === 'carton') return t('sales.carton', 'Carton');
    if (type === 'liquid') return t('stock.damagedLiquid', 'Damaged liquid');
    return type;
  };

  const unitLabel = (unit: string) => {
    if (unit === 'piece' || unit === 'bottle') return t('sales.piecesShort', 'pcs');
    if (unit === 'kg') return t('common.kg', 'kg');
    if (unit === 'mixed') return t('stock.reportMixedUnit', 'mixed');
    return unit;
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <ReportFilters
        title={t('stock.reportTitle', 'Stock Report')}
        subtitle={t(
          'stock.reportHint',
          'On-hand stock by condition and period damages',
        )}
        icon={<Warehouse className="h-7 w-7 text-primary shrink-0" />}
        headerAction={
          <Button variant="outline" asChild>
            <Link to="/stock">
              <ArrowLeft className="h-4 w-4" />
              {t('stock.title', 'Stock')}
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
            {t('stock.reportLoadError', 'Could not load the stock report.')}
          </CardContent>
        </Card>
      )}

      {!isLoading && kpis && (
        <>
          <div className="space-y-3">
            <div>
              <h2 className="text-base font-semibold">
                {t('stock.reportPositionSection', 'Stock position')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t(
                  'stock.reportPositionHint',
                  'Current on-hand value by condition (AFN)',
                )}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
              <KpiCard
                title={t('stock.reportStockValue', 'Stock value')}
                value={kpis.stock_value_afn}
                currency={currency}
                hint={`${formatNumber(kpis.sku_count)} ${t('stock.reportSkus', 'SKUs')} · ${formatNumber(kpis.stock_pieces)} ${t('sales.piecesShort', 'pcs')}`}
                icon={<Warehouse className="h-5 w-5" />}
              />
              <KpiCard
                title={t('stock.condition.good', 'Good')}
                value={kpis.good_value_afn}
                currency={currency}
                hint={`${formatNumber(kpis.good_pieces)} ${t('sales.piecesShort', 'pcs')}`}
                icon={<Package className="h-5 w-5" />}
                tone="good"
              />
              <KpiCard
                title={t('stock.reportDamagedLots', 'Damaged lots')}
                value={kpis.damaged_lot_value_afn}
                currency={currency}
                hint={`${formatNumber(kpis.damaged_lot_pieces)} ${t('sales.piecesShort', 'pcs')}`}
                icon={<AlertOctagon className="h-5 w-5" />}
                tone={kpis.damaged_lot_value_afn > 0 ? 'bad' : 'neutral'}
              />
              <KpiCard
                title={t('stock.reportPeriodDamageLoss', 'Period damage loss')}
                value={kpis.period_damage_loss_afn}
                currency={currency}
                hint={`${formatNumber(kpis.period_damage_events)} ${t('stock.reportEvents', 'events')} · ${formatNumber(kpis.bottles_damaged)} ${t('stock.reportBottles', 'bottles')}`}
                icon={<Scale className="h-5 w-5" />}
                tone={kpis.period_damage_loss_afn > 0 ? 'bad' : 'default'}
              />
            </div>
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t('stock.reportByCondition', 'Stock by condition')}
              </CardTitle>
              <CardDescription>
                {t(
                  'stock.reportByConditionHint',
                  'Good, damaged, and waste lots currently on hand',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('stock.conditionLabel', 'Condition')}</ReportTh>
                    <ReportTh>{t('stock.reportSkus', 'SKUs')}</ReportTh>
                    <ReportTh>{t('stock.quantity', 'Quantity')}</ReportTh>
                    <ReportTh>{t('stock.availableQuantity', 'Available')}</ReportTh>
                    <ReportTh>{t('stock.reportStockValue', 'Value')}</ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {byCondition.map((row) => (
                    <tr key={row.condition} className="border-b last:border-0">
                      <td className="py-2 font-medium">{conditionLabel(row.condition)}</td>
                      <td className="py-2"><ReportNumber value={row.sku_count} /></td>
                      <td className="py-2"><ReportNumber value={row.quantity} /></td>
                      <td className="py-2"><ReportNumber value={row.available} /></td>
                      <td className="py-2 tabular-nums font-medium">
                        <ReportMoney value={row.value_afn} code="AFN" />
                      </td>
                    </tr>
                  ))}
                  {!byCondition.length && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground">
                        {t('stock.reportNoStock', 'No stock on hand')}
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
                {t('stock.reportDamageSection', 'Damages in period')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t(
                  'stock.reportDamageSectionHint',
                  'Packaging, bottle damage, spills, tank leaks, reclass, and write-offs',
                )}
              </p>
            </div>
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t('stock.reportDamagesByType', 'Damages by type')}
              </CardTitle>
              <CardDescription>
                {t(
                  'stock.reportDamagesByTypeHint',
                  'Period loss and reclassification by damage pathway',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('stock.reportDamageType', 'Type')}</ReportTh>
                    <ReportTh>{t('stock.reportEvents', 'Events')}</ReportTh>
                    <ReportTh>{t('stock.quantity', 'Quantity')}</ReportTh>
                    <ReportTh>{t('stock.reportStockValue', 'Cost')}</ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {damages.map((row) => (
                    <tr key={row.kind} className="border-b last:border-0">
                      <td className="py-2 font-medium">{damageLabel(row.kind)}</td>
                      <td className="py-2"><ReportNumber value={row.count} /></td>
                      <td className="py-2">
                        <span dir="ltr" className="inline-block tabular-nums whitespace-nowrap">
                          {formatNumber(row.quantity)} {unitLabel(row.unit)}
                        </span>
                      </td>
                      <td className="py-2 font-medium">
                        <ReportMoney value={row.cost_afn} code="AFN" />
                      </td>
                    </tr>
                  ))}
                  {!damages.length && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-muted-foreground">
                        {t('stock.reportNoDamages', 'No damages in this period')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {packagingComponents.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {t('stock.reportPackagingComponents', 'Packaging damage components')}
                </CardTitle>
                <CardDescription>
                  {t(
                    'stock.reportPackagingComponentsHint',
                    'Manual packaging damage by label, plastic, and carton',
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <ReportTh>{t('stock.reportComponent', 'Component')}</ReportTh>
                      <ReportTh>{t('stock.quantity', 'Quantity')}</ReportTh>
                      <ReportTh>{t('stock.reportStockValue', 'Cost')}</ReportTh>
                    </tr>
                  </thead>
                  <tbody>
                    {packagingComponents.map((row) => (
                      <tr key={row.component_type} className="border-b last:border-0">
                        <td className="py-2 font-medium">
                          {componentLabel(row.component_type)}
                        </td>
                        <td className="py-2">
                          <span dir="ltr" className="inline-block tabular-nums whitespace-nowrap">
                            {formatNumber(row.quantity)} {unitLabel(row.unit)}
                          </span>
                        </td>
                        <td className="py-2 font-medium">
                          <ReportMoney value={row.cost_afn} code="AFN" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default StockReportPage;
