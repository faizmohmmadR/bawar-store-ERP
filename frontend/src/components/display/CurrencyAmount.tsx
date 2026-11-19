import { CurrencyDetails, formatCurrencyAmount, getCurrencyCode, getCurrencySymbol } from '@/lib/currencies';
import { cn } from '@/lib/utils';

type CurrencyAmountProps = {
  amount: number | string | null | undefined;
  currency?: CurrencyDetails | null;
  showCode?: boolean;
  decimals?: number;
  prefixSign?: '+' | '-';
  className?: string;
  codeClassName?: string;
  layout?: 'inline' | 'stacked';
};

export function CurrencyAmount({
  amount,
  currency,
  showCode = false,
  decimals = 2,
  prefixSign,
  className,
  codeClassName,
  layout = 'inline',
}: CurrencyAmountProps) {
  const value = Number(amount);
  const formatted = Number.isFinite(value) ? value.toFixed(decimals) : (0).toFixed(decimals);
  const symbol = getCurrencySymbol(currency);
  const code = getCurrencyCode(currency);

  if (layout === 'stacked') {
    return (
      <span className={cn('text-sm font-semibold tabular-nums whitespace-nowrap', className)}>
        {prefixSign}
        {symbol}
        {formatted}
        {code ? (
          <span className={cn('text-muted-foreground font-normal ms-1', codeClassName)}>{code}</span>
        ) : null}
      </span>
    );
  }

  if (showCode) {
    return (
      <span className={className}>
        {formatCurrencyAmount(amount, currency, { showCode: true, decimals, prefixSign })}
      </span>
    );
  }

  return (
    <span className={className}>
      {prefixSign}
      {symbol}
      {formatted}
    </span>
  );
}

export default CurrencyAmount;
