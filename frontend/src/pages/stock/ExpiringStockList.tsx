import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, CalendarClock, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import DataTable, { TableColumn, TableAction } from '@/components/ui/data-table';
import { ListDate } from '@/components/display/ListDate';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useAdd from '@/api/useAdd';
import { formatOrderNumeric, ORDER_NUMERIC_STEP } from '@/lib/orderNumeric';
import { baseUomLabel } from '@/lib/inventoryDisplay';
import type { InventoryBalance } from '@/types/inventory';

const ExpiringStockList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [days, setDays] = useState('30');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [writeOffTarget, setWriteOffTarget] = useState<InventoryBalance | null>(null);
  const [writeOffQty, setWriteOffQty] = useState('');
  const [writeOffNotes, setWriteOffNotes] = useState('');

  const daysNum = Math.max(0, Number(days) || 30);

  const { data, isLoading, refetch } = useFetchObjects<{
    results?: InventoryBalance[];
    count?: number;
  } | InventoryBalance[]>({
    queryKey: [
      'inventory-balances-expiring',
      currentPage.toString(),
      pageSize.toString(),
      String(daysNum),
      searchTerm,
    ],
    endpoint: 'inventory-balances/expiring/',
    params: {
      page: currentPage,
      page_size: pageSize,
      days: daysNum,
      search: searchTerm || undefined,
    },
  });

  const rows: InventoryBalance[] = Array.isArray(data)
    ? data
    : data?.results || [];
  const totalItems = Array.isArray(data) ? rows.length : (data?.count || 0);

  const { handleAdd, loading: writingOff, isSuccess } = useAdd({
    queryKey: [
      'inventory-balances-expiring',
      'inventory-balances',
      'stock-adjustments',
      'stock-movements',
    ],
    endpoint: 'stock-adjustments/record-expiry/',
    customSuccessMessage: t(
      'stock.expiredWriteOffSuccess',
      'Expired stock written off successfully',
    ),
  });

  useEffect(() => {
    if (!isSuccess) return;
    setWriteOffTarget(null);
    setWriteOffQty('');
    setWriteOffNotes('');
    refetch();
  }, [isSuccess, refetch]);

  const openWriteOff = (row: InventoryBalance) => {
    setWriteOffTarget(row);
    setWriteOffQty(String(Number(row.quantity_on_hand) || ''));
    setWriteOffNotes('');
  };

  const submitWriteOff = () => {
    if (!writeOffTarget) return;
    const qty = Number(writeOffQty);
    if (!(qty > 0)) return;
    handleAdd({
      product: writeOffTarget.product,
      warehouse: writeOffTarget.warehouse,
      lot: writeOffTarget.lot || undefined,
      base_quantity: qty,
      reason: writeOffNotes.trim() || 'Expired product write-off',
      notes: writeOffNotes.trim() || '',
    });
  };

  const columns: TableColumn<InventoryBalance>[] = useMemo(
    () => [
      {
        key: 'product_details',
        title: t('stock.product', 'Product'),
        width: '14rem',
        className: 'max-w-[14rem]',
        render: (value) => (
          <span className="block truncate font-medium" title={value?.name || '—'}>
            {value?.name || '—'}
          </span>
        ),
      },
      {
        key: 'lot_number',
        title: t('stock.lot', 'Lot'),
        width: '8rem',
        render: (value, row) => value || (row.lot ? `#${row.lot}` : '—'),
      },
      {
        key: 'expiry_date',
        title: t('stock.expiryDate', 'Expiry'),
        width: '10rem',
        render: (value, row) => {
          if (!value) return '—';
          const expired = Boolean(row.is_expired);
          const daysLeft = row.days_to_expiry;
          return (
            <div className="flex flex-wrap items-center gap-2">
              <ListDate value={value} />
              {expired ? (
                <Badge variant="destructive">{t('stock.expired', 'Expired')}</Badge>
              ) : daysLeft != null ? (
                <Badge variant="secondary">{`${daysLeft}d`}</Badge>
              ) : null}
            </div>
          );
        },
      },
      {
        key: 'warehouse_name',
        title: t('stock.warehouse', 'Warehouse'),
        width: '9rem',
        render: (value) => value || '—',
      },
      {
        key: 'purchase_invoice',
        title: t('stock.purchase', 'Purchase'),
        width: '9rem',
        render: (value, row) =>
          row.purchase_id ? (
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/purchases/${row.purchase_id}`);
              }}
            >
              {value || `#${row.purchase_id}`}
            </Button>
          ) : (
            '—'
          ),
      },
      {
        key: 'quantity_on_hand',
        title: t('stock.baseOnHand', 'On hand (base)'),
        width: '9rem',
        className: 'tabular-nums',
        render: (value, row) => {
          const uom = baseUomLabel(row.product_details);
          return `${formatOrderNumeric(Number(value) || 0)}${uom ? ` ${uom}` : ''}`;
        },
      },
    ],
    [navigate, t],
  );

  const rowActions: TableAction<InventoryBalance>[] = [
    {
      key: 'view',
      label: t('common.view', 'View'),
      icon: <Eye className="h-4 w-4" />,
      onClick: (row) => navigate(`/stock/${row.id}`),
    },
    {
      key: 'write-off',
      label: t('stock.writeOffExpired', 'Write off'),
      icon: <Ban className="h-4 w-4" />,
      onClick: (row) => openWriteOff(row),
      show: (row) => Boolean(row.is_expired),
      variant: 'destructive',
    },
  ];

  const availableQty = Number(writeOffTarget?.quantity_on_hand) || 0;
  const writeQty = Number(writeOffQty) || 0;
  const canSubmit = writeQty > 0 && writeQty <= availableQty;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={rows}
        columns={columns}
        loading={isLoading}
        title={t('stock.expiring', 'Expiring stock')}
        subtitle={t(
          'stock.expiringListHint',
          'Lots expired or expiring within the selected window. Write off only expired lots.',
        )}
        icon={<CalendarClock className="h-5 w-5" />}
        searchable
        searchPlaceholder={t('stock.searchExpiring', 'Search expiring stock…')}
        searchValue={searchTerm}
        onSearch={(value) => {
          setSearchTerm(value);
          setCurrentPage(1);
        }}
        customFilters={[
          {
            key: 'days',
            label: t('stock.withinDays', 'Within days'),
            width: '8rem',
            component: (
              <Input
                type="number"
                min={0}
                className="h-9"
                value={days}
                onChange={(e) => {
                  setDays(e.target.value);
                  setCurrentPage(1);
                }}
              />
            ),
          },
        ]}
        pagination={{
          current: currentPage,
          pageSize,
          total: totalItems,
          onPageChange: setCurrentPage,
          showSizeChanger: true,
          pageSizeOptions: [10, 25, 50, 100],
          onPageSizeChange: (size) => {
            setPageSize(size);
            setCurrentPage(1);
          },
        }}
        rowActions={rowActions}
        emptyIcon={<CalendarClock className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('stock.noExpiring', 'No expiring lots')}
        emptyDescription={t(
          'stock.noExpiringHint',
          'Enable Track expiry on products and receive purchases with expiry dates to see lots here.',
        )}
        maxHeight="75vh"
        stickyHeader
      />

      <Dialog
        open={Boolean(writeOffTarget)}
        onOpenChange={(open) => {
          if (!open) setWriteOffTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5" />
              {t('stock.writeOffExpired', 'Write off expired')}
            </DialogTitle>
            <DialogDescription>
              {writeOffTarget?.product_details?.name || '—'}
              {writeOffTarget?.lot_number
                ? ` · ${t('stock.lot', 'Lot')} ${writeOffTarget.lot_number}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="writeoff-qty">
                {t('stock.baseOnHand', 'On hand (base)')}:{' '}
                <span className="tabular-nums font-medium">
                  {formatOrderNumeric(availableQty)}
                </span>
              </Label>
              <Input
                id="writeoff-qty"
                type="number"
                min={0}
                step={ORDER_NUMERIC_STEP}
                value={writeOffQty}
                onChange={(e) => setWriteOffQty(e.target.value)}
              />
              {writeQty > availableQty ? (
                <p className="text-xs text-destructive">
                  {t('stock.qtyExceedsAvailable', 'Quantity exceeds available stock')}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="writeoff-notes">{t('stock.reason', 'Reason')}</Label>
              <Textarea
                id="writeoff-notes"
                value={writeOffNotes}
                onChange={(e) => setWriteOffNotes(e.target.value)}
                rows={3}
                placeholder={t('stock.expiredWriteOffReason', 'Expired product write-off')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWriteOffTarget(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={submitWriteOff} disabled={!canSubmit || writingOff}>
              {writingOff
                ? t('common.saving', 'Saving…')
                : t('stock.writeOff', 'Write off')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExpiringStockList;
