import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Package, Warehouse } from 'lucide-react';
import { ReloadIcon } from '@radix-ui/react-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import useFetchObjects from '@/api/useFetchObjects';
import { ListDate } from '@/components/display/ListDate';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatOrderNumeric } from '@/lib/orderNumeric';
import {
  baseUomLabel,
  formatPackagingBreakdown,
  stockValue,
} from '@/lib/inventoryDisplay';
import type { InventoryBalance, StockMovement } from '@/types/inventory';

const StockDetails = () => {
  const { t, direction } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const BackIcon = direction === 'rtl' ? ArrowRight : ArrowLeft;

  const { data: balance, isLoading, isError, refetch } = useFetchObjects<InventoryBalance>({
    queryKey: ['inventory-balance', id],
    endpoint: `inventory-balances/${id}/`,
    enabled: !!id,
  });

  const productId = balance?.product ? String(balance.product) : '';
  const warehouseId = balance?.warehouse ? String(balance.warehouse) : '';

  const { data: movementsData, isLoading: movementsLoading } = useFetchObjects<{
    results?: StockMovement[];
  } | StockMovement[]>({
    queryKey: ['stock-movements', productId, warehouseId],
    endpoint: 'stock-movements/',
    params: {
      product: productId,
      warehouse: warehouseId,
      page_size: 50,
    },
    enabled: Boolean(productId && warehouseId),
  });

  const movements: StockMovement[] = Array.isArray(movementsData)
    ? movementsData
    : movementsData?.results || [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-16" role="status">
        <ReloadIcon className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!balance) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <p className="text-muted-foreground">
          {isError
            ? t('stock.loadError', 'Unable to load stock balance.')
            : t('stock.notFound', 'Stock balance not found')}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/stock')}>
            <BackIcon className="me-2 h-4 w-4" />
            {t('common.back')}
          </Button>
          {isError ? <Button onClick={() => refetch()}>{t('common.retry', 'Retry')}</Button> : null}
        </div>
      </div>
    );
  }

  const product = balance.product_details;
  const uom = baseUomLabel(product);
  const onHand = Number(balance.quantity_on_hand) || 0;
  const reserved = Number(balance.quantity_reserved) || 0;
  const available = Number(balance.quantity_available ?? onHand - reserved) || 0;
  const avgCost = Number(balance.average_cost) || 0;
  const value = stockValue(onHand, avgCost);
  const breakdown = balance.packaging_breakdown || [];

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label={t('common.back')}
            onClick={() => navigate('/stock')}
          >
            <BackIcon className="h-4 w-4" />
          </Button>
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{t('stock.viewStock', 'View stock')}</p>
            <h1 className="break-words text-xl font-semibold tracking-tight sm:text-2xl">
              {product?.name || `#${balance.product}`}
            </h1>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Warehouse className="h-3.5 w-3.5" />
              {balance.warehouse_name || '—'}
              {uom ? ` · ${t('products.baseUom', 'Base')}: ${uom}` : ''}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate(`/products/${balance.product}`)}>
          <Package className="me-2 h-4 w-4" />
          {t('stock.viewProduct', 'View product')}
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: t('stock.baseOnHand', 'On hand (base)'),
            value: `${formatOrderNumeric(onHand)}${uom ? ` ${uom}` : ''}`,
          },
          {
            label: t('stock.available', 'Available'),
            value: `${formatOrderNumeric(available)}${uom ? ` ${uom}` : ''}`,
          },
          {
            label: t('stock.avgCost', 'Avg cost (AFN)'),
            value: formatOrderNumeric(avgCost),
          },
          {
            label: t('stock.onHandValue', 'On-hand value'),
            value: formatOrderNumeric(value),
          },
        ].map((card) => (
          <Card key={card.label} className="shadow-none">
            <CardContent className="space-y-2 p-4 sm:p-5">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-none">
        <CardHeader className="border-b bg-muted/20 px-4 py-4 sm:px-5">
          <CardTitle className="text-base">{t('stock.asPackaging', 'As packaging')}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {formatPackagingBreakdown(breakdown, t('stock.noBreakdown', 'No packaging breakdown'))}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {breakdown.length ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('products.unitName', 'Unit')}</TableHead>
                  <TableHead>{t('products.qtyInBase', 'Qty in base')}</TableHead>
                  <TableHead className="text-end">{t('stock.count', 'Count')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdown.map((row, index) => (
                  <TableRow key={`${row.packaging_id || row.name}-${index}`}>
                    <TableCell className="font-medium">
                      {row.name === 'remainder'
                        ? t('stock.remainder', 'Remainder (base)')
                        : row.name}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatOrderNumeric(Number(row.qty_in_base) || 0)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums font-semibold">
                      {formatOrderNumeric(Number(row.count) || 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              {t('stock.noBreakdown', 'No packaging breakdown')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b bg-muted/20 px-4 py-4 sm:px-5">
          <CardTitle className="text-base">{t('stock.movements', 'Stock movements')}</CardTitle>
          <Badge variant="secondary" className="tabular-nums">
            {formatOrderNumeric(movements.length)}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {movementsLoading ? (
            <div className="flex justify-center py-10">
              <ReloadIcon className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : movements.length ? (
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('stock.date', 'Date')}</TableHead>
                  <TableHead>{t('stock.movementType', 'Type')}</TableHead>
                  <TableHead>{t('purchases.unit', 'Unit')}</TableHead>
                  <TableHead className="text-end">{t('stock.txnQty', 'Txn qty')}</TableHead>
                  <TableHead className="text-end">{t('stock.baseQty', 'Base qty')}</TableHead>
                  <TableHead className="text-end">{t('stock.unitCost', 'Unit cost')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">
                      {m.occurred_at ? <ListDate value={m.occurred_at} /> : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{m.movement_type}</Badge>
                    </TableCell>
                    <TableCell>{m.packaging_name || uom || '—'}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatOrderNumeric(Number(m.transaction_quantity) || 0)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums font-medium">
                      {formatOrderNumeric(Number(m.base_quantity) || 0)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatOrderNumeric(Number(m.unit_cost) || 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t('stock.noMovements', 'No movements yet. Receive a purchase to create stock.')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StockDetails;
