import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Package, Scale, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import useFetchObjects from '@/api/useFetchObjects';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatOrderNumeric } from '@/lib/orderNumeric';

type BalanceRow = {
  product_id: number;
  product?: string;
  warehouse?: string;
  on_hand?: number | string;
  available?: number | string;
  average_cost?: number | string;
  value?: number | string;
};

type StockReportResponse = {
  balances?: BalanceRow[];
  movement_count?: number;
  period?: { start?: string; end?: string };
};

const StockReportPage = () => {
  const { t } = useLanguage();
  const { data, isLoading, isError, refetch } = useFetchObjects<StockReportResponse>({
    queryKey: ['stock-report'],
    endpoint: 'stocks/report/',
  });

  const balances = data?.balances || [];
  const totalValue = balances.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
  const totalOnHand = balances.reduce((sum, row) => sum + (Number(row.on_hand) || 0), 0);
  const skuCount = new Set(balances.map((row) => row.product_id)).size;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" asChild>
            <Link to="/stock" aria-label={t('common.back')}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{t('stock.report', 'Stock report')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('stock.reportHint', 'Current warehouse balances in base units')}
            </p>
          </div>
        </div>
        {isError ? (
          <Button variant="outline" onClick={() => refetch()}>
            {t('common.retry', 'Retry')}
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="shadow-none">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  {t('stock.skuCount', 'Products with stock')}
                </CardDescription>
                <CardTitle className="text-2xl tabular-nums">{formatOrderNumeric(skuCount)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="shadow-none">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Scale className="h-4 w-4" />
                  {t('stock.totalBaseQty', 'Total base qty')}
                </CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatOrderNumeric(totalOnHand)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="shadow-none">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Warehouse className="h-4 w-4" />
                  {t('stock.totalValue', 'Total value (AFN)')}
                </CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatOrderNumeric(totalValue)}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">
                {t('stock.movementsInPeriod', 'Movements')}:{' '}
                {formatOrderNumeric(Number(data?.movement_count) || 0)}
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden shadow-none">
            <CardHeader className="border-b bg-muted/20">
              <CardTitle className="text-base">{t('stock.balances', 'Balances')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {balances.length ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t('stock.product', 'Product')}</TableHead>
                      <TableHead>{t('stock.warehouse', 'Warehouse')}</TableHead>
                      <TableHead className="text-end">{t('stock.baseOnHand', 'On hand')}</TableHead>
                      <TableHead className="text-end">{t('stock.available', 'Available')}</TableHead>
                      <TableHead className="text-end">{t('stock.avgCost', 'Avg cost')}</TableHead>
                      <TableHead className="text-end">{t('stock.onHandValue', 'Value')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {balances.map((row) => (
                      <TableRow key={`${row.product_id}-${row.warehouse}`}>
                        <TableCell className="font-medium">{row.product || '—'}</TableCell>
                        <TableCell>{row.warehouse || '—'}</TableCell>
                        <TableCell className="text-end tabular-nums">
                          {formatOrderNumeric(Number(row.on_hand) || 0)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {formatOrderNumeric(Number(row.available) || 0)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {formatOrderNumeric(Number(row.average_cost) || 0)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums font-semibold">
                          {formatOrderNumeric(Number(row.value) || 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  {t('stock.noStockFound', 'No stock balances found')}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default StockReportPage;
