import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { StatementAmount } from '@/components/accounting/StatementAmount';
import { useLanguage } from '@/contexts/LanguageContext';
import type { CurrencyDetails } from '@/lib/currencies';
import { cn } from '@/lib/utils';

type ReportStatementFrameProps = {
  title: string;
  modeLabel: string;
  currency?: CurrencyDetails | null;
  isBalanced?: boolean | null;
  expectsBalance?: boolean | null;
  showBalanceStatus?: boolean;
  balanceNote?: string | null;
  difference?: number | string | null;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
};

export function reportModeLabel(
  data: {
    mode?: string;
    amount_kind?: string;
  },
  t: (key: string, fallback?: string) => string,
  currency?: CurrencyDetails | null,
) {
  if (data.mode === 'base' || data.amount_kind === 'afn_equivalent') {
    return t('accounts.afnReportingShort', 'AFN Reporting');
  }
  const code = currency?.code;
  return code
    ? `${t('accounts.nativeBooksShort', 'Native Books')} · ${code}`
    : t('accounts.nativeBooksShort', 'Native Books');
}

export function ReportStatementFrame({
  title,
  modeLabel,
  currency,
  isBalanced = null,
  expectsBalance = true,
  showBalanceStatus = false,
  balanceNote = null,
  difference = null,
  children,
  className,
  footer,
}: ReportStatementFrameProps) {
  const { t } = useLanguage();
  const requireBalance = expectsBalance !== false;
  const showAsError = isBalanced === false && requireBalance;
  const showAsInfo = isBalanced === false && !requireBalance;

  return (
    <Card className={cn('overflow-hidden border shadow-sm', className)}>
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <p className="text-sm text-muted-foreground">
              {modeLabel}
              {currency?.code ? (
                <span className="text-muted-foreground/80">
                  {' '}
                  · {t('accounts.amountsIn', 'Amounts in')} {currency.code}
                </span>
              ) : null}
            </p>
          </div>

          {showBalanceStatus && isBalanced != null && (
            <div
              className={cn(
                'inline-flex items-center gap-1.5 self-start rounded-full border px-3 py-1 text-xs font-medium sm:self-center',
                isBalanced
                  ? 'border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : showAsInfo
                    ? 'border-amber-600/30 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                    : 'border-red-600/30 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300',
              )}
            >
              {isBalanced ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : showAsInfo ? (
                <AlertTriangle className="h-3.5 w-3.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              {isBalanced
                ? t('accounts.balanced')
                : showAsInfo
                  ? t('accounts.nativePartial', 'Native view (partial)')
                  : t('accounts.notBalanced')}
            </div>
          )}
        </div>

        {balanceNote && (showAsError || showAsInfo) && (
          <div
            className={cn(
              'flex gap-2.5 border-b px-5 py-3 text-xs leading-relaxed',
              showAsInfo
                ? 'border-amber-200/70 bg-amber-50/80 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100'
                : 'border-amber-200/70 bg-amber-50/80 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100',
            )}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="space-y-1">
              <p>{balanceNote}</p>
              {difference != null && requireBalance && (
                <p className="font-medium">
                  {t('accounts.difference', 'Difference')}:{' '}
                  <StatementAmount value={difference} currency={currency} className="inline" />
                </p>
              )}
            </div>
          </div>
        )}

        {children}
        {footer}
      </CardContent>
    </Card>
  );
}

export function StatementSectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="border-b bg-muted/35 px-5 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
      {children}
    </div>
  );
}

export function StatementLineRow({
  code,
  name,
  amount,
  currency,
  muted,
}: {
  code?: string;
  name: string;
  amount: number | string | null | undefined;
  currency?: CurrencyDetails | null;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border/40 px-5 py-2.5',
        muted && 'text-muted-foreground',
      )}
    >
      <div className="min-w-0 truncate">
        {code ? (
          <span className="me-2 font-mono text-[11px] text-muted-foreground">{code}</span>
        ) : null}
        <span className="text-sm">{name}</span>
      </div>
      <StatementAmount value={amount} currency={currency} dashZero />
    </div>
  );
}

export function StatementTotalRow({
  label,
  amount,
  currency,
  emphasis = false,
  tone,
}: {
  label: string;
  amount: number | string | null | undefined;
  currency?: CurrencyDetails | null;
  emphasis?: boolean;
  tone?: 'default' | 'primary' | 'danger' | 'muted';
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3',
        emphasis ? 'border-t bg-muted/25' : 'bg-muted/10',
      )}
    >
      <span className={cn('text-sm', emphasis ? 'font-semibold' : 'font-medium')}>{label}</span>
      <StatementAmount
        value={amount}
        currency={currency}
        emphasis={emphasis}
        className={cn(
          tone === 'primary' && 'text-primary',
          tone === 'danger' && 'text-red-600',
          tone === 'muted' && 'text-muted-foreground',
        )}
      />
    </div>
  );
}
