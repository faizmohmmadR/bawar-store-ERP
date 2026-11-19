import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package } from 'lucide-react';
import useAdd from '@/api/useAdd';
import { useLanguage } from '@/contexts/LanguageContext';
import { FormPage, FormPageFields } from '@/components/forms/FormPage';
import { StockProductPicker, type StockProductChoice } from '@/components/stock/StockProductPicker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { DatePickerInput } from '@/components/ui/date-picker-input';

export default function AddMaterialStock() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [type, setType] = useState('bottle');
  const [product, setProduct] = useState<StockProductChoice>({});
  const [capacity, setCapacity] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('0');
  const [expiry, setExpiry] = useState('');
  const [notes, setNotes] = useState('');
  const { handleAdd, loading, isSuccess } = useAdd({ queryKey: ['stocks'], endpoint: 'stocks/add-material/' });
  useEffect(() => { if (isSuccess) navigate('/stock'); }, [isSuccess, navigate]);
  const quantityLabel = type === 'carton' ? t('stock.cartonsInStock', 'Cartons in stock') : type === 'plastic' ? t('stock.plasticPacksInStock', 'Plastic packs in stock') : t('stock.bottlesInStock', 'Bottles in stock');
  const priceLabel = type === 'carton' ? t('stock.pricePerCarton', 'Price per carton') : type === 'plastic' ? t('stock.pricePerPlasticPack', 'Price per plastic pack') : t('stock.pricePerBottle', 'Price per bottle');
  const validProduct = Boolean(product.product || product.product_name?.trim());
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!validProduct || !(Number(quantity) > 0) || !Number.isFinite(Number(quantity))) return;
    if (type === 'bottle' && !Number.isInteger(Number(quantity))) return;
    handleAdd({ packaging_type: type, product: product.product, product_name: product.product_name?.trim(),
      bottle_capacity_kg: type === 'bottle' && !product.product && capacity ? capacity : undefined,
      quantity, unit_cost_afn: price || '0', expire_date: expiry || null, notes });
  };
  return <FormPage title={t('stock.addMaterialStock')} icon={<Package />} backTo="/stock">
    <form onSubmit={submit} className="space-y-6">
      <p className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">{t('stock.namedStockHint', 'Choose an existing stock product or enter a new name. Packing and direct stock entries can increase the same product balance.')}</p>
      <FormPageFields>
        <div className="space-y-2"><Label>{t('rawMaterials.materialType')}</Label><Select value={type} onValueChange={value => { setType(value); setProduct({}); setCapacity(''); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['bottle', 'carton', 'plastic'].map(value => <SelectItem key={value} value={value}>{t(`packing.component_${value}`)}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>{t('stock.outputStockProduct', 'Save in stock')} *</Label><StockProductPicker kind={type} value={product} onChange={setProduct} /></div>
        {type === 'bottle' && product.product_name !== undefined && <div className="space-y-2"><Label>{t('rawMaterials.bottleCapacityKg', 'Bottle capacity (kg)')}</Label><Input type="number" min="0.0001" step="0.0001" value={capacity} onChange={event => setCapacity(event.target.value)} /></div>}
        <div className="space-y-2"><Label htmlFor="material-stock-quantity">{quantityLabel} *</Label><Input id="material-stock-quantity" type="number" min="0.0001" step={type === 'bottle' ? '1' : '0.0001'} value={quantity} onChange={event => setQuantity(event.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="material-stock-price">{priceLabel} (AFN)</Label><Input id="material-stock-price" type="number" min="0" step="0.0001" value={price} onChange={event => setPrice(event.target.value)} /></div>
        <div className="space-y-2"><Label>{t('stock.expireDate')}</Label><DatePickerInput value={expiry} onChange={setExpiry} /></div>
      </FormPageFields>
      <div className="space-y-2"><Label htmlFor="material-stock-notes">{t('stock.notes')}</Label><Textarea id="material-stock-notes" value={notes} onChange={event => setNotes(event.target.value)} /></div>
      <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => navigate('/stock')}>{t('common.cancel')}</Button><Button type="submit" disabled={loading || !validProduct}>{t(loading ? 'common.saving' : 'common.add')}</Button></div>
    </form>
  </FormPage>;
}
