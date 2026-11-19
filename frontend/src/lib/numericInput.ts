/** Arabic-Indic digits ٠-٩ */
const ARABIC_DIGIT_RE = /[\u0660-\u0669]/g;
/** Persian digits ۰-۹ */
const PERSIAN_DIGIT_RE = /[\u06F0-\u06F9]/g;

/** Convert locale digits and separators to Western digits for form entry. */
export function normalizeWesternDigits(value: string): string {
  const normalized = value
    .replace(ARABIC_DIGIT_RE, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(PERSIAN_DIGIT_RE, (ch) => String(ch.charCodeAt(0) - 0x06f0))
    .replace(/\u066b/g, '.')
    .replace(/\u066c/g, '')
    .replace(/[\u200e\u200f\u061c]/g, '');
  return normalized.includes('.') || (normalized.match(/,/g)?.length ?? 0) > 1
    ? normalized.replace(/,/g, '')
    : normalized.replace(/,/g, '.');
}

export function getNumericInputMode(step?: string | number): 'decimal' | 'numeric' {
  if (step === undefined || step === null || step === '' || step === 'any') {
    return 'decimal';
  }
  return String(step).includes('.') ? 'decimal' : 'numeric';
}

/** Preserve decimal drafts when a parent converts each keystroke to a number. */
export function numericDraftMatches(value: unknown, draft: string): boolean {
  const normalized = normalizeWesternDigits(String(value ?? ''));
  if (normalized === draft) return true;
  const draftNumber = ['', '-', '.', '-.'].includes(draft) ? 0 : Number(draft);
  // Some forms render zero as ''; keep drafts like '0.' and '0.00' visible.
  return Number.isFinite(draftNumber) && Number(normalized) === draftNumber;
}
