import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  HandCoins,
  Loader2,
  Package,
  TrendingDown,
  Warehouse,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ReportFilters } from '@/components/reports/ReportFilters';
import { ReportMoney, ReportNumber } from '@/components/reports/ReportAmount';
import useFetchObjects from '@/api/useFetchObjects';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { buildFinancialReportParams } from '@/lib/reportPeriod';
import { formatNumber, formatReportMoney } from '@/lib/formatNumber';
import { cn } from '@/lib/utils';
import { ListDate } from '@/components/display/ListDate';

type StockRow = {
  product_id: number;
  product?: string | null;
  sku?: string;
  warehouse?: string | null;
  on_hand?: number;
  average_cost?: number;
  value?: number;
  reorder_level?: number;
  is_critical?: boolean;
};

type LossRow = {
  id: number;
  product?: string | null;
  warehouse?: string | null;
  quantity?: number;
  loss_value?: number;
  reason?: string;
  adjustment_date?: string | null;
};

type ExpiredOnHandRow = {
  product_id: number;
  product?: string | null;
  warehouse?: string | null;
  lot_number?: string;
  expiry_date?: string | null;
  on_hand?: number;
  value?: number;
  days_expired?: number;
};

type MovementRow = {
  movement_type: string;
  label?: string;
  count: number;
  qty_abs?: number;
  qty?: number;
};

type StockReportResponse = {
  currency?: string;
  kpis?: {
    products_with_stock?: number;
    product_balance_count?: number;
    total_value_afn?: number;
    net_value_afn?: number;
    expired_on_hand_value_afn?: number;
    expired_on_hand_count?: number;
    low_stock_count?: number;
    qty_in?: number;
    qty_out?: number;
    damage_loss_afn?: number;
    damage_count?: number;
    expiry_loss_afn?: number;
    expiry_count?: number;
    period_writeoff_loss_afn?: number;
  };
  low_stock?: StockRow[];
  top_by_value?: StockRow[];
  expired_on_hand?: ExpiredOnHandRow[];
  period_damages?: LossRow[];
  period_expired?: LossRow[];
  movements_summary?: MovementRow[];
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

function EmptyTable({ message }: { message: string }) {
  return (
    <p className="p-8 text-center text-sm text-muted-foreground">{message}</p>
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
    queryKey: ['stock-report', calendar, period, startDate, endDate],
    endpoint: 'stocks/report/',
    params,
    options: { staleTime: 0 },
  });

  const currency = data?.currency || 'AFN';
  const kpis = data?.kpis;
  const lowStock = data?.low_stock || [];
  const topByValue = data?.top_by_value || [];
  const expiredOnHand = data?.expired_on_hand || [];
  const damages = data?.period_damages || [];
  const expiredWriteoffs = data?.period_expired || [];
  const movements = data?.movements_summary || [];

  const productsWithStock = Number(
    kpis?.products_with_stock ?? kpis?.product_balance_count ?? 0,
  );
  const stockValue = Number(kpis?.total_value_afn) || 0;
  const expiredValue = Number(kpis?.expired_on_hand_value_afn) || 0;
  const netValue = Number(kpis?.net_value_afn ?? stockValue - expiredValue) || 0;
  const damageLoss = Number(kpis?.damage_loss_afn) || 0;
  const expiryLoss = Number(kpis?.expiry_loss_afn) || 0;

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <ReportFilters
        title={t('stock.reportTitle', 'Stock Report')}
        subtitle={t(
          'stock.reportHint',
          'Stock value, net good value after expired lots, and period damage/expiry losses',
        )}
        icon={<Warehouse className="h-7 w-7 text-primary shrink-0" />}
        headerAction={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/reports">{t('reports.hubTitle', 'Reports')}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/stock">
                <ArrowLeft className="h-4 w-4" />
                {t('stock.title', 'Stock')}
              </Link>
            </Button>
          </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <KpiCard
              title={t('stock.totalValue', 'Stock value')}
              value={stockValue}
              currency={currency}
              hint={`${formatNumber(productsWithStock)} ${t('stock.skuCount', 'products with stock')}`}
              icon={<Warehouse className="h-5 w-5" />}
            />
            <KpiCard
              title={t('stock.netValue', 'Net value')}
              value={netValue}
              currency={currency}
              hint={t(
                'stock.netValueHint',
                'Stock value minus expired lots still on hand',
              )}
              icon={<HandCoins className="h-5 w-5" />}
              tone="good"
            />
            <KpiCard
              title={t('stock.periodDamageLoss', 'Damage loss')}
              value={damageLoss}
              currency={currency}
              hint={`${formatNumber(Number(kpis.damage_count) || 0)} ${t('stock.damageRecords', 'records in period')}`}
              icon={<AlertOctagon className="h-5 w-5" />}
              tone={damageLoss > 0 ? 'bad' : 'default'}
            />
            <KpiCard
              title={t('stock.periodExpiryLoss', 'Expiry loss')}
              value={expiryLoss}
              currency={currency}
              hint={
                expiredValue > 0
                  ? `${t('stock.expiredStillOnHand', 'Still on hand')}: ${formatReportMoney(expiredValue, currency)} ${currency}`
                  : `${formatNumber(Number(kpis.expiry_count) || 0)} ${t('stock.expiryRecords', 'write-offs in period')}`
              }
              icon={<CalendarClock className="h-5 w-5" />}
              tone={expiryLoss > 0 || expiredValue > 0 ? 'bad' : 'default'}
            />
          </div>

          <Card className="shadow-sm">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span className="font-medium">{t('stock.valueBridge', 'Value bridge')}</span>
                <span className="text-muted-foreground">
                  {t('stock.totalValue', 'Stock value')}{' '}
                  <span className="tabular-nums font-medium text-foreground">
                    {formatReportMoney(stockValue, currency)}
                  </span>
                </span>
                <span className="text-muted-foreground">−</span>
                <span className="text-muted-foreground">
                  {t('stock.expiredOnHand', 'Expired on hand')}{' '}
                  <span className="tabular-nums font-medium text-foreground">
                    {formatReportMoney(expiredValue, currency)}
                  </span>
                </span>
                <span className="text-muted-foreground">=</span>
                <span className="text-muted-foreground">
                  {t('stock.netValue', 'Net value')}{' '}
                  <span className="tabular-nums font-semibold text-foreground">
                    {formatReportMoney(netValue, currency)} {currency}
                  </span>
                </span>
                {(damageLoss > 0 || expiryLoss > 0) && (
                  <span className="text-xs text-muted-foreground ms-auto">
                    {t('stock.periodWriteoffsHint', 'Period write-offs (already removed from stock)')}:{' '}
                    {t('stock.condition.damaged', 'Damaged')} {formatReportMoney(damageLoss, currency)}
                    {' · '}
                    {t('stock.expired', 'Expired')} {formatReportMoney(expiryLoss, currency)}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card className="shadow-sm overflow-hidden">
              <CardHeader className="border-b bg-muted/20 py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" />
                  {t('stock.topByValue', 'Highest value stock')}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {topByValue.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>{t('stock.product', 'Product')}</TableHead>
                        <TableHead>{t('stock.warehouse', 'Warehouse')}</TableHead>
                        <TableHead className="text-end">{t('stock.baseOnHand', 'On hand')}</TableHead>
                        <TableHead className="text-end">{t('stock.onHandValue', 'Value')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topByValue.map((row) => (
                        <TableRow key={`top-${row.product_id}-${row.warehouse}`}>
                          <TableCell className="font-medium max-w-[12rem] truncate" title={row.product || ''}>
                            {row.product || '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{row.warehouse || '—'}</TableCell>
                          <TableCell className="text-end tabular-nums">
                            <ReportNumber value={Number(row.on_hand) || 0} />
                          </TableCell>
                          <TableCell className="text-end tabular-nums font-medium">
                            <ReportMoney value={Number(row.value) || 0} currency={currency} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyTable message={t('stock.noStockFound', 'No stock balances found')} />
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm overflow-hidden">
              <CardHeader className="border-b bg-muted/20 py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  {t('stock.lowStockItems', 'Low stock items')}
                  {Number(kpis.low_stock_count) > 0 ? (
                    <Badge variant="secondary" className="ms-1">
                      {formatNumber(Number(kpis.low_stock_count) || 0)}
                    </Badge>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {lowStock.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>{t('stock.product', 'Product')}</TableHead>
                        <TableHead>{t('stock.warehouse', 'Warehouse')}</TableHead>
                        <TableHead className="text-end">{t('stock.baseOnHand', 'On hand')}</TableHead>
                        <TableHead className="text-end">{t('common.status', 'Status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lowStock.map((row) => (
                        <TableRow key={`low-${row.product_id}-${row.warehouse}`}>
                          <TableCell className="font-medium max-w-[12rem] truncate" title={row.product || ''}>
                            {row.product || '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{row.warehouse || '—'}</TableCell>
                          <TableCell className="text-end tabular-nums">
                            <ReportNumber value={Number(row.on_hand) || 0} />
                          </TableCell>
                          <TableCell className="text-end">
                            <Badge variant={row.is_critical ? 'destructive' : 'secondary'}>
                              {row.is_critical
                                ? t('stock.criticalStock', 'Critical')
                                : t('stock.lowStock', 'Low stock')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyTable message={t('stock.noLowStock', 'No low-stock items')} />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card className="shadow-sm overflow-hidden">
              <CardHeader className="border-b bg-muted/20 py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertOctagon className="h-4 w-4" />
                  {t('stock.periodDamages', 'Damaged in period')}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {damages.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>{t('stock.product', 'Product')}</TableHead>
                        <TableHead>{t('stock.date', 'Date')}</TableHead>
                        <TableHead className="text-end">{t('stock.quantity', 'Qty')}</TableHead>
                        <TableHead className="text-end">{t('stock.lossValue', 'Loss')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {damages.map((row) => (
                        <TableRow key={`dmg-${row.id}`}>
                          <TableCell className="min-w-0">
                            <div className="font-medium truncate max-w-[12rem]" title={row.product || ''}>
                              {row.product || '—'}
                            </div>
                            {row.reason ? (
                              <div className="text-xs text-muted-foreground truncate max-w-[12rem]" title={row.reason}>
                                {row.reason}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <ListDate value={row.adjustment_date} />
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            <ReportNumber value={Number(row.quantity) || 0} />
                          </TableCell>
                          <TableCell className="text-end tabular-nums font-medium">
                            <ReportMoney value={Number(row.loss_value) || 0} currency={currency} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyTable
                    message={t('stock.noDamagedInPeriod', 'No damaged products in this period')}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm overflow-hidden">
              <CardHeader className="border-b bg-muted/20 py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" />
                  {t('stock.expiredOnHand', 'Expired on hand')}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {expiredOnHand.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>{t('stock.product', 'Product')}</TableHead>
                        <TableHead>{t('stock.expiryDate', 'Expiry')}</TableHead>
                        <TableHead className="text-end">{t('stock.baseOnHand', 'On hand')}</TableHead>
                        <TableHead className="text-end">{t('stock.onHandValue', 'Value')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expiredOnHand.map((row) => (
                        <TableRow key={`exp-${row.product_id}-${row.warehouse}-${row.lot_number}`}>
                          <TableCell className="min-w-0">
                            <div className="font-medium truncate max-w-[12rem]" title={row.product || ''}>
                              {row.product || '—'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {row.warehouse || '—'}
                              {row.days_expired
                                ? ` · ${t('stock.expiredDaysAgo', 'Expired {{n}}d ago').replace('{{n}}', String(row.days_expired))}`
                                : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <ListDate value={row.expiry_date} />
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            <ReportNumber value={Number(row.on_hand) || 0} />
                          </TableCell>
                          <TableCell className="text-end tabular-nums font-medium">
                            <ReportMoney value={Number(row.value) || 0} currency={currency} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : expiredWriteoffs.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>{t('stock.product', 'Product')}</TableHead>
                        <TableHead>{t('stock.date', 'Date')}</TableHead>
                        <TableHead className="text-end">{t('stock.quantity', 'Qty')}</TableHead>
                        <TableHead className="text-end">{t('stock.lossValue', 'Loss')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expiredWriteoffs.map((row) => (
                        <TableRow key={`expw-${row.id}`}>
                          <TableCell className="font-medium max-w-[12rem] truncate" title={row.product || ''}>
                            {row.product || '—'}
                          </TableCell>
                          <TableCell>
                            <ListDate value={row.adjustment_date} />
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            <ReportNumber value={Number(row.quantity) || 0} />
                          </TableCell>
                          <TableCell className="text-end tabular-nums font-medium">
                            <ReportMoney value={Number(row.loss_value) || 0} currency={currency} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyTable
                    message={t('stock.noExpiredStock', 'No expired stock on hand')}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm overflow-hidden">
            <CardHeader className="border-b bg-muted/20 py-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                {t('stock.movementsInPeriod', 'Movements in period')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {movements.length ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t('stock.movementType', 'Type')}</TableHead>
                      <TableHead className="text-end">{t('stock.count', 'Count')}</TableHead>
                      <TableHead className="text-end">{t('stock.quantity', 'Qty')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((row) => (
                      <TableRow key={row.movement_type}>
                        <TableCell className="font-medium">
                          {row.label || row.movement_type}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          <ReportNumber value={Number(row.count) || 0} />
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          <ReportNumber value={Number(row.qty_abs ?? Math.abs(Number(row.qty) || 0))} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyTable
                  message={t('stock.noMovementsInPeriod', 'No stock movements in this period')}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default StockReportPage;
