import { cn } from '@/lib/utils';
import type { CurrencyDetails } from '@/lib/currencies';
import { EmployeeMoney } from '@/components/payroll/EmployeeMoney';

/** Signed payroll balance: + owed to employee, − overpaid. */
export function EmployeeBalance({
  amount,
  currency,
  className,
  decimals = 2,
}: {
  amount: number | string | null | undefined;
  currency?: CurrencyDetails | null;
  className?: string;
  decimals?: number;
}) {
  const value = Number(amount);
  const signed = Number.isFinite(value) ? value : 0;
  const tone =
    signed > 0
      ? 'text-amber-700 dark:text-amber-400'
      : signed < 0
        ? 'text-emerald-700 dark:text-emerald-400'
        : 'text-muted-foreground';

  return (
    <span className={cn('inline-flex items-baseline gap-0.5', tone, className)}>
      {signed > 0 ? <span aria-hidden="true">+</span> : null}
      <EmployeeMoney amount={signed} currency={currency} decimals={decimals} className={tone} />
    </span>
  );
}
