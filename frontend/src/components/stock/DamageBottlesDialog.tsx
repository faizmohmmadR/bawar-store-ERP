import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertOctagon } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/api/client';
import useFetchObjects from '@/api/useFetchObjects';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import type { StorageTank } from '@/types/storage-tank';
import type { StockBottleDamage } from '@/types/stockBottleDamage';

type Preview = {
  stock: number;
  product: number;
  product_name: string;
  on_hand_bottles: number;
  capacity_kg: string;
  capacity_liters: string;
  density_kg_per_liter: string;
  liquid_unit_cost_afn: string;
};

type Props = {
  stockId: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
  /** When set, dialog edits this history row instead of creating a new one. */
  editing?: StockBottleDamage | null;
};

function num(value: string | number | undefined | null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asTankList(data: StorageTank[] | { results?: StorageTank[] } | undefined): StorageTank[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return Array.isArray(data.results) ? data.results : [];
}

export function DamageBottlesDialog({
  stockId,
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
  editing = null,
}: Props) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => {
    setInternalOpen(value);
    onOpenChange?.(value);
  };
  const isEdit = Boolean(editing?.id);

  const [bottleCount, setBottleCount] = useState('');
  const [remainingKg, setRemainingKg] = useState('');
  const [tankId, setTankId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const previewQuery = useFetchObjects<Preview>({
    queryKey: ['stock-damage-bottles-preview', String(stockId)],
    endpoint: `stocks/${stockId}/damage-bottles`,
    enabled: open && !!stockId,
    options: { staleTime: 0 },
  });
  const preview = previewQuery.data;

  const tanksQuery = useFetchObjects<StorageTank[] | { results: StorageTank[] }>({
    queryKey: ['storage-tanks', 'damage-bottles'],
    endpoint: 'storage-tanks',
    params: { page_size: 200 },
    enabled: open,
    options: { staleTime: 30_000 },
  });
  const tanks = asTankList(tanksQuery.data);
  const selectedTank = tanks.find((tank) => String(tank.id) === tankId);

  useEffect(() => {
    if (!open) {
      setBottleCount('');
      setRemainingKg('');
      setTankId('');
      setNotes('');
      return;
    }
    if (editing) {
      setBottleCount(String(editing.bottle_count || ''));
      setRemainingKg(String(editing.remaining_liquid_kg ?? ''));
      setTankId(editing.storage_tank ? String(editing.storage_tank) : '');
      setNotes(editing.notes || '');
    }
  }, [open, editing]);

  const bottles = Math.max(0, Math.floor(num(bottleCount)));
  const capacityKg = num(editing?.capacity_kg ?? preview?.capacity_kg);
  const totalLiquidKg = Number((bottles * capacityKg).toFixed(4));
  const remaining = Math.max(0, num(remainingKg));
  const damagedKg = Math.max(0, Number((totalLiquidKg - remaining).toFixed(4)));
  const unitCost = num(editing?.liquid_unit_cost_afn ?? preview?.liquid_unit_cost_afn);
  const damagedCost = Number((damagedKg * unitCost).toFixed(2));
  // Editing reverses first, so previous bottles become available again.
  const maxBottles = isEdit
    ? Number(preview?.on_hand_bottles || 0) + Number(editing?.bottle_count || 0)
    : Number(preview?.on_hand_bottles || 0);

  const remainingInvalid = remaining > totalLiquidKg + 1e-9;
  const needsTank = remaining > 0;
  const canSubmit = useMemo(() => {
    if ((!preview && !editing) || saving) return false;
    if (!Number.isSafeInteger(bottles) || bottles <= 0) return false;
    if (bottles > maxBottles) return false;
    if (remainingInvalid) return false;
    if (needsTank && !tankId) return false;
    return true;
  }, [preview, editing, saving, bottles, maxBottles, remainingInvalid, needsTank, tankId]);

  const submit = async () => {
    if (!canSubmit) {
      toast.error(t('stock.damageBottlesInvalid', 'Check bottle count, remaining liquid, and storage tank.'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        bottle_count: bottles,
        remaining_liquid_kg: remaining,
        storage_tank: needsTank ? Number(tankId) : null,
        notes,
      };
      const response = isEdit
        ? await api.patch(`stock-bottle-damages/${editing!.id}/`, payload)
        : await api.post(`stocks/${stockId}/damage-bottles/`, payload);
      await Promise.all([
        'stock',
        'stocks',
        'storage-tanks',
        'damaged-materials',
        'stock-damage-bottles-preview',
        'stock-bottle-damages',
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      setOpen(false);
      const damagedNumber = response.data?.damaged_number;
      toast.success(
        isEdit
          ? t('stock.damageBottlesUpdated', 'Bottle damage updated.')
          : damagedNumber
            ? t('stock.damageBottlesSuccessWithDamaged', {
                number: damagedNumber,
                defaultValue: `Bottles damaged. Spilled liquid saved as ${damagedNumber}.`,
              })
            : t('stock.damageBottlesSuccess', 'Bottles damaged. Remaining liquid returned to storage.'),
      );
    } catch (error) {
      const detail = (error as { response?: { data?: unknown } }).response?.data;
      const message =
        typeof detail === 'object' && detail && 'detail' in detail
          ? String((detail as { detail: unknown }).detail)
          : detail
            ? JSON.stringify(detail)
            : t('stock.damageBottlesFailed', 'Unable to record bottle damage.');
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const productName = editing?.product_name || preview?.product_name || '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <AlertOctagon className="h-4 w-4" />
            {t('stock.damageBottles', 'Damage bottles')}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        className="max-h-[90vh] max-w-lg overflow-y-auto"
        onPointerDownOutside={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest('[data-radix-select-content], [data-radix-popper-content-wrapper]')) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest('[data-radix-select-content], [data-radix-popper-content-wrapper]')) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t('stock.editBottleDamage', 'Edit bottle damage')
              : t('stock.damageBottles', 'Damage bottles')}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t(
            'stock.damageBottlesHint',
            'Enter how many bottles broke. Total liquid is calculated from capacity. Enter liquid still in the bottles to return to a tank; the rest is recorded as damaged liquid with its price.',
          )}
        </p>

        {previewQuery.isLoading && !editing ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : previewQuery.isError && !editing ? (
          <p className="text-sm text-destructive">
            {t('stock.damageBottlesPreviewError', 'Could not load bottle capacity for this stock item.')}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <p className="font-medium">{productName}</p>
              <p className="text-muted-foreground">
                {t('stock.onHandQuantity')}: {maxBottles} {t('stock.bottleUnits', 'bottles')}
                {' · '}
                {t('stock.itemCapacity', 'Item capacity')}: {capacityKg.toLocaleString()} kg
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="damage-bottle-count">{t('stock.damagedBottleCount', 'Damaged bottles')}</Label>
              <Input
                id="damage-bottle-count"
                type="number"
                min={1}
                step={1}
                max={maxBottles || undefined}
                value={bottleCount}
                onChange={(event) => setBottleCount(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-md border px-3 py-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t('stock.totalLiquid', 'Total liquid')}</p>
                <p className="font-semibold tabular-nums">{totalLiquidKg.toLocaleString()} kg</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('stock.damagedLiquid', 'Damaged liquid')}</p>
                <p className="font-semibold tabular-nums text-destructive">
                  {damagedKg.toLocaleString()} kg
                  {unitCost > 0 && (
                    <span className="ms-1 text-xs font-normal text-muted-foreground">
                      ≈ {damagedCost.toLocaleString()} AFN
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="damage-remaining">
                {t('stock.remainingLiquid', 'Remaining liquid (kg)')}
              </Label>
              <Input
                id="damage-remaining"
                type="number"
                min={0}
                step="0.0001"
                max={totalLiquidKg || undefined}
                value={remainingKg}
                onChange={(event) => setRemainingKg(event.target.value)}
                placeholder="0"
              />
              {remainingInvalid && (
                <p className="text-xs text-destructive">
                  {t('stock.remainingExceedsTotal', 'Remaining liquid cannot exceed total liquid.')}
                </p>
              )}
            </div>

            {needsTank && (
              <div className="space-y-1.5">
                <Label htmlFor="damage-tank">{t('stock.returnStorageTank', 'Storage for remaining liquid')}</Label>
                <Select value={tankId || undefined} onValueChange={setTankId}>
                  <SelectTrigger id="damage-tank">
                    <SelectValue placeholder={t('stock.selectStorageTank', 'Select storage tank')} />
                  </SelectTrigger>
                  <SelectContent position="popper" className="z-[100]">
                    {tanksQuery.isLoading && (
                      <SelectItem value="__loading" disabled>
                        {t('common.loading')}
                      </SelectItem>
                    )}
                    {!tanksQuery.isLoading && tanks.length === 0 && (
                      <SelectItem value="__empty" disabled>
                        {t('common.noDataFound', 'No data found')}
                      </SelectItem>
                    )}
                    {tanks.map((tank) => (
                      <SelectItem key={tank.id} value={String(tank.id)}>
                        {tank.name}
                        {tank.available_kg != null && (
                          <span className="ms-1 text-muted-foreground">
                            · {num(tank.available_kg).toLocaleString()} kg
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTank && (
                  <p className="text-xs text-muted-foreground">{selectedTank.name}</p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="damage-notes">{t('stock.notes', 'Notes')}</Label>
              <Textarea
                id="damage-notes"
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={t('stock.damageBottlesNotesPlaceholder', 'Optional notes')}
              />
            </div>

            <Button className="w-full" disabled={!canSubmit} onClick={submit}>
              {saving
                ? t('common.saving', 'Saving…')
                : isEdit
                  ? t('common.update', 'Update')
                  : t('stock.confirmDamageBottles', 'Record bottle damage')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
