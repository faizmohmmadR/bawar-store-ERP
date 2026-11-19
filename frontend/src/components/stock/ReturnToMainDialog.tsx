import { useEffect, useMemo, useState } from 'react';
import { Warehouse } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import useAdd from '@/api/useAdd';
import { useLanguage } from '@/contexts/LanguageContext';
import { ORDER_NUMERIC_STEP } from '@/lib/orderNumeric';
import {
  DEFAULT_PIECES_PER_CARTON,
  cartonsFromPieces,
  piecesFromCartons,
  remainderPieces,
  totalPiecesFromCartonsAndLoose,
} from '@/lib/packaging';

export type ReturnToMainTarget = {
  stockId?: number | string | null;
  batchId?: number | string | null;
  productName?: string;
  bottlesPerCarton?: number;
  branchName?: string;
  availablePieces: number;
  reason?: 'expired' | 'damaged' | 'other';
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ReturnToMainTarget | null;
  onSuccess?: () => void;
};

export function ReturnToMainDialog({ open, onOpenChange, target, onSuccess }: Props) {
  const { t } = useLanguage();
  const [cartonAmount, setCartonAmount] = useState('');
  const [pieceAmount, setPieceAmount] = useState('');
  const [notes, setNotes] = useState('');

  const available = target?.availablePieces ?? 0;
  const cartonSize = target?.bottlesPerCarton || DEFAULT_PIECES_PER_CARTON;

  useEffect(() => {
    if (!open || !target) return;
    // Prefill from available qty without rewriting as user types later
    setCartonAmount(
      String(cartonsFromPieces(available, cartonSize) || ''),
    );
    setPieceAmount(
      String(remainderPieces(available, cartonSize) || ''),
    );
    setNotes('');
  }, [open, target, available, cartonSize]);

  const cartons = parseFloat(cartonAmount || '') || 0;
  const loose = parseFloat(pieceAmount || '') || 0;
  const totalPieces = useMemo(
    () => totalPiecesFromCartonsAndLoose(cartons, loose, cartonSize),
    [cartons, loose, cartonSize],
  );
  const autoFromCartons = piecesFromCartons(cartons, cartonSize);

  const exceeds = totalPieces > available && available > 0;
  const canSubmit = totalPieces > 0 && !exceeds && !!target;

  const { handleAdd, loading, isSuccess } = useAdd({
    queryKey: ['stocks', 'stocks-expiring', 'inventory-batches'],
    customSuccessMessage: t(
      'stock.returnedToMainSuccess',
      'Stock returned to main branch successfully',
    ),
  });

  useEffect(() => {
    if (!isSuccess) return;
    onOpenChange(false);
    onSuccess?.();
  }, [isSuccess, onOpenChange, onSuccess]);

  const onSubmit = () => {
    if (!target || !canSubmit) return;

    const payload: Record<string, unknown> = {
      piece_amount: totalPieces,
      notes: notes.trim() || undefined,
      reason: target.reason || undefined,
    };

    if (target.batchId) {
      handleAdd(payload, `inventory-batches/${target.batchId}/return_to_main/`);
      return;
    }

    if (target.stockId) {
      handleAdd(payload, `stocks/${target.stockId}/return_to_main/`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Warehouse className="h-5 w-5" />
            {t('stock.returnToMain', 'Return to Main Branch')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'stock.returnToMainHint',
              'Moves this lot from the branch warehouse into main stock (same condition: damaged / expired). Inventory accounts are updated as an inter-branch transfer.',
            )}
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="space-y-4">
            <div className="rounded-md border border-border/60 px-3 py-2 text-sm">
              <div className="font-medium">{target.productName || '—'}</div>
              {target.branchName && (
                <div className="text-muted-foreground text-xs mt-0.5">
                  {t('stock.fromBranch', 'From')}: {target.branchName}
                </div>
              )}
              <div className="text-xs mt-1 tabular-nums">
                {t('stock.available', 'Available')}:{' '}
                <span className="font-semibold">{available}</span>{' '}
                {t('stock.piece', 'pcs')}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('stock.carton', 'Cartons')} *</Label>
                <Input
                  type="number"
                  min="0"
                  step={ORDER_NUMERIC_STEP}
                  value={cartonAmount}
                  onChange={(e) => setCartonAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('stock.piecesAutoHint', 'Auto: 1 carton = 8 pieces')}
                  {cartons > 0 && (
                    <span className="font-medium text-foreground">
                      {' '}→ {autoFromCartons} {t('stock.piece', 'pcs')}
                    </span>
                  )}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>{t('stock.loosePiecesOptional', 'Extra loose pieces (optional)')}</Label>
                <Input
                  type="number"
                  min="0"
                  step={ORDER_NUMERIC_STEP}
                  value={pieceAmount}
                  onChange={(e) => setPieceAmount(e.target.value)}
                />
              </div>
            </div>

            {totalPieces > 0 && (
              <p className="text-sm tabular-nums">
                {t('stock.totalPieces', 'Total pieces')}:{' '}
                <span className={`font-semibold ${exceeds ? 'text-destructive' : ''}`}>
                  {totalPieces}
                </span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  {t(
                    'stock.qtyManualHint',
                    'Total = (cartons × 8) + loose pieces. Fields are not auto-rewritten.',
                  )}
                </span>
              </p>
            )}

            {exceeds && (
              <p className="text-sm text-destructive">
                {t('stock.notEnoughStock', 'Not enough stock available')}
              </p>
            )}

            <div className="space-y-1.5">
              <Label>{t('stock.notes', 'Notes')}</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t(
                  'stock.returnToMainNotesPlaceholder',
                  'Optional note for this return…',
                )}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={onSubmit} disabled={!canSubmit || loading}>
            {loading
              ? t('common.saving', 'Saving...')
              : t('stock.returnToMain', 'Return to Main Branch')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ReturnToMainDialog;
