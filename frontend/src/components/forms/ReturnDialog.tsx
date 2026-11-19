import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import { Sale } from '@/types/sale';
import { ReturnFormData } from '@/types/return';
import { Receipt, Calendar, User, Building2 } from 'lucide-react';
import { ReloadIcon } from '@radix-ui/react-icons';
import { CurrencySelect } from '@/components/forms/CurrencySelect';
import { resolveCurrencyId, toCurrencyFkId } from '@/lib/currencies';
import useAdd from '@/api/useAdd';
import {
  DEFAULT_PIECES_PER_CARTON,
  buildReturnPayload,
  calculateReturnTotal,
  mapSaleItemToReturnLine,
  normalizePiecesPerCarton,
  returnLineTotal,
  syncReturnQtyFromCarton,
} from '@/lib/returnFormUtils';
import { formatCartonPiece } from '@/lib/packaging';
import { ORDER_NUMERIC_STEP } from '@/lib/orderNumeric';

interface ReturnDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
}

interface ReturnItemForm {
  sales_item: string | number;
  carton_amount: number;
  piece_amount: number;
  return_price: number;
  max_piece_amount: number;
  product_name: string;
  original_price: number;
}

export const ReturnDialog: React.FC<ReturnDialogProps> = ({ isOpen, onClose, sale }) => {
  const { t } = useLanguage();
  const { formatDate } = useFormatAppDate();
  const { toast } = useToast();

  const [piecesPerCarton, setPiecesPerCarton] = useState(DEFAULT_PIECES_PER_CARTON);
  const [formData, setFormData] = useState<ReturnFormData>({
    sales: '',
    return_number: '',
    return_date: new Date().toISOString().slice(0, 16),
    reason: '',
    currency: '',
    total_amount: 0,
    refund_amount: 0,
    notes: '',
    return_items: [],
  });

  const [returnItems, setReturnItems] = useState<ReturnItemForm[]>([]);

  const { handleAdd, isLoading, isSuccess } = useAdd({
    endpoint: 'returns/',
    queryKey: 'returns',
    customSuccessMessage: t('returns.addReturn'),
  });

  const recalcTotals = (items: ReturnItemForm[], rate: number) => {
    const totalAmount = calculateReturnTotal(items, rate);
    setFormData((prev) => ({
      ...prev,
      total_amount: totalAmount,
      refund_amount: totalAmount,
    }));
  };

  useEffect(() => {
    if (sale && isOpen) {
      const rate = DEFAULT_PIECES_PER_CARTON;
      setPiecesPerCarton(rate);
      setFormData({
        sales: sale.id,
        return_number: '',
        return_date: new Date().toISOString().slice(0, 16),
        reason: '',
        currency: resolveCurrencyId(sale) || sale.currency?.toString() || '',
        total_amount: 0,
        refund_amount: 0,
        notes: '',
        return_items: [],
      });

      const items: ReturnItemForm[] =
        (sale.items || sale.sales_items)?.map((item) => {
          const line = mapSaleItemToReturnLine(
            {
              id: item.id,
              unit: item.unit,
              quantity: item.quantity,
              liter_amount: item.liter_amount,
              sell_price: item.sell_price,
            },
            rate,
          );
          return {
            ...line,
            sales_item: item.id,
            product_name:
              item.product_details?.name ||
              item.stock_details?.product?.name ||
              'Unknown Product',
            original_price: Number(item.sell_price) || 0,
          };
        }) || [];

      setReturnItems(items);
    }
  }, [sale, isOpen]);

  const updateItems = (next: ReturnItemForm[], rate = piecesPerCarton) => {
    setReturnItems(next);
    recalcTotals(next, rate);
  };

  const handleCartonChange = (index: number, cartons: number) => {
    const rate = normalizePiecesPerCarton(piecesPerCarton);
    const updated = [...returnItems];
    const synced = syncReturnQtyFromCarton(cartons, updated[index].max_piece_amount, rate);
    updated[index] = {
      ...updated[index],
      ...synced,
    };
    updateItems(updated, rate);
  };

  const handlePriceChange = (index: number, price: number) => {
    const updated = [...returnItems];
    updated[index] = { ...updated[index], return_price: price };
    updateItems(updated);
  };

  const handleRateChange = (raw: number) => {
    const rate = Math.max(1, normalizePiecesPerCarton(raw));
    setPiecesPerCarton(rate);
    const updated = returnItems.map((item) => {
      if ((item.carton_amount || 0) <= 0) return item;
      return {
        ...item,
        ...syncReturnQtyFromCarton(item.carton_amount, item.max_piece_amount, rate),
      };
    });
    updateItems(updated, rate);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validItems = returnItems.filter((item) => item.carton_amount > 0);

    if (validItems.length === 0) {
      toast({
        title: t('common.error'),
        description: t('returns.validation.items'),
        variant: 'destructive',
      });
      return;
    }

    const submitData = buildReturnPayload({
      sales: String(formData.sales),
      return_date: formData.return_date,
      reason: formData.reason,
      currency: toCurrencyFkId(formData.currency),
      notes: formData.notes,
      pieces_per_carton: piecesPerCarton,
      return_items: validItems.map((item) => ({
        sales_item: String(item.sales_item),
        carton_amount: item.carton_amount,
        piece_amount: item.piece_amount,
        return_price: item.return_price,
      })),
    });

    handleAdd(submitData);
  };

  useEffect(() => {
    if (isSuccess) {
      onClose();
      setReturnItems([]);
      setPiecesPerCarton(DEFAULT_PIECES_PER_CARTON);
      setFormData({
        sales: '',
        return_number: '',
        return_date: new Date().toISOString().slice(0, 16),
        reason: '',
        currency: '',
        total_amount: 0,
        refund_amount: 0,
        notes: '',
        return_items: [],
      });
    }
  }, [isSuccess, onClose]);

  const selectedCount = returnItems.filter((item) => item.carton_amount > 0).length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            {t('returns.addReturn')}
          </DialogTitle>
        </DialogHeader>

        {sale && (
          <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 mb-6">
            <h4 className="font-semibold text-primary mb-3">{t('sales.saleDetails')}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                <div>
                  <div className="text-gray-600">{t('sales.invoiceNumber')}</div>
                  <div className="font-medium">{sale.invoice_number}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                <div>
                  <div className="text-gray-600">{t('sales.customer')}</div>
                  <div className="font-medium">{sale.customer_details?.name || 'N/A'}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <div>
                  <div className="text-gray-600">{t('sales.saleDate')}</div>
                  <div className="font-medium">
                    {formatDate(sale.sale_date)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <div>
                  <div className="text-gray-600">{t('sales.totalAmount')}</div>
                  <div className="font-medium text-primary">
                    {sale.total_amount}{' '}
                    {sale.currency_details?.symbol || sale.currency_details?.code}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="return_number">{t('returns.returnNumber')}</Label>
              <Input
                id="return_number"
                value={formData.return_number}
                placeholder={t('common.autoGenerated', 'Generated automatically when saved')}
                className="bg-gray-50"
                readOnly
              />
            </div>

            <div>
              <Label htmlFor="return_date">{t('returns.returnDate')} *</Label>
              <Input
                id="return_date"
                type="datetime-local"
                value={formData.return_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, return_date: e.target.value }))}
                required
              />
            </div>

            <div>
              <Label htmlFor="pieces_per_carton">
                {t('returns.piecesPerCarton', 'Pieces / Carton')} *
              </Label>
              <Input
                id="pieces_per_carton"
                type="number"
                min={1}
                step={1}
                value={piecesPerCarton}
                onChange={(e) => handleRateChange(parseFloat(e.target.value) || 1)}
              />
            </div>

            <CurrencySelect
              label={t('returns.currency')}
              required
              value={formData.currency?.toString() || ''}
              onChange={(value) => setFormData((prev) => ({ ...prev, currency: value }))}
              disabled
              className="bg-gray-50"
            />

            <div>
              <Label htmlFor="reason">{t('returns.reason')}</Label>
              <Input
                id="reason"
                value={formData.reason}
                onChange={(e) => setFormData((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder={t('returns.enterReason')}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">{t('returns.notes')}</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder={t('returns.enterNotes')}
              rows={3}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t('returns.returnItems')}</h3>
              <Badge variant="outline" className="text-sm">
                {selectedCount} / {returnItems.length} items selected
              </Badge>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="font-semibold min-w-[180px]">
                        {t('products.product')}
                      </TableHead>
                      <TableHead className="font-semibold text-center min-w-[110px]">
                        {t('returns.maxQty', 'Max')}
                      </TableHead>
                      <TableHead className="font-semibold text-center min-w-[100px]">
                        {t('returns.carton', 'Carton')}
                      </TableHead>
                      <TableHead className="font-semibold text-center min-w-[130px]">
                        {t('returns.pricePerCarton', 'Price / Carton')}
                      </TableHead>
                      <TableHead className="font-semibold text-right min-w-[120px]">
                        {t('returns.returnAmount')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnItems.map((item, index) => (
                      <TableRow
                        key={index}
                        className={
                          item.carton_amount > 0
                            ? 'bg-primary/10 border-l-4 border-l-primary'
                            : 'hover:bg-gray-50'
                        }
                      >
                        <TableCell className="font-medium">
                          <div className="space-y-1">
                            <div className="font-semibold text-gray-900">{item.product_name}</div>
                            <div className="text-sm text-gray-500">
                              Original: {Number(item.original_price).toFixed(2)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {formatCartonPiece(item.max_piece_amount, piecesPerCarton)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min="0"
                            step={ORDER_NUMERIC_STEP}
                            value={item.carton_amount || ''}
                            onChange={(e) =>
                              handleCartonChange(index, parseFloat(e.target.value) || 0)
                            }
                            className="w-24 text-center mx-auto"
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.return_price}
                            onChange={(e) =>
                              handlePriceChange(index, parseFloat(e.target.value) || 0)
                            }
                            className="w-28 text-center mx-auto"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="space-y-1">
                            <span className="font-semibold text-lg text-gray-900">
                              {returnLineTotal(item, piecesPerCarton).toFixed(2)}
                            </span>
                            <div className="text-sm text-gray-500">
                              {sale?.currency_details?.symbol || sale?.currency_details?.code}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-gradient-to-r from-muted to-primary/10 rounded-lg border">
            <div className="space-y-2">
              <Label className="text-lg font-semibold">{t('returns.totalAmount')}</Label>
              <div className="text-2xl font-bold text-primary">
                {formData.total_amount.toFixed(2)}{' '}
                {sale?.currency_details?.symbol || sale?.currency_details?.code}
              </div>
              <div className="text-sm text-gray-600">{selectedCount} items selected</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund_amount" className="text-lg font-semibold">
                {t('returns.refundAmount')}
              </Label>
              <Input
                id="refund_amount"
                type="number"
                step="0.01"
                min="0"
                max={formData.total_amount}
                value={formData.refund_amount}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    refund_amount: parseFloat(e.target.value) || 0,
                  }))
                }
                className="text-lg font-semibold"
              />
              <div className="text-sm text-gray-600">
                Max refundable: {formData.total_amount.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} className="px-6">
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isLoading || selectedCount === 0} className="px-6">
              {isLoading ? (
                <>
                  <ReloadIcon className="animate-spin mr-2" />
                  {t('common.adding')}
                </>
              ) : (
                t('returns.addReturn')
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
