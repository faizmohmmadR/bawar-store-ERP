import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Droplets } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/api/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import type { StorageTankLeak } from '@/types/storageTankLeak';

type Props = {
  tankId: number;
  tankName?: string;
  availableKg?: string | number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: StorageTankLeak | null;
};

export function TankLeakDialog({
  tankId,
  tankName,
  availableKg,
  open,
  onOpenChange,
  editing = null,
}: Props) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const isEdit = Boolean(editing?.id);
  const [quantityKg, setQuantityKg] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuantityKg('');
      setNotes('');
      return;
    }
    if (editing) {
      setQuantityKg(String(editing.quantity_kg ?? ''));
      setNotes(editing.notes || '');
    } else {
      setQuantityKg('');
      setNotes('');
    }
  }, [open, editing]);

  const available = Number(availableKg);
  const qty = Number(quantityKg);
  const canSave = Number.isFinite(qty) && qty > 0 && (!Number.isFinite(available) || qty <= available + (isEdit ? Number(editing?.quantity_kg || 0) : 0));

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = {
        storage_tank: tankId,
        quantity_kg: qty,
        notes: notes.trim(),
      };
      if (isEdit && editing?.id) {
        await api.patch(`/storage-tank-leaks/${editing.id}/`, payload);
        toast.success(t('rawMaterialProcesses.tankLeakUpdated', 'Leak record updated'));
      } else {
        await api.post('/storage-tank-leaks/', payload);
        toast.success(t('rawMaterialProcesses.tankLeakSaved', 'Leak recorded as damaged liquid'));
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['storage-tanks'] }),
        queryClient.invalidateQueries({ queryKey: ['storage-tank', String(tankId)] }),
        queryClient.invalidateQueries({ queryKey: ['storage-tank-leaks'] }),
        queryClient.invalidateQueries({ queryKey: ['damaged-materials'] }),
        queryClient.invalidateQueries({ queryKey: ['damaged-material'] }),
      ]);
      onOpenChange(false);
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { quantity_kg?: string[] | string; detail?: string } } })?.response?.data;
      const message = Array.isArray(detail?.quantity_kg)
        ? detail.quantity_kg[0]
        : detail?.quantity_kg || detail?.detail || t('rawMaterialProcesses.tankLeakSaveFailed', 'Could not save the leak.');
      toast.error(String(message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Droplets className="h-4 w-4 text-destructive" />
            {isEdit
              ? t('rawMaterialProcesses.editTankLeak', 'Edit leaked amount')
              : t('rawMaterialProcesses.recordTankLeak', 'Record leaked liquid')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {tankName
              ? `${t('rawMaterialProcesses.tankLeakHelp', 'Enter leaked kg. It is saved under Damaged materials and removed from this tank.')} (${tankName})`
              : t('rawMaterialProcesses.tankLeakHelp', 'Enter leaked kg. It is saved under Damaged materials and removed from this tank.')}
          </p>
          {Number.isFinite(available) && (
            <p className="text-xs text-muted-foreground">
              {t('rawMaterialProcesses.availableKg', 'Available (kg)')}:{' '}
              <span className="font-medium tabular-nums text-foreground">
                {available.toLocaleString(undefined, { maximumFractionDigits: 4 })} kg
              </span>
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="leak-kg">{t('rawMaterialProcesses.leakedKg', 'Leaked amount (kg)')} *</Label>
            <Input
              id="leak-kg"
              type="number"
              min="0"
              step="0.0001"
              value={quantityKg}
              onChange={(e) => setQuantityKg(e.target.value)}
              placeholder="0.0000"
              className="tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="leak-notes">{t('common.notes', 'Notes')}</Label>
            <Textarea
              id="leak-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={t('rawMaterialProcesses.tankLeakNotesPlaceholder', 'Optional notes about this leak')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={save} disabled={saving || !canSave}>
            {saving ? t('common.saving', 'Saving…') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
