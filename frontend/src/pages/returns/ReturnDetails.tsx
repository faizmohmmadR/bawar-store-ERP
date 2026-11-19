import { getCurrencySymbol } from '@/lib/currencies';
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import useFetchObjects from '@/api/useFetchObjects';
import { RotateCcw, ShoppingCart, Calendar, DollarSign, FileText, ArrowLeft } from 'lucide-react';
import { ReloadIcon } from '@radix-ui/react-icons';
import JournalEntriesSection from '@/components/accounting/JournalEntriesSection';
import { formatCartonPiece } from '@/lib/packaging';

const ReturnDetails = () => {
  const { t } = useLanguage();
  const { formatDate } = useFormatAppDate();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: returnData, isLoading } = useFetchObjects<any>({
    queryKey: ['return', id],
    endpoint: `returns/${id}`,
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 flex justify-center">
        <ReloadIcon className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (!returnData) {
    return (
      <div className="container mx-auto py-6">
        <p>Return not found</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/returns')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <RotateCcw className="h-6 w-6" />
          <h1 className="text-3xl font-bold">{t('returns.returnDetails')}</h1>
        </div>
      </div>

      <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-950/20 dark:to-red-950/20 rounded-lg p-6 border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/15 dark:bg-orange-900/30 rounded-lg">
              <RotateCcw className="h-6 w-6 text-accent dark:text-orange-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{returnData.return_number}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {formatDate(returnData.return_date)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            {t('returns.salesInformation')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('returns.sales')}</p>
                <p className="font-semibold">{returnData.sales_details?.invoice_number || 'N/A'}</p>
              </div>
            </div>
            {returnData.sales_details?.customer && (
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Customer</p>
                  <p className="font-medium">{returnData.sales_details.customer}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            {t('returns.returnInformation')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="flex items-center gap-3">
              <DollarSign className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('returns.totalAmount')}</p>
                <p className="font-bold text-lg text-primary">
                  {getCurrencySymbol(returnData.currency_details)}{Number(returnData.total_amount || 0).toFixed(2)} {returnData.currency_details?.code || ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <DollarSign className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('returns.refundAmount')}</p>
                <p className="font-bold text-lg text-primary">
                  {getCurrencySymbol(returnData.currency_details)}{Number(returnData.refund_amount || 0).toFixed(2)} {returnData.currency_details?.code || ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('returns.returnDate')}</p>
                <p className="font-medium">
                  {returnData.return_date ? formatDate(returnData.return_date) : 'N/A'}
                </p>
              </div>
            </div>
            {returnData.reason && (
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('returns.reason')}</p>
                  <Badge variant="outline">{returnData.reason}</Badge>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {returnData.return_items && returnData.return_items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('returns.returnItems')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {returnData.return_items.map((item: any, index: number) => (
                <div key={index} className="flex justify-between items-center p-3 border rounded">
                  <div>
                    <p className="font-medium">{item.sales_item_details?.product || 'N/A'}</p>
                    <p className="text-sm text-gray-500">
                      {formatCartonPiece(Number(item.liter_amount ?? item.quantity ?? 0))}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {getCurrencySymbol(returnData.currency_details)}
                      {Number(item.return_price || 0).toFixed(2)}
                      <span className="text-xs font-normal text-gray-500 ms-1">
                        / {t('returns.carton')}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {returnData.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-gray-600" />
              {t('returns.notes')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
              {returnData.notes}
            </p>
          </CardContent>
        </Card>
      )}

      <JournalEntriesSection model="return" objectId={id!} />
    </div>
  );
};

export default ReturnDetails;
