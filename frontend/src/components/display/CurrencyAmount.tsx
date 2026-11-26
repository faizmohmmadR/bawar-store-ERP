import { CurrencyDetails, formatCurrencyAmount, getCurrencyCode, getCurrencySymbol } from '@/lib/currencies';
import { formatDisplayMoney } from '@/lib/displayMoney';
import { cn } from '@/lib/utils';

type CurrencyAmountProps = {
  amount: number | string | null | undefined;
  currency?: CurrencyDetails | null;
  showCode?: boolean;
  /** @deprecated Display decimals follow currency rules (AFN whole, USD 1dp). */
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
  decimals,
  prefixSign,
  className,
  codeClassName,
  layout = 'inline',
}: CurrencyAmountProps) {
  void decimals;
  const code = getCurrencyCode(currency);
  const formatted = formatDisplayMoney(amount, code);
  const symbol = getCurrencySymbol(currency);

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
        {formatCurrencyAmount(amount, currency, { showCode: true, prefixSign })}
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
