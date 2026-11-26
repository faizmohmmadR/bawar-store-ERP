import { getStoredCalendarSystem } from '@/contexts/CalendarPreferenceContext';
import type { Language } from '@/i18n';
import type { CalendarSystem } from '@/contexts/CalendarPreferenceContext';
import { formatAppDate, formatAppDateTime } from '@/lib/calendarDate';

export function formatJournalDate(
  value: string,
  language: Language,
  options: Intl.DateTimeFormatOptions & { calendar?: CalendarSystem } = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  },
): string {
  if (!value) return '—';
  const calendar = options.calendar ?? getStoredCalendarSystem();
  const { calendar: _c, ...intlOptions } = options;
  const hasTime =
    intlOptions.hour !== undefined ||
    intlOptions.minute !== undefined ||
    intlOptions.second !== undefined;

  if (hasTime) {
    return formatAppDateTime(value, calendar, language);
  }
  return formatAppDate(value, calendar, { language });
}

const SOURCE_MODEL_KEYS: Record<string, string> = {
  sales: 'accounts.sources.sales',
  sale: 'accounts.sources.sales',
  purchase: 'accounts.sources.purchase',
  purchases: 'accounts.sources.purchase',
  return: 'accounts.sources.returns',
  returns: 'accounts.sources.returns',
  expense: 'accounts.sources.expense',
  expenses: 'accounts.sources.expense',
  payroll: 'accounts.sources.payroll',
  loan: 'accounts.sources.loan',
  loans: 'accounts.sources.loan',
  payment: 'accounts.sources.payment',
  payments: 'accounts.sources.payment',
  loanpayment: 'accounts.sources.loanPayment',
  stock: 'accounts.sources.stock',
  equipment: 'accounts.sources.equipment',
};

export function journalSourceLabel(
  source: string | null | undefined,
  t: (key: string, defaultValue?: string) => string,
): string {
  if (!source) return t('accounts.manualEntry');
  const key = SOURCE_MODEL_KEYS[source.toLowerCase()];
  return key ? t(key) : source;
}

const GL_CATEGORY_KEYS: Record<string, string> = {
  asset: 'accounts.glCategories.asset',
  liability: 'accounts.glCategories.liability',
  equity: 'accounts.glCategories.equity',
  revenue: 'accounts.glCategories.revenue',
  expense: 'accounts.glCategories.expense',
};

/** Soft badge colors for CoA categories (readable on light UI, no purple). */
const GL_CATEGORY_BADGE_CLASS: Record<string, string> = {
  asset: 'border-sky-200 bg-sky-50 text-sky-900',
  liability: 'border-amber-200 bg-amber-50 text-amber-950',
  equity: 'border-slate-200 bg-slate-100 text-slate-800',
  revenue: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  expense: 'border-rose-200 bg-rose-50 text-rose-900',
};

export function glCategoryLabel(
  category: string | null | undefined,
  t: (key: string, defaultValue?: string) => string,
): string {
  if (!category) return '—';
  const key = GL_CATEGORY_KEYS[category.toLowerCase()];
  return key ? t(key) : category;
}

export function glCategoryBadgeClass(category: string | null | undefined): string {
  if (!category) return 'border-border bg-muted/40 text-muted-foreground';
  return (
    GL_CATEGORY_BADGE_CLASS[category.toLowerCase()]
    || 'border-border bg-muted/40 text-muted-foreground'
  );
}
