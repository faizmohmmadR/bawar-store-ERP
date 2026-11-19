import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/api/client';
import useFetchObjects from '@/api/useFetchObjects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';

type Entry = { id: number; bottle_count: number; remaining_bottle_count: number; inventory_moved: boolean; last_returned_at: string | null; created_at: string };
type Props = {
  stockId: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
  showHistory?: boolean;
};
export function ReturnToPack({ stockId, open: controlledOpen, onOpenChange, showTrigger = true, showHistory = true }: Props) {
  const { language } = useLanguage();
  const local = language === 'fa' || language === 'ps';
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => {
    setInternalOpen(value);
    onOpenChange?.(value);
  };
  const [count, setCount] = useState('');
  const [saving, setSaving] = useState(false);
  const { data: history } = useFetchObjects<Entry[]>({
    queryKey: ['packing-returns', String(stockId)], endpoint: `stocks/${stockId}/return-to-pack/`, enabled: showHistory,
  });
  const submit = async () => {
    if (!Number.isSafeInteger(Number(count)) || Number(count) <= 0) {
      toast.error(local ? 'تعداد صحیح بوتل را وارد کنید.' : 'Enter a positive whole bottle count.'); return;
    }
    setSaving(true);
    try {
      await api.post(`stocks/${stockId}/return-to-pack/`, { bottle_count: Number(count) });
      await Promise.all(['stock', 'stocks', 'packing-returns', 'returned-for-packing', 'packing-available-returns'].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
      setOpen(false); setCount('');
      toast.success(local ? 'برگشت بوتل ثبت شد.' : 'Bottle return recorded.');
    } catch (error) {
      const detail = (error as { response?: { data?: unknown } }).response?.data;
      toast.error(detail ? JSON.stringify(detail) : 'Unable to save repacking.');
    } finally { setSaving(false); }
  };
  return <div className="space-y-3">
    <Dialog open={open} onOpenChange={setOpen}>
      {showTrigger && <DialogTrigger asChild><Button variant="outline">Return to Pack {local && '— برگشت به بسته‌بندی'}</Button></DialogTrigger>}
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Return to Pack</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{local ? 'بوتل‌ها از استاک قابل فروش کم شده و به بخش برگشت به بسته‌بندی انتقال می‌شوند.' : 'Move filled bottles out of available stock into Returned for Packing. Choose them as a source in Packing later.'}</p>
        <Label htmlFor="repack-count">{local ? 'تعداد بوتل برای بسته‌بندی مجدد' : 'Bottles to repack'}</Label>
        <Input id="repack-count" type="number" min="1" step="1" value={count} onChange={e => setCount(e.target.value)} />
        <Button disabled={saving} onClick={submit}>{local ? 'ثبت برگشت بوتل' : 'Return bottles'}</Button>
      </DialogContent>
    </Dialog>
    {showHistory && !!history?.length && <div className="rounded border p-3 text-sm space-y-2">
      <p>{local ? 'سوابق برگشت به بسته‌بندی' : 'Return to Pack history'}</p>
      {history.map(row => <p key={row.id}>#{row.id} · {row.bottle_count} {local ? 'بوتل' : 'bottles'} · {row.inventory_moved ? `${row.remaining_bottle_count} ${local ? 'باقی‌مانده' : 'remaining'}` : (local ? 'سابقهٔ قبلی' : 'History only')} · {new Date(row.last_returned_at || row.created_at).toLocaleString()}</p>)}
    </div>}
  </div>;
}
