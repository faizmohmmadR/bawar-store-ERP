import type { ReactNode } from 'react';
import { formatNumber, formatReportMoney } from '@/lib/formatNumber';
import { cn } from '@/lib/utils';

/** Isolate numbers and currency codes from surrounding RTL labels. */
export function ReportAmount({
  value,
  currency,
  className,
}: {
  value: number;
  currency?: string;
  className?: string;
}) {
  return (
    <bdi
      dir="ltr"
      className={cn(
        'inline-flex max-w-full flex-wrap items-baseline gap-x-1.5 tabular-nums',
        className,
      )}
    >
      <span className="[overflow-wrap:anywhere]">{formatNumber(value || 0)}</span>
      {currency ? (
        <bdi className="text-[0.7em] font-medium text-muted-foreground">{currency}</bdi>
      ) : null}
    </bdi>
  );
}

/** Section-report money: AFN whole (ceil) / foreign 1dp, always LTR for fa/ps tables. */
export function ReportMoney({
  value,
  code,
  currency,
  className,
}: {
  value: number;
  code?: string;
  currency?: string;
  className?: string;
}) {
  const moneyCode = code || currency || 'AFN';
  return (
    <span
      dir="ltr"
      className={cn('inline-block tabular-nums whitespace-nowrap', className)}
    >
      {formatReportMoney(value, moneyCode)} {moneyCode}
    </span>
  );
}

/** Currency code + optional name without RTL glue (AFNAfghan → AFN Afghan). */
export function ReportCurrencyLabel({
  code,
  name,
  className,
}: {
  code: string;
  name?: string;
  className?: string;
}) {
  return (
    <span
      dir="ltr"
      className={cn(
        'inline-flex items-baseline gap-1.5 whitespace-nowrap',
        className,
      )}
    >
      <span className="font-medium">{code}</span>
      {name ? (
        <span className="text-xs text-muted-foreground font-normal">{name}</span>
      ) : null}
    </span>
  );
}

/** Plain number cell that stays LTR in fa/ps. */
export function ReportNumber({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <span dir="ltr" className={cn('inline-block tabular-nums', className)}>
      {formatNumber(value)}
    </span>
  );
}

/** Table header that does not wrap over the wrong column in RTL. */
export function ReportTh({
  children,
  className,
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <th
      colSpan={colSpan}
      className={cn('py-2 text-start font-medium whitespace-nowrap', className)}
    >
      {children}
    </th>
  );
}
