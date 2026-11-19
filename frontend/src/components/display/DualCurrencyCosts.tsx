import { formatPrice } from '@/lib/formatNumber';
import useFetchObjects from '@/api/useFetchObjects';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Props = {
  rows: Array<{ label: string; afn: string | number | null | undefined }>;
  // undefined: look up current/dated rate; null: a saved record has no rate.
  rate?: string | number | null;
  atDate?: string;
  compact?: boolean;
  basis?: 'saved' | 'current';
};

export function useCostReportingRate(savedRate?: string | number | null, atDate?: string) {
  const { data, isLoading } = useFetchObjects<{ rate: string | number | null }>({
    queryKey: ['cost-usd-rate', atDate || 'current'],
    endpoint: 'exchange-rates/lookup/',
    params: { currency: 2, cost_reporting: 'true', ...(atDate ? { date: atDate.length === 10 ? `${atDate}T12:00:00` : atDate } : {}) },
    enabled: savedRate === undefined,
  });
  const rate = Number(savedRate === undefined ? data?.rate : savedRate);
  return { rate, isLoading };
}

export function DualCurrencyAmount({ afn, rate }: {
  afn: string | number | null | undefined;
  rate?: string | number | null;
}) {
  const exchangeRate = Number(rate);
  return <bdi dir="ltr" className="font-medium tabular-nums">
    AFN {afn == null ? '—' : formatPrice(afn)} | USD {exchangeRate > 0 && afn != null ? formatPrice(Number(afn) / exchangeRate) : '—'}
  </bdi>;
}

export function DualCurrencyCosts({ rows, rate: savedRate, atDate, compact = false, basis = 'saved' }: Props) {
  const { t } = useLanguage();
  const { rate, isLoading } = useCostReportingRate(savedRate, atDate);
  const content = <div className={compact ? 'space-y-1' : 'space-y-2'}>
    {rows.map((row, i) => (
      <div
        key={i}
        className={
          compact && !row.label
            ? 'whitespace-nowrap text-sm'
            : 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm'
        }
      >
        {row.label ? <span className="min-w-0 truncate">{row.label}</span> : null}
        <DualCurrencyAmount afn={row.afn} rate={rate} />
      </div>
    ))}
    {!compact && <p className="text-xs text-muted-foreground">
      {rate > 0 ? `1 USD = ${formatPrice(rate)} AFN` : isLoading && savedRate === undefined ? t('common.loading', 'Loading…') : t('costs.rateUnavailable', 'USD cost unavailable: no exchange rate for this date.')}
      {rate > 0 && (savedRate === undefined || basis === 'current' ? ` · ${t('costs.reportingRate', 'Reporting rate')}` : ` · ${t('costs.savedRate', 'Saved rate')}`)}
    </p>}
  </div>;
  return compact ? content : <Card><CardHeader><CardTitle>{t('costs.title', 'Cost')}</CardTitle></CardHeader><CardContent>{content}</CardContent></Card>;
}
