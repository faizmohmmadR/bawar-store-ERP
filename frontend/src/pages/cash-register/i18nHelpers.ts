/** Localize cash-register category / posting / session status codes. */

type Translate = (
  key: string,
  defaultValue?: string | Record<string, string | number>,
) => string;

/** Income categories → green; outcome → rose; opening/neutral → slate. */
const CASH_CATEGORY_BADGE_CLASS: Record<string, string> = {
  cash_sale: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  customer_debt_collection: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  other_receipt: 'border-teal-200 bg-teal-50 text-teal-900',
  owner_capital: 'border-sky-200 bg-sky-50 text-sky-900',
  cash_overage: 'border-lime-200 bg-lime-50 text-lime-900',
  initial_cash: 'border-slate-200 bg-slate-100 text-slate-800',
  business_expense: 'border-rose-200 bg-rose-50 text-rose-900',
  supplier_payment: 'border-orange-200 bg-orange-50 text-orange-950',
  cash_purchase: 'border-orange-200 bg-orange-50 text-orange-950',
  owner_withdrawal: 'border-amber-200 bg-amber-50 text-amber-950',
  customer_refund: 'border-rose-200 bg-rose-50 text-rose-900',
  bank_deposit: 'border-blue-200 bg-blue-50 text-blue-900',
  other_payment: 'border-rose-200 bg-rose-50 text-rose-900',
  cash_shortage: 'border-rose-300 bg-rose-100 text-rose-950',
  session_removal: 'border-stone-200 bg-stone-100 text-stone-800',
};

export function cashCategoryLabel(t: Translate, category: string | null | undefined): string {
  if (!category) return '—';
  return t(`cashRegister.categories.${category}`, category);
}

export function cashCategoryBadgeClass(category: string | null | undefined): string {
  if (!category) return 'border-border bg-muted/40 text-muted-foreground';
  return (
    CASH_CATEGORY_BADGE_CLASS[category]
    || 'border-border bg-muted/40 text-muted-foreground'
  );
}

export function cashPostingLabel(t: Translate, status: string | null | undefined): string {
  if (!status) return '—';
  return t(`cashRegister.postingStatus.${status}`, status);
}

export function cashSessionStatusLabel(t: Translate, status: string | null | undefined): string {
  if (status === 'open') return t('cashRegister.statusOpen');
  if (status === 'closed') return t('cashRegister.statusClosed');
  return status || '—';
}
