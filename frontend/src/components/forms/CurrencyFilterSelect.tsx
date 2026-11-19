import { useMemo } from 'react';
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
import { STATIC_CURRENCIES } from '@/components/forms/CurrencySelect';

type CurrencyFilterSelectProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  /** Restrict to these codes. Defaults to all supported currencies. */
  allowedCodes?: string[];
};

/** Static currency filter for list pages (includes "All" option). */
export function CurrencyFilterSelect({
  value,
  onChange,
  label,
  placeholder,
  className,
  allowedCodes,
}: CurrencyFilterSelectProps) {
  const { t } = useLanguage();

  const options = useMemo(
    () =>
      allowedCodes
        ? STATIC_CURRENCIES.filter((c) => allowedCodes.includes(c.code))
        : STATIC_CURRENCIES,
    [allowedCodes],
  );

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <Label className="text-sm font-medium">{label}</Label>}
      <Select value={value || 'all'} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder || t('accounts.selectCurrency')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('common.all', 'All')}</SelectItem>
          {options.map((c) => (
            <SelectItem key={c.id} value={c.id.toString()}>
              {c.code} — {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default CurrencyFilterSelect;
