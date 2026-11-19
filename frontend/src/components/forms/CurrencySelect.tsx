import { useEffect, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import {
  orderFormHeaderError,
  orderFormHeaderField,
  orderFormHeaderLabel,
  orderFormHeaderControlClass,
} from '@/components/forms/orderFormStyles';

export type StaticCurrency = {
  id: number;
  code: string;
  name: string;
  symbol: string;
  is_base: boolean;
};

/** Supported currencies. AFN is the base. IDs match DB seed order. */
export const STATIC_CURRENCIES: StaticCurrency[] = [
  { id: 1, code: 'AFN', name: 'Afghan Afghani', symbol: '؋', is_base: true },
  { id: 2, code: 'USD', name: 'US Dollar', symbol: '$', is_base: false },
  { id: 3, code: 'KDR', name: 'Kandahari', symbol: 'ک', is_base: false },
];

/** Resolve a StaticCurrency by DB id string/number. */
export function getStaticCurrencyById(id: string | number | null | undefined): StaticCurrency | undefined {
  if (id === null || id === undefined || id === '') return undefined;
  // Try by numeric id first, then fall back to matching against real DB ids via API
  return STATIC_CURRENCIES.find((c) => c.id.toString() === id.toString());
}

/** Resolve symbol from a DB id. Falls back to ؋. */
export function resolveStaticSymbol(id: string | number | null | undefined): string {
  return getStaticCurrencyById(id)?.symbol ?? '؋';
}

type CurrencySelectProps = {
  value: string | number;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  placeholder?: string;
  error?: string;
  compact?: boolean;
  /** Restrict visible currencies to these codes. Defaults to all supported currencies. */
  allowedCodes?: string[];
  /** When true (default), auto-selects AFN if value is empty. */
  autoSelectBase?: boolean;
  // Legacy props kept for compatibility — ignored
  excludeBase?: boolean;
  excludeIds?: Array<string | number>;
  includeIds?: Array<string | number>;
};

export const CurrencySelect = ({
  value,
  onChange,
  label,
  required,
  disabled,
  className,
  triggerClassName,
  placeholder,
  error,
  compact = false,
  allowedCodes,
  autoSelectBase = true,
}: CurrencySelectProps) => {
  const { t } = useLanguage();

  const options = useMemo(
    () =>
      allowedCodes
        ? STATIC_CURRENCIES.filter((c) => allowedCodes.includes(c.code))
        : STATIC_CURRENCIES,
    [allowedCodes],
  );

  const afn = STATIC_CURRENCIES.find((c) => c.is_base)!;

  useEffect(() => {
    if (autoSelectBase && !value) {
      onChange(String(afn.id));
    }
  }, [autoSelectBase, value, afn.id, onChange]);

  return (
    <div className={cn(compact ? orderFormHeaderField : 'flex flex-col gap-1.5', className)}>
      {label && (
        <Label
          className={cn(
            compact
              ? orderFormHeaderLabel
              : 'text-sm font-medium text-foreground leading-snug',
          )}
        >
          {label}
          {required && (
            <span className={compact ? 'text-red-600' : 'text-destructive ms-0.5'}>*</span>
          )}
        </Label>
      )}
      <Select value={value?.toString() || ''} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          className={cn(
            compact ? orderFormHeaderControlClass(error) : undefined,
            !compact && error && 'border-destructive',
            triggerClassName,
          )}
        >
          <SelectValue placeholder={placeholder || t('accounts.selectCurrency')} />
        </SelectTrigger>
        <SelectContent>
          {options.map((c) => (
            <SelectItem key={c.id} value={c.id.toString()}>
              {c.code} — {c.name}
              {c.is_base ? ` — ${t('settings.currencies.baseCurrency', 'Base')}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p className={cn(compact ? orderFormHeaderError : 'text-sm text-destructive leading-snug')}>
          {error}
        </p>
      )}
    </div>
  );
};

export default CurrencySelect;
