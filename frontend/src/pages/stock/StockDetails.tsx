import { ReturnToPack } from '@/components/stock/ReturnToPack';
import { DamageBottlesDialog } from '@/components/stock/DamageBottlesDialog';
import { formatPrice } from '@/lib/formatNumber';
import { DualCurrencyCosts } from '@/components/display/DualCurrencyCosts';
import { getCurrencySymbol } from '@/lib/currencies';
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import { Stock } from '@/types/stock';
import { Package, ArrowLeft, AlertTriangle } from 'lucide-react';
import useFetchObjects from '@/api/useFetchObjects';

const StockDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { formatDate } = useFormatAppDate();

  const { data: stock, isLoading } = useFetchObjects<Stock>({
    queryKey: ['stock', id],
    endpoint: `stocks/${id}/`,
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!stock) {
    return <div className="p-6 text-center text-muted-foreground">{t('stock.noStockItems')}</div>;
  }

  const symbol = getCurrencySymbol(stock.currency_details);
  const material = stock.product_details?.raw_material_details;
  const materialType = stock.product_details?.material_type || material?.material_type;
  const materialStockQuantity = Number(stock.on_hand_quantity ?? stock.piece_amount) || 0;
  const materialQuantityUnit = materialType === 'carton'
    ? t('stock.cartonUnits', 'cartons')
    : materialType === 'plastic'
      ? t('stock.plasticPackUnits', 'plastic packs')
      : t('stock.bottleUnits', 'bottles');
  const materialCapacity = material?.capacity_liters != null
    ? `${(Number(material.capacity_liters) * (material.capacity_display_unit === 'ml' ? 1000 : 1)).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${material.capacity_display_unit || 'L'}`
    : material?.capacity_kg != null
      ? `${Number(material.capacity_kg).toLocaleString(undefined, { maximumFractionDigits: 4 })} kg`
      : null;
  const materialPackageSize = materialType === 'carton' && material?.bottles_per_carton
    ? `${material.bottles_per_carton} ${t('stock.bottleUnits', 'bottles')} / ${t('stock.cartonUnits', 'cartons')}`
    : materialType === 'plastic' && material?.bottles_per_plastic
      ? `${material.bottles_per_plastic} ${t('stock.bottleUnits', 'bottles')} / ${t('stock.plasticPackUnits', 'plastic packs')}`
      : null;

  const onHand = Number(stock.on_hand_quantity ?? stock.piece_amount ?? 0);
  const sellablePieces = Number(stock.available_quantity ?? stock.piece_amount ?? 0);
  const unavailablePieces = Math.max(0, onHand - sellablePieces);
  const totalCartons = Number(stock.carton_amount ?? 0);
  const totalValue = Number(stock.stock_value_afn ?? onHand * Number(stock.buy_price));
  const suppliers = [...new Set((stock.batches || []).map(item => item.supplier_details?.name).filter(Boolean))];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/stock')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{t('stock.stockDetails')}</h1>
          <p className="text-sm text-muted-foreground">{stock.product_details?.name || material?.name || stock.product}</p>
          {(materialCapacity || materialPackageSize) && (
            <p className="mt-1 text-sm text-muted-foreground">
              {[materialCapacity, materialPackageSize].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      {stock.condition === 'good' && ['bottle', 'bottle_with_cap'].includes(materialType || '') && (
        <div className="flex flex-wrap gap-3">
          <ReturnToPack stockId={stock.id} />
          <DamageBottlesDialog stockId={stock.id} />
        </div>
      )}

      <DualCurrencyCosts basis="current" rate={stock.usd_to_afn_rate ?? null} rows={[{ label: t('stock.weightedAverageUnitCost'), afn: stock.average_unit_cost_afn ?? stock.buy_price }]} />
      {unavailablePieces > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <p>{t('stock.unavailableQuantity', 'Unavailable quantity')}: {unavailablePieces.toLocaleString(undefined, { maximumFractionDigits: 4 })}</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {(stock.product_details?.raw_material || stock.product_details?.material_type) ? <Card><CardContent className="pt-6"><p className="text-sm font-medium text-muted-foreground">{materialQuantityUnit}</p><p className="text-2xl font-bold tabular-nums">{materialStockQuantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</p></CardContent></Card> : <>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">{t('stock.carton', 'Carton')}</p>
            <p className="text-2xl font-bold tabular-nums">{totalCartons.toFixed(0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">{t('stock.bottleAmount', 'Bottle')}</p>
            <p className="text-2xl font-bold tabular-nums">{sellablePieces.toFixed(0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">{t('stock.plasticAmount', 'Plastic')}</p>
            <p className="text-2xl font-bold tabular-nums">{sellablePieces.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('stock.plasticMatchesBottle', '1 plastic = 1 bottle')}
            </p>
          </CardContent>
        </Card>
        </>}
        {(stock.product_details?.raw_material || stock.product_details?.material_type) && <Card><CardContent className="pt-6"><p className="text-sm font-medium text-muted-foreground">
          {materialType === 'carton'
            ? t('stock.pricePerCarton', 'Price per carton')
            : materialType === 'plastic'
              ? t('stock.pricePerPlasticPack', 'Price per plastic pack')
              : t('stock.pricePerBottle', 'Price per bottle')}
        </p><p className="text-2xl font-bold tabular-nums">{symbol}{formatPrice(stock.buy_price)}</p></CardContent></Card>}
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">
              {t('stock.availableQuantity', 'Available quantity')}
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {sellablePieces.toLocaleString(undefined, { maximumFractionDigits: 4 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">{t('stock.totalValue')}</p>
            <p className="text-2xl font-bold tabular-nums">
              {symbol}
              {formatPrice(totalValue)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {t('stock.productInformation')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('stock.product')}</label>
              <p className="text-lg font-semibold">{stock.product_details?.name || stock.product}</p>
              {stock.product_details?.bottle_capacity_kg && (
                <p className="text-sm text-muted-foreground">
                  {Number(stock.product_details.bottle_capacity_kg).toLocaleString(undefined, { maximumFractionDigits: 4 })} kg/bottle{!stock.product_details.material_type && ` · ${stock.product_details.bottles_per_carton || 8} bottles/carton`}
                  {!stock.product_details.material_type && stock.product_details.bottle_capacity_kg && ` · ${(Number(stock.product_details.bottle_capacity_kg) * Number(stock.product_details.bottles_per_carton || 8)).toLocaleString(undefined, { maximumFractionDigits: 4 })} kg/carton`}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('stock.conditionLabel')}</label>
              <p>{t(`stock.${stock.condition}`, stock.condition || '—')}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('rawMaterials.materialType')}</label>
              <p>{materialType ? t(`rawMaterials.type${materialType.split('_').map(part => part[0].toUpperCase() + part.slice(1)).join('')}`) : '—'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('stock.itemCapacity', 'Item capacity')}</label>
              <p>{materialCapacity || '—'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('stock.packageSize', 'Pack size')}</label>
              <p>{materialPackageSize || '—'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('stock.expireDate')}</label>
              <p>{stock.expire_date ? formatDate(stock.expire_date) : '—'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('common.createdAt', 'Created')}</label>
              <p>{stock.created_at ? formatDate(stock.created_at) : '—'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('common.updatedAt', 'Updated')}</label>
              <p>{stock.updated_at ? formatDate(stock.updated_at) : '—'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('stock.supplier', 'Supplier')}</label>
              <p>{suppliers.join(', ') || '—'}</p>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-muted-foreground">{t('stock.notes')}</label>
              <p className="whitespace-pre-wrap">{stock.notes || '—'}</p>
            </div>
            {stock.product_details?.barcode && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t('stock.barcode')}</label>
                <p className="font-mono bg-muted px-2 py-1 rounded inline-block">
                  {stock.product_details.barcode}
                </p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('stock.currency')}</label>
              <p className="text-lg">
                {stock.currency_details?.name} ({stock.currency_details?.code})
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StockDetails;
