import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Edit, FileText, ShoppingCart } from 'lucide-react';
import { ReloadIcon } from '@radix-ui/react-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import useFetchObjects from '@/api/useFetchObjects';
import { ListDate } from '@/components/display/ListDate';
import { useLanguage } from '@/contexts/LanguageContext';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';
import { formatOrderNumeric } from '@/lib/orderNumeric';
import type { Purchase } from '@/types/purchase';
import OrderPaymentSection from '@/components/payments/OrderPaymentSection';
import JournalEntriesSection from '@/components/accounting/JournalEntriesSection';

type PurchaseDetailsData = Purchase & {
  vendor_details?: { name?: string; phone?: string; email?: string; address?: string };
  remaining_amount?: string | number;
};

const PurchaseDetails = () => {
  const { t, direction } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const BackIcon = direction === 'rtl' ? ArrowRight : ArrowLeft;

  const { data: purchase, isLoading, isError, refetch } = useFetchObjects<PurchaseDetailsData>({
    queryKey: ['purchase', id],
    endpoint: `purchases/${id}`,
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16" role="status" aria-label={t('common.loading', 'Loading…')}>
        <ReloadIcon className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!purchase) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
        <p className="text-muted-foreground">
          {isError
            ? t('purchases.loadError', 'Unable to load purchase details.')
            : t('purchases.purchaseNotFound', 'Purchase not found')}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/purchases')}>
            <BackIcon className="me-2 h-4 w-4" />
            {t('common.back')}
          </Button>
          {isError ? <Button onClick={() => refetch()}>{t('common.retry', 'Retry')}</Button> : null}
        </div>
      </div>
    );
  }

  const items = purchase.items || [];
  const isForeign = Number(purchase.currency) !== 1;
  const symbol = purchase.currency_details?.symbol || resolveCurrencySymbol(purchase.currency);
  const currencyCode = purchase.currency_details?.code || purchase.currency_name || String(purchase.currency);
  const money = (value: unknown) => `${formatOrderNumeric(Number(value) || 0)} ${symbol}`;
  const baseMoney = (value: unknown) => `${formatOrderNumeric(Number(value) || 0)} ${resolveCurrencySymbol(1)}`;
  const total = Number(purchase.final_total ?? purchase.total_amount) || 0;
  const paid = Number(purchase.paid_amount) || 0;
  const due = Number(purchase.remaining_amount ?? Math.max(0, total - paid)) || 0;
  const paymentLabel =
    due <= 0
      ? t('common.paid', 'Paid')
      : paid > 0
        ? t('purchases.partiallyPaid', 'Partially paid')
        : t('purchases.unpaid', 'Unpaid');

  const metadata = [
    { label: t('purchases.billNumber', 'Bill #'), value: purchase.bill_number || '—' },
    { label: t('purchases.warehouse', 'Warehouse'), value: purchase.warehouse_name || '—' },
    { label: t('purchases.purchaseDate', 'Purchase date'), value: <ListDate value={purchase.purchase_date} /> },
    { label: t('purchases.currency', 'Currency'), value: currencyCode },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label={t('common.back')}
            onClick={() => navigate('/purchases')}
          >
            <BackIcon className="h-4 w-4" />
          </Button>
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{t('purchases.viewPurchase', 'View purchase')}</p>
            <h1 className="break-words text-xl font-semibold tracking-tight sm:text-2xl">
              {purchase.invoice_number || `#${purchase.id}`}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={purchase.status === 'cancelled' ? 'destructive' : 'secondary'}>
            {t(`purchases.status.${purchase.status}`, purchase.status)}
          </Badge>
          {purchase.status === 'received' ? (
            <Badge
              variant="outline"
              className={
                due > 0
                  ? 'border-amber-200 text-amber-700'
                  : 'border-emerald-200 text-emerald-700'
              }
            >
              {paymentLabel}
            </Badge>
          ) : null}
          <Button variant="outline" onClick={() => navigate(`/purchases/${id}/edit`)}>
            <Edit className="me-2 h-4 w-4" />
            {t('common.edit')}
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: t('purchases.totalAmount', 'Total amount'),
            value: total,
            color: '',
            secondary: isForeign ? baseMoney(purchase.total_amount_base) : currencyCode,
          },
          {
            label: t('purchases.paidAmount', 'Paid amount'),
            value: paid,
            color: 'text-emerald-700',
            secondary: `${t('purchases.paymentStatus', 'Payment status')}: ${paymentLabel}`,
          },
          {
            label: t('purchases.dueAmount', 'Due amount'),
            value: due,
            color: due > 0 ? 'text-amber-700' : '',
            secondary: currencyCode,
          },
        ].map((summary) => (
          <Card key={summary.label} className="shadow-none">
            <CardContent className="space-y-2 p-4 sm:p-5">
              <p className="text-sm text-muted-foreground">{summary.label}</p>
              <p className={`break-words text-2xl font-semibold tabular-nums ${summary.color}`}>
                <bdi>{money(summary.value)}</bdi>
              </p>
              <p className="text-xs text-muted-foreground">{summary.secondary}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-none">
        <CardContent className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-1.5 border-b pb-4 lg:border-b-0 lg:border-e lg:pb-0 lg:pe-5">
            <p className="text-xs font-medium text-muted-foreground">{t('purchases.vendor', 'Vendor')}</p>
            <p className="break-words text-base font-semibold">
              {purchase.vendor_details?.name || purchase.vendor_name || t('common.notAvailable')}
            </p>
            {purchase.vendor_details?.phone ? (
              <p className="text-sm text-muted-foreground">
                <bdi>{purchase.vendor_details.phone}</bdi>
              </p>
            ) : null}
          </div>
          <dl className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metadata.map((field) => (
              <div key={field.label} className="min-w-0 space-y-1.5">
                <dt className="text-xs text-muted-foreground">{field.label}</dt>
                <dd className="break-words text-sm font-medium">{field.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card className="overflow-hidden shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b bg-muted/20 px-4 py-4 sm:px-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            {t('purchases.items', 'Items')}
          </CardTitle>
          <Badge variant="secondary" className="tabular-nums">
            {formatOrderNumeric(items.length)}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {items.length ? (
            <Table className="min-w-[720px] text-start">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 text-start">#</TableHead>
                  <TableHead className="min-w-[190px] text-start">{t('products.name', 'Product')}</TableHead>
                  <TableHead className="text-start">{t('purchases.unit', 'Unit')}</TableHead>
                  <TableHead className="text-start">{t('purchases.quantity', 'Qty')}</TableHead>
                  <TableHead className="text-start">{t('purchases.baseQty', 'Base qty')}</TableHead>
                  <TableHead className="text-start">{t('purchases.buyPrice', 'Buy price')}</TableHead>
                  <TableHead className="text-start">{t('purchases.profitPercent', 'Profit %')}</TableHead>
                  <TableHead className="text-start">{t('purchases.salesPrice', 'Sales price')}</TableHead>
                  <TableHead className="text-start">{t('purchases.expiryDate', 'Expiry')}</TableHead>
                  <TableHead className="text-start">{t('purchases.totalPrice', 'Total')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={item.id || index}>
                    <TableCell className="align-top text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="align-top">
                      <p className="font-medium">
                        {item.product_details?.name || `#${item.product}`}
                      </p>
                      {item.product_details?.sku ? (
                        <p className="mt-1 text-xs text-muted-foreground">{item.product_details.sku}</p>
                      ) : null}
                      {item.lot_number ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('purchases.lotNumber', 'Lot #')}: {item.lot_number}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      {item.packaging_details?.name || `#${item.packaging}`}
                      <p className="mt-1 text-xs text-muted-foreground">
                        ×{formatOrderNumeric(Number(item.conversion_factor ?? item.packaging_details?.qty_in_base) || 1)}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top tabular-nums">
                      <bdi>{formatOrderNumeric(Number(item.quantity))}</bdi>
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top tabular-nums">
                      <bdi>
                        {formatOrderNumeric(
                          Number(item.measured_base_quantity ?? item.base_quantity) || 0,
                        )}
                      </bdi>
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top tabular-nums">
                      <bdi>{money(item.price_per_unit)}</bdi>
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top tabular-nums">
                      <bdi>{formatOrderNumeric(Number(item.profit_percent) || 0)}%</bdi>
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top tabular-nums">
                      <bdi>{money(item.sale_price)}</bdi>
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top">
                      {item.expiry_date ? <ListDate value={item.expiry_date} /> : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top tabular-nums">
                      <bdi className="font-semibold">{money(item.total_price)}</bdi>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('common.noDataFound')}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-4 sm:px-5">
            <span className="text-sm font-medium">{t('purchases.totalAmount', 'Total amount')}</span>
            <div className="text-start tabular-nums">
              <bdi className="text-lg font-semibold">{money(total)}</bdi>
              {isForeign ? (
                <p className="text-xs text-muted-foreground">
                  <bdi>{baseMoney(purchase.total_amount_base)}</bdi>
                </p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {purchase.notes?.trim() ? (
        <Card className="shadow-none">
          <CardHeader className="px-4 pb-2 pt-4 sm:px-5">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-muted-foreground" />
              {t('purchases.notes', 'Notes')}
            </CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap break-words px-4 pb-4 text-sm leading-relaxed sm:px-5">
            {purchase.notes}
          </CardContent>
        </Card>
      ) : null}

      {purchase.status === 'received' && id ? (
        <OrderPaymentSection
          type="purchase"
          orderId={id}
          totalAmount={total}
          currencySymbol={symbol}
        />
      ) : null}
      {id ? <JournalEntriesSection model="purchase" objectId={id} includeRelated /> : null}
    </div>
  );
};

export default PurchaseDetails;
