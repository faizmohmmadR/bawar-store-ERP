import useFetchObjects from '@/api/useFetchObjects';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/contexts/LanguageContext';
import type { StockProductChoice } from './StockProductPicker';

export function StockProductQuantity({ choice }: { choice: StockProductChoice }) {
  const { t } = useLanguage();
  const { data, isSuccess } = useFetchObjects<{ results: Array<{ available_quantity?: string; piece_amount?: string }> }>({
    queryKey: ['stocks', 'packing-product-quantity', String(choice.product || '')],
    endpoint: 'stocks/',
    params: { product: choice.product, condition: 'good', page_size: 1 },
    enabled: Boolean(choice.product),
  });
  const stock = data?.results[0];
  const quantity = choice.product
    ? isSuccess ? Number(stock?.available_quantity ?? stock?.piece_amount ?? 0) : null
    : choice.product_name !== undefined ? 0 : null;
  const label = t('stock.availableQuantity', 'Available quantity');
  return <Input readOnly value={quantity === null ? '' : quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}
    placeholder="—" className="h-10 tabular-nums text-sm" aria-label={label} title={label} />;
}
