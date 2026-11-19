import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLanguage } from '@/contexts/LanguageContext';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';
import type { PackingComponentStockOption } from '@/types/packing';

type Props = {
  id?: string;
  value: string;
  options: PackingComponentStockOption[];
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  clearable?: boolean;
  category?: string;
  /** Shown inside the field (e.g. fixed unit badge). */
  fieldSuffix?: string;
  /** Hide available-quantity text/badge (used by Damaged). */
  hideAvailable?: boolean;
};

export function CategoryMaterialPicker({ id, value, options, onChange, placeholder, disabled, clearable, category = 'all', fieldSuffix, hideAvailable = false }: Props) {
  const { t, direction } = useLanguage();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.find((option) => String(option.raw_material) === value);
  const query = search.trim().toLocaleLowerCase();
  const materials = options.filter((option) => (
    category === 'all' || (category === 'uncategorized' ? option.category == null : String(option.category) === category)
  ) && `${option.raw_material_name} ${option.category_name || ''}`.toLocaleLowerCase().includes(query));
  const availableAmount = (option: PackingComponentStockOption) => `${t('packing.availableShort')}: ${Number(option.available_quantity).toLocaleString()} ${option.unit === 'piece' ? t('rawMaterials.unitPiece', 'Piece') : option.unit}`;
  const details = (option: PackingComponentStockOption, includeAvailable = true) => [
    includeAvailable && !hideAvailable ? availableAmount(option) : null,
    `${t('stock.weightedAverageUnitCost')}: ${resolveCurrencySymbol(1)}${Number(option.unit_cost_afn || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })}/${option.unit}`,
    option.capacity_liters ? `${option.capacity_liters} L` : option.capacity_kg ? `${option.capacity_kg} kg` : null,
    option.bottles_per_carton ? `${option.bottles_per_carton} / ${t('packing.component_carton')}` : null,
    option.bottles_per_plastic ? `${option.bottles_per_plastic} / ${t('packing.component_plastic')}` : null,
  ].filter(Boolean).join(' · ');
  const selectedLabel = selected
    ? `${selected.raw_material_name}${details(selected, false) ? ` · ${details(selected, false)}` : ''}`
    : placeholder;
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setSearch(''); }}>
    <PopoverTrigger asChild><Button id={id} type="button" variant="outline" disabled={disabled}
      className="h-10 w-full justify-between gap-2 px-3 text-start font-normal" aria-label={selectedLabel} title={selected ? `${selected.raw_material_name} · ${details(selected)}` : placeholder}>
      <span className="min-w-0 flex-1 truncate">{selected ? <><span className="font-medium">{selected.raw_material_name}</span><span className="text-xs text-muted-foreground"> · {details(selected, false)}</span></> : placeholder}</span>
      {fieldSuffix && <span className="shrink-0 whitespace-nowrap rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{fieldSuffix}</span>}
      {!hideAvailable && selected && <span className="shrink-0 whitespace-nowrap rounded bg-muted px-2 py-1 text-xs font-medium tabular-nums text-foreground">{availableAmount(selected)}</span>}
      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
    </Button></PopoverTrigger>
    <PopoverContent align="start" collisionPadding={12} className="w-[var(--radix-popover-trigger-width)] min-w-64 max-w-[calc(100vw-2rem)] max-h-[var(--radix-popover-content-available-height)] overflow-hidden p-2" dir={direction}>
      <div className="mb-2 space-y-2">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('common.search')} className="h-9" />
      </div>
      <div className="max-h-[min(16rem,calc(var(--radix-popover-content-available-height)-6.5rem))] overflow-y-auto overscroll-contain touch-pan-y">
        {clearable && <Button type="button" variant="ghost" className="w-full justify-start" onClick={() => { onChange(''); setOpen(false); }}>{t('common.none', 'None')}</Button>}
        {materials.length ? materials.map((option) => <Button key={option.raw_material} type="button" variant="ghost"
          className="h-10 w-full justify-between gap-3 text-start"
          title={`${option.raw_material_name} · ${details(option)}`}
          onClick={() => { onChange(String(option.raw_material)); setOpen(false); }}>
          <Check className={`h-4 w-4 shrink-0 ${value === String(option.raw_material) ? 'opacity-100' : 'opacity-0'}`} />
          <span className="min-w-0 flex-1 truncate"><span className="font-medium">{option.raw_material_name}</span><span className="text-xs text-muted-foreground"> · {details(option)}</span></span>
        </Button>) : <p className="p-3 text-sm text-muted-foreground">{t('packing.noAvailableMaterials')}</p>}
      </div>
    </PopoverContent>
  </Popover>;
}

export function PackingMaterialCategoryField({ id, value, options, disabled, onChange }: {
  id: string;
  value: string;
  options: PackingComponentStockOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useLanguage();
  const categories = Array.from(new Map(options.filter(option => option.category != null).map(option =>
    [String(option.category), option.category_name || String(option.category)],
  )).entries()).sort((a, b) => a[1].localeCompare(b[1]));
  return <Select value={value} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger id={id} className="h-10 min-w-0 [&>span]:truncate" aria-label={t('rawMaterials.category')}><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="all">{t('common.all')}</SelectItem>
      {categories.map(([categoryId, name]) => <SelectItem key={categoryId} value={categoryId}>{name}</SelectItem>)}
      {options.some(option => option.category == null) && <SelectItem value="uncategorized">{t('packing.withoutCategory')}</SelectItem>}
    </SelectContent>
  </Select>;
}
