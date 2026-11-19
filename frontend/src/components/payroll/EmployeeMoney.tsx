import { cn } from '@/lib/utils';
import type { CurrencyDetails } from '@/lib/currencies';

export function EmployeeMoney({ amount, currency, decimals = 2, className }: {
  amount: number | string;
  currency?: CurrencyDetails | null;
  decimals?: number;
  className?: string;
}) {
  const value = Number(amount);
  return <span dir="ltr" className={cn('inline-flex max-w-full flex-wrap items-baseline gap-x-1.5 tabular-nums', className)}>
    <span className="min-w-0 break-all">{Number.isFinite(value)
      ? value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals }) : '—'}</span>
    <span className="text-xs font-normal text-muted-foreground">{currency?.code || 'AFN'}</span>
  </span>;
}
