import { cn } from '@/lib/utils';
import {
  FALLBACK_BASE_CODE,
  FALLBACK_BASE_SYMBOL,
  type CurrencyDetails,
} from '@/lib/currencies';

type StatementAmountProps = {
  value: number | string | null | undefined;
  className?: string;
  emphasis?: boolean;
  currency?: CurrencyDetails | null;
  /** Prefixed currency symbol (؋ / $). Default false for cleaner statements. */
  showSymbol?: boolean;
  /** Trailing currency code (AFN / USD). Default true. */
  showCode?: boolean;
  /** Hide zero as em dash. */
  dashZero?: boolean;
};

/** Professional statement amount: `12,345.00 AFN` */
export function StatementAmount({
  value,
  className,
  emphasis = false,
  currency,
  showSymbol = false,
  showCode = true,
  dashZero = false,
}: StatementAmountProps) {
  const num = Number(value);
  const finite = Number.isFinite(num);
  if (dashZero && finite && num === 0) {
    return (
      <span className={cn('tabular-nums text-muted-foreground', className)}>—</span>
    );
  }

  const formatted = finite
    ? Math.abs(num).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })
    : '0.00';
  const negative = finite && num < 0;
  const code = currency?.code || FALLBACK_BASE_CODE;
  const symbol = currency?.symbol || FALLBACK_BASE_SYMBOL;

  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1.5 tabular-nums whitespace-nowrap',
        emphasis ? 'font-semibold' : 'font-medium',
        negative && 'text-red-600',
        className,
      )}
    >
      <span>
        {negative ? '(' : ''}
        {showSymbol ? `${symbol}` : ''}
        {formatted}
        {negative ? ')' : ''}
      </span>
      {showCode && (
        <span className="text-[11px] font-normal tracking-wide text-muted-foreground">
          {code}
        </span>
      )}
    </span>
  );
}

export function BaseCurrencyHint({
  currency,
  className,
}: {
  currency?: CurrencyDetails | null;
  className?: string;
}) {
  const code = currency?.code || FALLBACK_BASE_CODE;
  return (
    <span className={cn('text-xs text-muted-foreground', className)}>{code}</span>
  );
}
