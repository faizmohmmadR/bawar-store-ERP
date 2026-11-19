import { useNavigate } from 'react-router-dom';
import { ArrowRightLeft, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { getStaticCurrencyById } from '@/components/forms/CurrencySelect';
import { FALLBACK_BASE_CODE, FALLBACK_BASE_SYMBOL, type CurrencyDetails } from '@/lib/currencies';
import { formatJournalDate, glCategoryLabel, journalSourceLabel } from '@/lib/journalLabels';
import { cn } from '@/lib/utils';

export type JournalLineRow = {
  id: number;
  debit?: string | number;
  credit?: string | number;
  debit_amount?: string | number;
  credit_amount?: string | number;
  base_debit?: string | number | null;
  base_credit?: string | number | null;
  exchange_rate?: string | number | null;
  currency?: number | null;
  currency_code?: string | null;
  currency_details?: CurrencyDetails | null;
  description?: string | null;
  line_description?: string | null;
  notes?: string | null;
  gl_account_details?: {
    code: string;
    name: string;
    category?: string;
    currency?: number | null;
    currency_details?: CurrencyDetails | null;
  };
  gl_account_code?: string;
  gl_account_name?: string;
  gl_account_category?: string;
};

export type JournalEntryWithLines = {
  id: number;
  entry_date: string;
  reference_number?: string | null;
  description?: string | null;
  journal_description?: string | null;
  is_auto: boolean;
  source_model?: string | null;
  total_debit: string | number;
  total_credit: string | number;
  total_base_debit?: string | number;
  total_base_credit?: string | number;
  native_currency?: CurrencyDetails | null;
  is_mixed_currency?: boolean;
  lines?: JournalLineRow[];
};

function lineDebit(line: JournalLineRow) {
  return Number(line.debit ?? line.debit_amount ?? 0);
}

function lineCredit(line: JournalLineRow) {
  return Number(line.credit ?? line.credit_amount ?? 0);
}

function lineBaseDebit(line: JournalLineRow) {
  return Number(line.base_debit ?? 0);
}

function lineBaseCredit(line: JournalLineRow) {
  return Number(line.base_credit ?? 0);
}

function resolveLineCurrency(line: JournalLineRow): CurrencyDetails {
  if (line.currency_details?.code) return line.currency_details;
  if (line.currency_code) {
    return {
      code: line.currency_code,
      symbol: getStaticCurrencyById(line.currency)?.symbol || '',
      id: line.currency ?? undefined,
    };
  }
  if (line.currency != null) {
    const staticCur = getStaticCurrencyById(line.currency);
    if (staticCur) {
      return {
        id: staticCur.id,
        code: staticCur.code,
        symbol: staticCur.symbol,
        name: staticCur.name,
      };
    }
  }
  return { code: FALLBACK_BASE_CODE, symbol: FALLBACK_BASE_SYMBOL, id: 1 };
}

function glCode(line: JournalLineRow) {
  return line.gl_account_details?.code || line.gl_account_code || '—';
}

function glName(line: JournalLineRow) {
  return line.gl_account_details?.name || line.gl_account_name || '';
}

function glCategory(line: JournalLineRow) {
  return line.gl_account_details?.category || line.gl_account_category;
}

function formatAmount(
  value: number,
  language: string,
  currency?: CurrencyDetails | null,
  opts?: { showCode?: boolean },
) {
  if (!(value > 0)) return '—';
  const formatted = value.toLocaleString(language === 'fa' ? 'fa-AF' : 'en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const code = currency?.code || '';
  if (opts?.showCode && code) return `${formatted} ${code}`;
  const symbol = currency?.symbol || '';
  return symbol ? `${symbol}${formatted}` : formatted;
}

function formatRate(value: number, language: string) {
  if (!(value > 0)) return '—';
  return value.toLocaleString(language === 'fa' ? 'fa-AF' : 'en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

function JournalLineMobileRow({
  line,
  language,
  t,
  showAfnColumns,
  showAccountType,
  compact,
}: {
  line: JournalLineRow;
  language: string;
  t: (key: string, fallback?: string) => string;
  showAfnColumns: boolean;
  showAccountType?: boolean;
  compact?: boolean;
}) {
  const currency = resolveLineCurrency(line);
  const debit = lineDebit(line);
  const credit = lineCredit(line);
  const amount =
    debit > 0
      ? formatAmount(debit, language, currency, { showCode: true })
      : formatAmount(credit, language, currency, { showCode: true });
  const amountClass = debit > 0 ? 'text-primary' : 'text-red-600';
  const typeLabel = glCategoryLabel(glCategory(line), t);

  if (compact) {
    return (
      <div className="flex items-center gap-2 border-b border-border/40 px-1 py-1.5 last:border-0">
        <span className="w-14 shrink-0 font-mono text-[11px] font-semibold">{glCode(line)}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{glName(line)}</span>
        {showAccountType ? (
          <span className="hidden shrink-0 truncate max-w-[72px] text-[10px] text-muted-foreground sm:inline">
            {typeLabel}
          </span>
        ) : null}
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {currency.code || FALLBACK_BASE_CODE}
        </span>
        <span className={cn('shrink-0 text-[11px] font-semibold tabular-nums', amountClass)}>{amount}</span>
        {showAfnColumns ? (
          <span className="hidden shrink-0 text-[10px] tabular-nums text-muted-foreground sm:inline">
            {formatAmount(lineBaseDebit(line) || lineBaseCredit(line), language, {
              code: FALLBACK_BASE_CODE,
            }, { showCode: true })}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/70 bg-background p-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <span className="shrink-0 font-mono text-xs font-semibold">{glCode(line)}</span>
          <span className="truncate text-xs text-muted-foreground">{glName(line)}</span>
          {showAccountType ? (
            <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px] font-normal">
              {typeLabel}
            </Badge>
          ) : null}
          <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px] font-normal">
            {currency.code || FALLBACK_BASE_CODE}
          </Badge>
        </div>
        <span className={cn('shrink-0 text-xs font-semibold tabular-nums', amountClass)}>{amount}</span>
      </div>
      {showAfnColumns ? (
        <p className="mt-1 truncate text-[10px] tabular-nums text-muted-foreground">
          {t('accounts.afnEquivalentReporting', 'AFN reporting')}:{' '}
          {formatAmount(lineBaseDebit(line), language, { code: FALLBACK_BASE_CODE }, { showCode: true })}
          {' / '}
          {formatAmount(lineBaseCredit(line), language, { code: FALLBACK_BASE_CODE }, { showCode: true })}
        </p>
      ) : null}
    </div>
  );
}

interface JournalLinesTableProps {
  lines: JournalLineRow[];
  compact?: boolean;
  showAfnColumns?: boolean;
  showAccountType?: boolean;
}

export function JournalLinesTable({
  lines,
  compact,
  showAfnColumns = true,
  showAccountType = true,
}: JournalLinesTableProps) {
  const { t, language } = useLanguage();

  if (!lines.length) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">{t('accounts.noJournalLines')}</p>
    );
  }

  const headClass = cn(
    'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
    compact ? 'h-8' : 'h-10',
  );
  const cellClass = cn('align-middle', compact ? 'py-1.5 text-xs' : 'py-2.5 text-sm');

  return (
    <>
      <div className={cn('md:hidden', compact ? 'rounded-md border border-border/50 px-1.5' : 'space-y-2')}>
        {lines.map((line) => (
          <JournalLineMobileRow
            key={line.id}
            line={line}
            language={language}
            t={t}
            showAfnColumns={showAfnColumns}
            showAccountType={showAccountType}
            compact={compact}
          />
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <Table className="w-full min-w-[780px]">
          <TableHeader>
            <TableRow className="border-b border-border/80 bg-muted/30 hover:bg-muted/30">
              <TableHead className={cn(headClass, 'w-[24%] ps-3')}>
                {t('accounts.glAccount')}
              </TableHead>
              {showAccountType ? (
                <TableHead className={cn(headClass, 'w-[12%]')}>
                  {t('accounts.accountType')}
                </TableHead>
              ) : null}
              <TableHead className={cn(headClass, 'w-[7%]')}>
                {t('accounts.currency')}
              </TableHead>
              <TableHead className={cn(headClass, 'w-[13%] text-start')}>
                {t('accounts.debit')}
              </TableHead>
              <TableHead className={cn(headClass, 'w-[13%] text-start')}>
                {t('accounts.credit')}
              </TableHead>
              <TableHead className={cn(headClass, 'w-[8%] text-start')}>
                {t('accounts.exchangeRate', 'Rate')}
              </TableHead>
              {showAfnColumns ? (
                <>
                  <TableHead className={cn(headClass, 'w-[11%] text-start')}>
                    {t('accounts.afnDebit', 'AFN Debit')}
                  </TableHead>
                  <TableHead className={cn(headClass, 'w-[11%] pe-3 text-start')}>
                    {t('accounts.afnCredit', 'AFN Credit')}
                  </TableHead>
                </>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => {
              const currency = resolveLineCurrency(line);
              const rate = Number(line.exchange_rate ?? 0);
              return (
                <TableRow
                  key={line.id}
                  className={cn(
                    'border-border/40',
                    index % 2 === 1 && 'bg-muted/10',
                    compact && 'h-9',
                  )}
                >
                  <TableCell className={cn(cellClass, 'ps-3')}>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="shrink-0 font-mono text-xs font-semibold">{glCode(line)}</span>
                      <span className="truncate text-muted-foreground">{glName(line)}</span>
                    </div>
                  </TableCell>
                  {showAccountType ? (
                    <TableCell className={cellClass}>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {glCategoryLabel(glCategory(line), t)}
                      </span>
                    </TableCell>
                  ) : null}
                  <TableCell className={cellClass}>
                    <span className="font-mono text-[11px] font-medium">
                      {currency.code || FALLBACK_BASE_CODE}
                    </span>
                  </TableCell>
                  <TableCell className={cn(cellClass, 'text-start font-medium tabular-nums text-primary')}>
                    {formatAmount(lineDebit(line), language, currency, { showCode: true })}
                  </TableCell>
                  <TableCell className={cn(cellClass, 'text-start font-medium tabular-nums text-red-600')}>
                    {formatAmount(lineCredit(line), language, currency, { showCode: true })}
                  </TableCell>
                  <TableCell className={cn(cellClass, 'text-start tabular-nums text-muted-foreground')}>
                    {formatRate(rate, language)}
                  </TableCell>
                  {showAfnColumns ? (
                    <>
                      <TableCell className={cn(cellClass, 'text-start tabular-nums text-muted-foreground')}>
                        {formatAmount(lineBaseDebit(line), language, {
                          code: FALLBACK_BASE_CODE,
                          symbol: FALLBACK_BASE_SYMBOL,
                        }, { showCode: true })}
                      </TableCell>
                      <TableCell className={cn(cellClass, 'pe-3 text-start tabular-nums text-muted-foreground')}>
                        {formatAmount(lineBaseCredit(line), language, {
                          code: FALLBACK_BASE_CODE,
                          symbol: FALLBACK_BASE_SYMBOL,
                        }, { showCode: true })}
                      </TableCell>
                    </>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

interface JournalEntriesWithLinesProps {
  entries: JournalEntryWithLines[];
  showExpandDefault?: boolean;
}

export function JournalEntriesWithLines({ entries }: JournalEntriesWithLinesProps) {
  const { t, language } = useLanguage();
  const { calendar } = useCalendarPreference();
  const navigate = useNavigate();

  if (!entries.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-10 text-center">
        <ArrowRightLeft className="mb-2 h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">{t('accounts.noJournalEntriesForSource')}</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/60">
      {entries.map((entry) => {
        const currency = entry.native_currency;
        const mixed = entry.is_mixed_currency || currency?.code === 'MIXED';
        const isAfnNative = !mixed && (currency?.code || FALLBACK_BASE_CODE) === FALLBACK_BASE_CODE;
        const afnDebit = formatAmount(Number(entry.total_base_debit || 0), language, {
          code: FALLBACK_BASE_CODE,
          symbol: FALLBACK_BASE_SYMBOL,
        }, { showCode: true });
        const afnCredit = formatAmount(Number(entry.total_base_credit || 0), language, {
          code: FALLBACK_BASE_CODE,
          symbol: FALLBACK_BASE_SYMBOL,
        }, { showCode: true });

        return (
          <article key={entry.id} className="bg-card">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4 sm:gap-3">
              <span className="font-mono text-sm font-bold tracking-tight">
                {entry.reference_number || `JE-${entry.id}`}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatJournalDate(entry.entry_date, language, { calendar })}
              </span>
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                {journalSourceLabel(entry.source_model, t)}
              </Badge>
              <Badge variant={entry.is_auto ? 'secondary' : 'default'} className="h-5 px-1.5 text-[10px] font-normal">
                {entry.is_auto ? t('accounts.autoEntry') : t('accounts.manualEntry')}
              </Badge>
              {!mixed ? (
                <Badge variant="secondary" className="h-5 px-1.5 font-mono text-[10px] font-normal">
                  {currency?.code || FALLBACK_BASE_CODE}
                </Badge>
              ) : (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
                  {t('accounts.mixedCurrencies', 'Mixed currencies')}
                </Badge>
              )}

              {(entry.description || entry.journal_description) ? (
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {entry.description || entry.journal_description}
                </span>
              ) : (
                <span className="flex-1" />
              )}

              <div className="ms-auto flex shrink-0 flex-wrap items-center gap-3">
                {!mixed ? (
                  <>
                    <span className="text-[11px] tabular-nums">
                      <span className="text-muted-foreground">{t('accounts.debit')}: </span>
                      <span className="font-semibold text-primary">
                        {formatAmount(Number(entry.total_debit || 0), language, currency, {
                          showCode: true,
                        })}
                      </span>
                    </span>
                    <span className="text-[11px] tabular-nums">
                      <span className="text-muted-foreground">{t('accounts.credit')}: </span>
                      <span className="font-semibold text-red-600">
                        {formatAmount(Number(entry.total_credit || 0), language, currency, {
                          showCode: true,
                        })}
                      </span>
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {afnDebit} / {afnCredit}
                  </span>
                )}
                {!isAfnNative && !mixed ? (
                  <span className="hidden text-[10px] tabular-nums text-muted-foreground lg:inline">
                    AFN {afnDebit} / {afnCredit}
                  </span>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => navigate(`/journal-entries/${entry.id}`)}
                >
                  <ExternalLink className="me-1 h-3 w-3" />
                  {t('common.view')}
                </Button>
              </div>
            </div>

            <div className="border-t border-border/50 bg-muted/5 px-1.5 pb-1.5 pt-0.5 sm:px-2">
              <JournalLinesTable lines={entry.lines || []} compact />
            </div>
          </article>
        );
      })}
    </div>
  );
}
