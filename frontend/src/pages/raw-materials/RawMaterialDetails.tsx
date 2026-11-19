import { formatPrice } from '@/lib/formatNumber';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useLanguage } from '@/contexts/LanguageContext';
import { FileText, Package, ArrowLeft, Edit, Layers } from 'lucide-react';
import { ReloadIcon } from '@radix-ui/react-icons';
import useFetchObjects from '@/api/useFetchObjects';
import { ListDate } from '@/components/display/ListDate';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';
import type { RawMaterial, RawMaterialStock } from '@/types/raw-material';

const RawMaterialDetails = () => {
  const { formatDateTime } = useFormatAppDate();
  const { t } = useLanguage();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: material, isLoading } = useFetchObjects<RawMaterial>({
    queryKey: ['raw-material', id],
    endpoint: `raw-materials/${id}`,
    enabled: !!id,
  });

  const { data: stockData, isLoading: stockLoading } = useFetchObjects<{
    results: RawMaterialStock[];
  }>({
    queryKey: ['raw-material-stock-for-material', id],
    endpoint: 'raw-material-stocks',
    params: { raw_material: id, page_size: 1 },
    enabled: !!id,
  });

  const stock = stockData?.results?.[0];
  const purchaseLayers = (stock?.cost_layers || []).filter(
    (layer) => Number(layer.quantity) > 0,
  );

  if (isLoading || stockLoading) {
    return (
      <div className="container mx-auto py-6 flex justify-center">
        <ReloadIcon className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (!material) {
    return (
      <div className="container mx-auto py-6">
        <p>{t('rawMaterials.rawMaterialNotFound')}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/raw-materials')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{material.name}</h1>
            <p className="text-sm text-muted-foreground">{t('rawMaterials.viewRawMaterial')}</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate(`/raw-materials/${id}/edit`)}>
          <Edit className="me-2 h-4 w-4" />
          {t('common.edit')}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {t('rawMaterials.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            {material.category_name && <div><p className="text-sm text-muted-foreground">{t('rawMaterials.category', 'Category')}</p><p className="font-semibold">{material.category_name}</p></div>}
            <div>
              <p className="text-sm text-muted-foreground">{t('rawMaterials.name')}</p>
              <p className="font-semibold">{material.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('rawMaterials.materialType')}</p>
              <p className="font-semibold">
                {t(
                  `rawMaterials.type${material.material_type.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`,
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('rawMaterials.unit')}</p>
              <p className="font-semibold">{material.unit || 'kg'}</p>
            </div>
            {material.weight_per_piece_kg && <div>
              <p className="text-sm text-muted-foreground">{t('rawMaterialSales.pieceWeight', 'Actual weight per piece (kg)')}</p>
              <p className="font-semibold">{Number(material.weight_per_piece_kg).toLocaleString(undefined, { maximumFractionDigits: 6 })} kg</p>
            </div>}
            {(['bottle', 'bottle_with_cap', 'carton'].includes(material.material_type)) && (
              <div>
                <p className="text-sm text-muted-foreground">
                  {['bottle', 'bottle_with_cap'].includes(material.material_type)
                    ? t('rawMaterials.bottleCapacityKg', 'Bottle capacity (kg)')
                    : t('rawMaterials.matchingBottleCapacityKg', 'Package size (kg)')}
                </p>
                <p className="font-semibold">
                  {material.capacity_kg
                      ? `${Number(material.capacity_kg).toLocaleString(undefined, { maximumFractionDigits: 4 })} kg`
                      : '-'}
                </p>
              </div>
            )}
            {material.material_type === 'carton' && (
              <div>
                <p className="text-sm text-muted-foreground">{t('rawMaterials.bottlesPerCarton')}</p>
                <p className="font-semibold tabular-nums">{material.bottles_per_carton || '—'}</p>
              </div>
            )}
            {material.material_type === 'plastic' && (
              <div>
                <p className="text-sm text-muted-foreground">{t('rawMaterials.bottlesPerPlastic')}</p>
                <p className="font-semibold tabular-nums">{material.bottles_per_plastic || '—'}</p>
              </div>
            )}

            <div className="sm:col-span-2">
              <p className="text-sm text-muted-foreground">{t('rawMaterials.description')}</p>
              <p className="font-medium">{material.description || t('rawMaterials.noDescription')}</p>
            </div>
            <div className="border-t pt-4 sm:col-span-2">
              <p className="text-xs text-muted-foreground">
                {t('common.created')}: {formatDateTime(material.created_at)}
              </p>
              {material.updated_at !== material.created_at && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('common.updated')}: {formatDateTime(material.updated_at)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              {t('rawMaterialStock.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <p className="text-sm text-muted-foreground">{t('rawMaterialStock.quantity')}</p>
              <p className="text-2xl font-bold">
                {Number(stock?.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                <span className="ms-2 text-sm font-medium text-muted-foreground">{material.unit}</span>
              </p>
            </div>
            {material.unit === 'kg' && (
              <div>
                <p className="text-sm text-muted-foreground">{t('rawMaterialPurchases.pieceCount')}</p>
                <p className="text-lg font-semibold">
                  {Number(stock?.piece_count || 0).toLocaleString()}
                </p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">{t('rawMaterialStock.lastPurchasePrice')}</p>
              <p className="text-lg font-semibold">
                {stock?.last_purchase_price
                  ? `${resolveCurrencySymbol(1)}${formatPrice(stock.last_purchase_price)}`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('rawMaterialStock.costLayers')}</p>
              <p className="text-lg font-semibold">{purchaseLayers.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('rawMaterialStock.costLayers')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {purchaseLayers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('rawMaterialStock.noCostLayers')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('rawMaterialPurchases.invoiceNumber')}</TableHead>
                    <TableHead>{t('rawMaterialPurchases.billNumber')}</TableHead>
                    <TableHead>{t('rawMaterialPurchases.purchaseDate')}</TableHead>
                    <TableHead className="text-right">{t('rawMaterialPurchases.quantity')}</TableHead>
                    {material.unit === 'kg' && (
                      <TableHead className="text-right">{t('rawMaterialPurchases.pieceCount')}</TableHead>
                    )}
                    <TableHead className="text-right">{t('rawMaterialPurchases.pricePerUnit')}</TableHead>
                    <TableHead className="text-right">{t('rawMaterialPurchases.pricePerUnit')} (AFN)</TableHead>
                    <TableHead className="text-right">{t('rawMaterialPurchases.totalPrice')}</TableHead>
                    <TableHead className="text-right">{t('rawMaterialPurchases.totalPrice')} (AFN)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseLayers.map((layer) => {
                    const symbol = resolveCurrencySymbol(layer.currency);
                    const formatAmount = (value: string) =>
                      Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 });
                    return (
                      <TableRow key={layer.id}>
                        <TableCell className="font-medium">
                          {layer.invoice_number || `#${layer.purchase_id}`}
                        </TableCell>
                        <TableCell>{layer.bill_number || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <ListDate value={layer.purchase_date} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatAmount(layer.quantity)} {material.unit}
                        </TableCell>
                        {material.unit === 'kg' && (
                          <TableCell className="text-right tabular-nums">
                            {Number(layer.piece_count).toLocaleString()}
                          </TableCell>
                        )}
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {symbol}{formatPrice(layer.price_per_unit)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {resolveCurrencySymbol(1)}{formatPrice(layer.price_per_unit_base)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {symbol}{formatPrice(layer.total_price)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {resolveCurrencySymbol(1)}{formatPrice(layer.total_price_base)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RawMaterialDetails;
