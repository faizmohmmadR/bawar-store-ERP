import { formatListFinanceLine, listAmountClass } from '@/lib/listTableFormat';
import { cn } from '@/lib/utils';

type FinanceBucket = {
  total_debit: number;
  total_credit: number;
  balance: number;
  currency?: string;
};

export function ListFinanceCell({
  finance,
  field,
  className,
}: {
  finance?: Record<string, FinanceBucket> | null;
  field: 'total_debit' | 'total_credit' | 'balance';
  className?: string;
}) {
  return (
    <span className={cn(listAmountClass, className)}>
      {formatListFinanceLine(finance, field)}
    </span>
  );
}
