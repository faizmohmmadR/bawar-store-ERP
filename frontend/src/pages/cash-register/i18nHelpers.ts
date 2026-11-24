/** Localize cash-register category / posting / session status codes. */

type Translate = (
  key: string,
  defaultValue?: string | Record<string, string | number>,
) => string;

export function cashCategoryLabel(t: Translate, category: string | null | undefined): string {
  if (!category) return '—';
  return t(`cashRegister.categories.${category}`, category);
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
