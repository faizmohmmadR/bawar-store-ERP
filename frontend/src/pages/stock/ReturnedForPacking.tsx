import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isAxiosError } from 'axios';
import api from '@/api/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, History, PackageCheck, RotateCcw, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import DataTable, { TableColumn, TableAction } from '@/components/ui/data-table';
import { ListDate } from '@/components/display/ListDate';
import useFetchObjects from '@/api/useFetchObjects';
import { useLanguage } from '@/contexts/LanguageContext';
import type { PackingReturn } from '@/types/packing';

export default function ReturnedForPacking() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingItem, setEditingItem] = useState<PackingReturn | null>(null);
  const [correctedCount, setCorrectedCount] = useState('');
  const [correctionNotes, setCorrectionNotes] = useState('');
  const [savingCorrection, setSavingCorrection] = useState(false);
  const saveCorrection = async () => {
    if (!editingItem || !Number.isSafeInteger(Number(correctedCount)) || correctedCount.trim() === '' || Number(correctedCount) < editingItem.packed_bottle_count) {
      toast.error(t('stock.invalidReturnCorrection', 'Enter a whole total at least equal to the number already packed.')); return;
    }
    setSavingCorrection(true);
    try {
      await api.post(`stocks/${editingItem.stock}/correct-return/`, {
        packing_return: editingItem.id, bottle_count: Number(correctedCount),
        expected_bottle_count: editingItem.bottle_count, notes: correctionNotes,
      });
      await Promise.all(['stock', 'stocks', 'packing-returns', 'returned-for-packing', 'packing-available-returns'].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
      setEditingItem(null);
      toast.success(t('stock.returnCorrectionSaved', 'Returned quantity corrected.'));
    } catch (error) {
      toast.error(isAxiosError(error) && error.response?.data ? Object.values(error.response.data).flat().join(' ') : t('stock.returnCorrectionFailed', 'Unable to save the correction.'));
    } finally { setSavingCorrection(false); }
  };
  const [historyItem, setHistoryItem] = useState<PackingReturn | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data, isLoading } = useFetchObjects<{ results: PackingReturn[]; count: number }>({
    queryKey: ['returned-for-packing', String(page), search],
    endpoint: 'stocks/returned-for-packing/', params: { page, page_size: 25, search },
  });
  const columns: TableColumn<PackingReturn>[] = [
    { key: 'id', title: '#', render: value => `RET-${value}` },
    { key: 'product_name', title: t('stock.product') },
    { key: 'bottle_count', title: t('stock.returnedQuantity', 'Returned bottles') },
    { key: 'packed_bottle_count', title: t('stock.repackedQuantity', 'Packed again') },
    { key: 'remaining_bottle_count', title: t('stock.remainingReturned', 'Remaining for packing') },
    { key: 'unit_cost_afn', title: t('stock.pricePerBottle', 'Price per bottle'), render: value => `${Number(value).toLocaleString()} AFN` },
    { key: 'stock_value_afn', title: t('stock.totalValue'), render: value => `${Number(value).toLocaleString()} AFN` },
    { key: 'expire_date', title: t('stock.expireDate'), render: value => value ? <ListDate value={value} /> : '—' },
    { key: 'first_returned_at', title: t('stock.firstReturnDate', 'First returned'), render: value => <ListDate value={value} /> },
    { key: 'last_returned_at', title: t('stock.lastReturnDate', 'Last returned'), render: value => <ListDate value={value} /> },
    { key: 'inventory_moved', title: t('common.status', 'Status'), render: (value, row) => !value
      ? t('stock.returnHistoryOnly', 'Previous history only')
      : row.remaining_bottle_count > 0 ? (row.is_available ? t('stock.awaitingPacking', 'Awaiting packing') : t('stock.expired', 'Expired')) : t('stock.returnPackingComplete', 'Packed') },

  ];
  const actions: TableAction<PackingReturn>[] = [{ key: 'edit', label: t('common.edit'), icon: <Pencil className="h-4 w-4" />, onClick: record => { setEditingItem(record); setCorrectedCount(String(record.bottle_count)); setCorrectionNotes(''); } }, { key: 'history', label: t('stock.returnHistory', 'Return history'), icon: <History className="h-4 w-4" />, onClick: setHistoryItem }, { key: 'stock', label: t('common.view'), icon: <Eye className="h-4 w-4" />, onClick: record => navigate(`/stock/${record.stock}`) }, { key: 'pack', label: t('stock.packReturned', 'Pack returned bottles'),
    icon: <PackageCheck className="h-4 w-4" />,
    onClick: record => navigate(`/packing/add?returned=${record.id}`),
    show: record => record.is_available,
  }];
  return <div className="p-4 sm:p-6 space-y-4">
    <DataTable data={data?.results || []} columns={columns} rowActions={actions} loading={isLoading}
      title={t('stock.returnedForPacking', 'Returned for Packing')} icon={<RotateCcw className="h-5 w-5" />}
      subtitle={t('stock.returnedStockHint', 'One balance per bottle item. Each return date and quantity is saved in its history.')}
      headerActions={<Button variant="outline" onClick={() => navigate('/stock')}>{t('stock.allStockItems')}</Button>}
      searchable searchValue={search} onSearch={value => { setSearch(value); setPage(1); }}
      pagination={{ current: page, pageSize: 25, total: data?.count || 0, onPageChange: setPage }}
    />
    <Dialog open={!!editingItem} onOpenChange={open => { if (!open && !savingCorrection) setEditingItem(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('stock.editReturnedQuantity', 'Correct returned quantity')} · {editingItem?.product_name}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{editingItem?.inventory_moved ? t('stock.returnCorrectionHint', 'Enter the corrected total returned, including bottles already packed. Reductions move unused bottles back to stock; increases take the extra bottles from stock.') : t('stock.historyCorrectionHint', 'This is a history-only entry. Correcting it does not move stock.')}</p>
        <p className="text-sm">{t('stock.repackedQuantity')}: {editingItem?.packed_bottle_count || 0}</p>
        <Label htmlFor="corrected-return-count">{t('stock.correctedReturnTotal', 'Correct total returned')}</Label>
        <Input id="corrected-return-count" type="number" min={editingItem?.packed_bottle_count || 0} max="99999999" step="1" value={correctedCount} onChange={event => setCorrectedCount(event.target.value)} />
        <p className="text-sm">{t('stock.remainingReturned')}: {editingItem?.inventory_moved ? Math.max(0, Number(correctedCount || 0) - (editingItem.packed_bottle_count || 0)) : 0}</p>
        <Label htmlFor="return-correction-notes">{t('stock.correctionReason', 'Reason for correction')}</Label>
        <Textarea id="return-correction-notes" value={correctionNotes} onChange={event => setCorrectionNotes(event.target.value)} />
        <Button disabled={savingCorrection} onClick={saveCorrection}>{t('common.save')}</Button>
      </DialogContent>
    </Dialog>
    <Dialog open={!!historyItem} onOpenChange={open => { if (!open) setHistoryItem(null); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t('stock.returnHistory', 'Return history')} · {historyItem?.product_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">{historyItem?.return_events.map(event => <div key={event.id} className="rounded border p-3 text-sm space-y-1">
          <p><ListDate value={event.returned_at} /> · <bdi>{new Date(event.returned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</bdi> · {event.event_type === 'correction' ? `${(event.quantity_change || 0) > 0 ? '+' : ''}${event.quantity_change}` : event.bottle_count} {t('stock.bottleUnits')}</p>
          {event.event_type === 'correction' && <p>{t('stock.returnCorrection', 'Quantity correction')}: {event.previous_total} → {event.corrected_total}</p>}
          {!event.inventory_moved && <p className="text-muted-foreground">{t('stock.returnHistoryOnly')}</p>}
          {event.notes && <p>{event.notes}</p>}
        </div>)}</div>
        {!!historyItem?.packing_runs.length && <div className="border-t pt-3 space-y-2"><p className="font-semibold">{t('packing.title')}</p>{historyItem.packing_runs.map(run => <Button key={run.id} variant="link" className="h-auto p-0 block" onClick={() => navigate(`/packing/${run.id}`)}>{run.packing_number} · {run.bottle_count} {t('stock.bottleUnits')}</Button>)}</div>}
      </DialogContent>
    </Dialog>
  </div>;
}
