import { normalizeWesternDigits } from './numericInput';

/** Shift the decimal point exactly; never round an entered weight silently. */
export function convertMass(value: string, from: 'kg' | 'g', to: 'kg' | 'g'): string {
  const normalized = normalizeWesternDigits(value);
  if (!normalized || from === to) return normalized;
  if (normalized === '.') return '0';
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(normalized);
  if (!match || (!match[2] && !match[3])) return normalized;
  const sign = match[1];
  const whole = match[2] || '0';
  const fraction = match[3] || '';
  const digits = from === 'g' ? whole.padStart(4, '0') + fraction : whole + fraction.padEnd(3, '0');
  const point = from === 'g' ? Math.max(whole.length, 4) - 3 : whole.length + 3;
  const integer = digits.slice(0, point).replace(/^0+(?=\d)/, '') || '0';
  const decimal = digits.slice(point).replace(/0+$/, '');
  return `${sign}${integer}${decimal ? `.${decimal}` : ''}`;
}
