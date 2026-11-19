import { forwardRef, useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { convertMass } from '@/lib/massUnits';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';

type MassInputProps = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'min' | 'step'> & {
  value: string | number | null | undefined;
  onChange: (kilograms: string) => void;
};

/** Entry in kg or grams; the parent always receives canonical kilograms. */
export const MassInput = forwardRef<HTMLInputElement, MassInputProps>(({ value, onChange, disabled, ...props }, ref) => {
  const { t } = useLanguage();
  const [unit, setUnit] = useState('kg');
  const amount = value == null || value === '' ? '' : convertMass(String(value), 'kg', unit as 'kg' | 'g');
  return <div className="relative" dir="ltr">
    <Input {...props} ref={ref} type="number" value={amount} disabled={disabled}
      min="0" step={unit === 'g' ? '0.1' : '0.0001'} className="pr-16" placeholder="0"
      onChange={(event) => {
        const raw = event.target.value;
        onChange(raw === '.' ? '0' : convertMass(raw, unit as 'kg' | 'g', 'kg'));
      }} />
    <Select value={unit} onValueChange={setUnit} disabled={disabled}>
      <SelectTrigger aria-label={t('rawMaterials.unit')} className="absolute right-0 top-0 h-10 w-16 rounded-l-none border-y-0 border-r-0 bg-transparent px-2 shadow-none focus:ring-inset"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="kg">kg</SelectItem><SelectItem value="g">gr</SelectItem></SelectContent>
    </Select>
  </div>;
});
MassInput.displayName = 'MassInput';
