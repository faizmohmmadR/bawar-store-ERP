import { useMemo } from 'react';
import useFetchObjects from '@/api/useFetchObjects';
import { useLanguage } from '@/contexts/LanguageContext';
import { FALLBACK_BASE_SYMBOL } from '@/lib/currencies';
import { resolveStaticSymbol, STATIC_CURRENCIES } from '@/components/forms/CurrencySelect';
import { cn } from '@/lib/utils';

type LookupResponse = {
  rate?: number | string;
  rate_date?: string | null;
  error?: string;
};

type AfnReportingPreviewProps = {
  /**
   * Amount in the selected invoice currency.
   * For USD: AFN reporting = amount × rate (1 USD = rate AFN).
   */
  amount?: string | number | null;
  currencyId?: string | number | null;
  atDate?: string | null;
  storedRate?: string | number | null;
  storedBase?: string | number | null;
  className?: string;
  /**
   * When true, `amount` is treated as AFN and the converted value shown is USD
   * (amount ÷ rate). Used when sell prices are entered in AFN.
   */
  amountIsAfn?: boolean;
};

const BASE_ID = 1;
const USD_ID = 2;

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Compact FX line: exchange rate + converted amount only.
 */
export function AfnReportingPreview({
  amount,
  currencyId,
  atDate,
  storedRate,
  storedBase,
  className,
  amountIsAfn = false,
}: AfnReportingPreviewProps) {
  const { t } = useLanguage();
  const cid = toNumber(currencyId);
  const native = toNumber(amount);
  const isBase = cid == null || cid === BASE_ID;

  const storedRateNum = toNumber(storedRate);
  const storedBaseNum = toNumber(storedBase);
  const hasStored =
    storedRateNum != null && storedRateNum > 0 && storedBaseNum != null && storedBaseNum >= 0;

  const lookupDate = useMemo(() => {
    if (!atDate) return undefined;
    if (atDate.length === 10) return `${atDate}T12:00:00`;
    return atDate;
  }, [atDate]);

  const { data: lookup, isLoading, isError } = useFetchObjects<LookupResponse>({
    queryKey: ['exchange-rate-lookup', String(cid || ''), lookupDate || 'now'],
    endpoint: 'exchange-rates/lookup/',
    params: {
      currency: cid || BASE_ID,
      ...(lookupDate ? { date: lookupDate } : {}),
    },
    enabled: !hasStored && !isBase && cid != null && cid > 0,
  });

  const liveRate = toNumber(lookup?.rate);
  const rate = hasStored ? storedRateNum : isBase ? 1 : liveRate;

  // amountIsAfn: prices entered in AFN → show USD = AFN / rate
  // otherwise: invoice in foreign currency → show AFN = amount × rate
  const converted = useMemo(() => {
    if (rate == null || native == null || native < 0 || rate <= 0) return null;
    if (hasStored && !amountIsAfn) return storedBaseNum;
    if (amountIsAfn) return Number((native / rate).toFixed(2));
    return Number((native * rate).toFixed(2));
  }, [rate, native, hasStored, storedBaseNum, amountIsAfn]);

  const currencyCode =
    STATIC_CURRENCIES.find((c) => c.id === cid)?.code ||
    (cid != null ? String(cid) : '—');
  const convertedSymbol = amountIsAfn
    ? resolveStaticSymbol(USD_ID)
    : FALLBACK_BASE_SYMBOL;

  if (cid == null || native == null || native < 0 || isBase) {
    return null;
  }

  const lookupFailed = !hasStored && !isLoading && (isError || Boolean(lookup?.error) || rate == null);

  return (
    <div
      className={cn(
        'rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm',
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="tabular-nums">
          <span className="text-muted-foreground text-xs me-1">
            {t('common.exchangeRate')}:
          </span>
          <span className="font-medium">
            {rate != null
              ? `1 ${currencyCode} = ${Number(rate).toFixed(2)} AFN`
              : isLoading
                ? '…'
                : '—'}
          </span>
        </div>
        <div className="tabular-nums">
          <span className="text-muted-foreground text-xs me-1">
            {amountIsAfn ? t('sales.usdAmount') : t('sales.afnEquivalent')}:
          </span>
          <span className="font-semibold">
            {converted != null
              ? `${convertedSymbol}${converted.toFixed(2)}`
              : isLoading
                ? '…'
                : '—'}
          </span>
        </div>
      </div>
      {lookupFailed && (
        <p className="text-[11px] text-destructive mt-1">
          {t('sales.missingExchangeRate')}
        </p>
      )}
    </div>
  );
}

export default AfnReportingPreview;
