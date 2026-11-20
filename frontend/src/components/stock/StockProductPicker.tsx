import { Autocomplete } from '@/components/ui/autocomplete';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

export type StockProductChoice = { product?: number; product_name?: string; label?: string; capacity_kg?: number | string | null; capacity_liters?: number | string | null };
export function StockProductModeButton({ value, onChange, disabled = false, className }: {
  value: StockProductChoice; onChange: (value: StockProductChoice) => void; disabled?: boolean; className?: string;
}) {
  const { t } = useLanguage();
  const creating = value.product_name !== undefined;
  return <Button type="button" variant="outline" className={className} disabled={disabled} onClick={() => onChange(creating ? {} : { product_name: '', capacity_kg: value.capacity_kg, capacity_liters: value.capacity_liters })}>{creating ? t('stock.chooseExistingProduct', 'Choose existing') : t('stock.newStockProduct', 'New name')}</Button>;
}

export function StockProductPicker({ kind, value, onChange, disabled = false, hideModeButton = false }: {
  kind: string; value: StockProductChoice; onChange: (value: StockProductChoice) => void; disabled?: boolean; hideModeButton?: boolean;
}) {
  const { t } = useLanguage();
  const creating = value.product_name !== undefined;
  const typeLabel = t(`stock.component_${kind}`, kind);
  const productLabel = (name: string) => `${name} · ${typeLabel}`;
  return (
    <div className="flex min-h-10 items-center gap-2">
      {!hideModeButton && <StockProductModeButton value={value} onChange={onChange} disabled={disabled} />}
      <div className="min-h-10 min-w-0 flex-1">
        {creating
          ? (
            <Input
              className="h-10 text-sm"
              value={value.product_name || ''}
              maxLength={255}
              disabled={disabled}
              placeholder={productLabel(t('stock.newProductName', 'New product name'))}
              onChange={event => onChange({ ...value, product_name: event.target.value })}
            />
          )
          : (
            <Autocomplete
              endpoint="stocks/output-products"
              queryParams={{ kind }}
              value={value.product ? String(value.product) : ''}
              initialLabel={value.label ? productLabel(value.label) : undefined}
              disabled={disabled}
              getOptionLabel={option => productLabel(option.name)}
              getOptionValue={option => String(option.id)}
              placeholder={productLabel(t('stock.selectStockProduct', 'Choose stock product'))}
              onChange={(id, option) => onChange(id ? {
                product: Number(id),
                label: option?.name,
                capacity_kg: option?.bottle_capacity_kg,
                capacity_liters: option?.bottle_capacity_liters,
              } : {})}
            />
          )}
      </div>
    </div>
  );
}
