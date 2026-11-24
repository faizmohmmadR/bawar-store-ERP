import { saleDisplayQuantity, saleDisplayPrice } from '@/lib/saleDisplay';
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { AfnReportingPreview } from '@/components/forms/AfnReportingPreview';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import { Sale } from '@/types/sale';
import type { Currency } from '@/types/common';
import useFetchObjects from '@/api/useFetchObjects';
import { User, Calendar, CreditCard, FileText, Package, MapPin, Phone, Mail, Truck, ArrowLeft, Printer, Plus } from 'lucide-react';
import { ReloadIcon } from '@radix-ui/react-icons';
import OrderPaymentSection from '@/components/payments/OrderPaymentSection';
import JournalEntriesSection from '@/components/accounting/JournalEntriesSection';
import { printSaleBill } from '@/pages/sales/print';
import { formatOrderNumeric } from '@/lib/orderNumeric';
import { FALLBACK_BASE_SYMBOL } from '@/lib/currencies';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';
import { cartonsFromPieces, DEFAULT_PIECES_PER_CARTON, remainderPieces } from '@/lib/packaging';
import { saleLineTotal } from '@/lib/saleFormSchemas';

const SaleDetails = () => {
  const { t, language, direction } = useLanguage();
  const { calendar } = useCalendarPreference();
  const { formatDate } = useFormatAppDate();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [printing, setPrinting] = React.useState(false);

  const { data: sale, isLoading } = useFetchObjects<Sale>({
    queryKey: ['sale', id],
    endpoint: `sales/${id}`,
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 flex justify-center">
        <ReloadIcon className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="container mx-auto py-6">
        <p>{t('sales.saleNotFound')}</p>
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'delivered': return 'default';
      case 'confirmed': return 'secondary';
      case 'draft': return 'outline';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  const formatCurrency = (amount: number, currency?: Currency) => {
    const numAmount = Number(amount) || 0;
    return `${formatOrderNumeric(numAmount)} ${currency?.symbol || currency?.code || ''}`;
  };

  const afnSymbol = resolveCurrencySymbol(1) || FALLBACK_BASE_SYMBOL;
  const formatAfn = (amount: number) => `${formatOrderNumeric(amount)} ${afnSymbol}`;

  const items = sale.items || sale.sales_items || [];
  const finalTotal = parseFloat(sale.final_total?.toString() || sale.total_amount?.toString() || '0');
  const currentRemaining = finalTotal - parseFloat(sale.paid_amount?.toString() || '0');
  const toNum = (val: number | string | null | undefined) =>
    parseFloat(String(val ?? '0')) || 0;

  const handlePrint = async () => {
    try {
      setPrinting(true);
      await printSaleBill({
        sale,
        language,
        direction,
        calendar,
        t,
      });
    } catch (err) {
      console.error(err);
      alert(t('sales.printFailed', 'Could not print this sale. Try again.'));
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/sales')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">{t('sales.saleDetails')}</h1>
          {sale.transaction_type === 'free' && <span className="text-sm font-semibold text-blue-600 dark:text-blue-300">{t('common.free', 'Free')}</span>}
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button
            disabled={
              sale.transaction_type === 'free'
              || !!sale.employee
              || currentRemaining <= 0
            }
            onClick={() => navigate(`/sale-payments/add?sale_id=${id}`)}
          >
            <Plus className="h-4 w-4" />
            {t('sales.addPayment')}
          </Button>
          <Button variant="outline" onClick={handlePrint} disabled={printing}>
            <Printer className="h-4 w-4 mr-2" />
            {t('sales.printInvoice')}
          </Button>
        </div>
      </div>

      {/* Invoice & Customer Info */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Invoice Info */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/15 dark:bg-primary/20 rounded-lg">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{sale.invoice_number}</h2>
                  <Badge variant={getStatusVariant(sale.status)} className="mt-1">
                    {t(`sales.${sale.status}`)}
                  </Badge>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 pl-11">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">{t('sales.saleDate')}</p>
                    <p className="font-medium">{formatDate(sale.sale_date)}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('sales.saleType')}</p>
                  <p className="font-medium">
                    {(sale.items || sale.sales_items || []).every(
                      (item) => String(item.sale_source || '').toLowerCase() === 'tank',
                    )
                      ? t('sales.sourceTank')
                      : t('sales.sourceStock')}
                  </p>
                </div>
                {sale.plate_number && (
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">{t('sales.plateNumber')}</p>
                      <p className="font-medium">{sale.plate_number}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Customer / Salesman Info */}
            <div className="space-y-5 border-l pl-8">
              {sale.employee_details && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold">
                    <User className="h-4 w-4" />
                    {t('sales.employee', 'Employee')}
                  </div>
                  <div className="space-y-2 pl-6">
                    <p className="font-semibold text-lg">{sale.employee_details.full_name}</p>
                    {sale.employee_details.phone && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Phone className="h-3 w-3" />
                        {sale.employee_details.phone}
                      </div>
                    )}
                    {sale.salary_settlement_id && (
                      <p className="text-sm text-muted-foreground">
                        {t('sales.salarySettled', 'Settled as salary')}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {!sale.customer_details && !sale.vendor_details && !sale.employee_details && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold">
                    <User className="h-4 w-4" />
                    {t('sales.customer')}
                  </div>
                  <div className="space-y-2 pl-6">
                    <p className="font-semibold text-lg">{t('sales.walkIn', 'Walk-in')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('sales.walkInCashAuto', 'Paid in cash automatically')}
                    </p>
                  </div>
                </div>
              )}
              {sale.customer_details && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold">
                    <User className="h-4 w-4" />
                    {t('sales.customer')}
                  </div>
                  <div className="space-y-2 pl-6">
                    <p className="font-semibold text-lg">{sale.customer_details.name}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                      {sale.customer_details.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3" />
                          {sale.customer_details.phone}
                        </div>
                      )}
                      {sale.customer_details.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-3 w-3" />
                          {sale.customer_details.email}
                        </div>
                      )}
                      {sale.customer_details.address && (
                        <div className="flex items-center gap-2 col-span-2">
                          <MapPin className="h-3 w-3" />
                          {sale.customer_details.address}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {sale.salesman_details && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold">
                    <User className="h-4 w-4" />
                    {t('sales.salesman', 'Salesman')}
                  </div>
                  <div className="pl-6 space-y-1">
                    <p className="font-semibold">{sale.salesman_details.name}</p>
                    {sale.salesman_details.phone && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Phone className="h-3 w-3" />
                        {sale.salesman_details.phone}
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {t('sales.totalCommissionAfn', 'Total commission (AFN)')}:{' '}
                      <span className="font-semibold text-foreground">
                        {formatAfn(Number(sale.total_commission) || 0)}
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6">
        <AfnReportingPreview
          amount={finalTotal}
          currencyId={sale.currency_details?.id ?? sale.currency}
          atDate={sale.sale_date}
          storedRate={sale.exchange_rate}
          storedBase={sale.total_amount_base}
          amountIsAfn={false}
        />
      </div>

      {/* Payment Summary */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-4 gap-4 text-start">
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">{t('sales.grandTotal')}</p>
              <p className="text-lg font-bold">{formatCurrency(finalTotal, sale.currency_details)}</p>
            </div>
            <div className="p-4 bg-primary/10 dark:bg-green-900/20 rounded-lg">
              <p className="text-xs text-primary mb-1">{t('sales.paidAmount')}</p>
              <p className="text-lg font-bold text-primary">{formatCurrency(parseFloat(sale.paid_amount?.toString() || '0'), sale.currency_details)}</p>
            </div>
            <div className="p-4 bg-accent/10 dark:bg-orange-900/20 rounded-lg">
              <p className="text-xs text-accent mb-1">{t('sales.currentRemaining', 'Current Remaining')}</p>
              <p className="text-lg font-bold text-accent">{formatCurrency(currentRemaining, sale.currency_details)}</p>
            </div>
            <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">{t('sales.discount')}</p>
              <p className="text-lg font-bold">{formatCurrency(parseFloat(sale.discount_amount?.toString() || '0'), sale.currency_details)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sale Items */}
      {items.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" />
              {t('sales.saleItems')} ({items.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-start p-3 font-medium text-sm text-gray-600">{t('sales.product')}</th>
                  <th className="text-start p-3 font-medium text-sm text-gray-600">{t('sales.quantity', 'Quantity')}</th>
                  <th className="text-start p-3 font-medium text-sm text-gray-600">{t('sales.price', 'Price')}</th>
                  <th className="text-start p-3 font-medium text-sm text-gray-600">
                    {t('sales.commissionPerUnitAfn', 'Commission / Unit (AFN)')}
                  </th>
                  <th className="text-start p-3 font-medium text-sm text-gray-600">{t('sales.total')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const sellPrice = toNum(item.sell_price) || saleDisplayPrice(item);
                  const qty = toNum(item.quantity);
                  const commissionPerUnit = toNum(item.commission_amount);
                  const lineCommission =
                    toNum(item.commission_total) || qty * commissionPerUnit;
                  const packagingName = item.packaging_details?.name;
                  const factor = toNum(item.conversion_factor ?? item.packaging_details?.qty_in_base) || 1;
                  const baseQty = toNum(item.base_quantity) || qty * factor;
                  const productName =
                    item.product_details?.name
                    || item.raw_material_stock_details?.name
                    || item.product
                    || t('common.notAvailable');
                  const quantityLabel = packagingName
                    ? `${formatOrderNumeric(qty)} ${packagingName}`
                    : `${formatOrderNumeric(saleDisplayQuantity(item))}`;
                  const lineTotal = packagingName
                    ? qty * sellPrice
                    : saleLineTotal(item as any);
                  return (
                    <tr key={item.id || index} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="p-3">
                        <div>
                          <p className="font-medium">{productName}</p>
                          {packagingName ? (
                            <p className="text-xs text-muted-foreground">
                              ×{formatOrderNumeric(factor)} · {formatOrderNumeric(baseQty)} {t('products.baseUnits', 'base')}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="p-3 text-start">
                        <span className="font-medium">{quantityLabel}</span>
                      </td>
                      <td className="p-3 text-start text-gray-600">
                        {formatCurrency(sellPrice, sale.currency_details)}
                      </td>
                      <td className="p-3 text-start text-gray-600">
                        <div>{formatAfn(commissionPerUnit)}</div>
                        {lineCommission > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {t('sales.lineCommission', 'Line')}: {formatAfn(lineCommission)}
                          </p>
                        )}
                      </td>
                      <td className="p-3 text-start font-semibold">
                        {formatCurrency(lineTotal, sale.currency_details)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {sale.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              {t('sales.notes')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 dark:text-gray-400">{sale.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Payments */}
      <OrderPaymentSection
        allowPayment={sale.transaction_type !== 'free'}
        type="sale"
        orderId={id!}
        totalAmount={Number(finalTotal)}
        currencySymbol={sale.currency_details?.symbol || sale.currency_details?.code || ''}
      />

      <JournalEntriesSection model="sales" objectId={id!} includeRelated />
    </div>
  );
};

export default SaleDetails;
