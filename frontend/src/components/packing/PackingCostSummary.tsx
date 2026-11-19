import type { ReactNode } from 'react';
import { DualCurrencyAmount } from '@/components/display/DualCurrencyCosts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';

export type StockCostRow = { type: 'bottle' | 'carton' | 'plastic'; afn: string | number | null };
type Rate = string | number | null | undefined;
type Amount = string | number | null;

function CostCard({ title, rows, rate, children }: {
  title: string;
  rows: Array<{ key: string; label: string; afn: Amount; highlight?: boolean }>;
  rate: Rate;
  children?: ReactNode;
}) {
  return <Card>
    <CardHeader className="px-4 py-3 sm:px-5"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
    <CardContent className="px-4 pb-4 sm:px-5">
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(row => <div key={row.key} className={`min-w-0 rounded-md border px-3 py-2 ${row.highlight ? 'border-primary/20 bg-primary/5' : 'bg-muted/20'}`}>
          <dt className="mb-1 text-xs text-muted-foreground">{row.label}</dt>
          <dd className={`text-sm ${row.highlight ? 'font-semibold text-primary' : ''}`}>
            <DualCurrencyAmount afn={row.afn} rate={rate} />
          </dd>
        </div>)}
      </dl>
      {children}
    </CardContent>
  </Card>;
}

export function PackingCostSummary({ rate, liquidCost, packagingCost, totalCost, returnedCost }: {
  rate?: Rate; liquidCost: Amount; packagingCost: Amount; totalCost: Amount; returnedCost?: Amount;
}) {
  const { t } = useLanguage();
  return <CostCard title={t('packing.costSummary')} rate={rate} rows={[
    { key: 'liquid', label: t('packing.liquidCost'), afn: liquidCost },
    { key: 'packaging', label: t('packing.packagingCost'), afn: packagingCost },
    ...(returnedCost !== undefined ? [{ key: 'returned', label: t('packing.returnedBottleCost'), afn: returnedCost }] : []),
    { key: 'total', label: t('packing.totalCost'), afn: totalCost, highlight: true },
  ]} />;
}

export function PackingStockCosts({ rate, costs }: { rate?: Rate; costs: StockCostRow[] }) {
  const { t } = useLanguage();
  const labels = { bottle: t('packing.costPerBottle'), carton: t('packing.costPerCarton'), plastic: t('packing.costPerPlastic') };
  return <CostCard title={t('packing.stockUnitCosts')} rate={rate} rows={costs.map(row => ({ key: row.type, label: labels[row.type], afn: row.afn }))}>
    <p className="mt-2 text-xs text-muted-foreground">{t('packing.stockCostAllocation')}</p>
    <p className="mt-1 text-xs text-muted-foreground">{t('packing.stockAverageHint')}</p>
    {!(Number(rate) > 0) && <p className="mt-1 text-xs text-muted-foreground">{t('packing.usdRateUnavailable')}</p>}
  </CostCard>;
}

export function PackingFullUnitCosts({ rate, costs, title }: { rate?: Rate; costs: StockCostRow[]; title?: string }) {
  const { t } = useLanguage();
  const labels = { bottle: t('packing.costPerBottle'), carton: t('packing.costPerCarton'), plastic: t('packing.costPerPlastic') };
  return <CostCard title={title || t('packing.fullUnitCosts', 'Full filled-package costs')} rate={rate}
    rows={costs.map(row => ({ key: row.type, label: labels[row.type], afn: row.afn }))}>
    <p className="mt-2 text-xs text-muted-foreground">{t('packing.fullCostBasis', 'Includes liquid and all packing materials. Each amount is the section total divided by filled bottles or the actual cartons/plastic packages used.')}</p>
    {!(Number(rate) > 0) && <p className="mt-1 text-xs text-muted-foreground">{t('packing.usdRateUnavailable')}</p>}
  </CostCard>;
}
