import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type FormSelectOption = {
  value: string;
  label: string;
  description?: string;
};

type FormSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: FormSelectOption[];
  placeholder?: string;
  disabled?: boolean;
};

export function FormSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: FormSelectProps) {
  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-10 w-full bg-background">
        <SelectValue placeholder={placeholder}>{selected?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} textValue={option.label}>
            {option.description ? (
              <span className="flex flex-col items-start gap-0.5 py-0.5">
                <span className="leading-snug">{option.label}</span>
                <span className="text-xs font-normal leading-snug text-muted-foreground">
                  {option.description}
                </span>
              </span>
            ) : (
              option.label
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
