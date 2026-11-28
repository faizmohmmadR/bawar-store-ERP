import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import api from '@/api/client';
import { toast } from 'sonner';
import { formatAfn } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';

const REMOVAL_CATEGORIES = [
  { value: 'owner_withdrawal', labelKey: 'cashRegister.categories.owner_withdrawal' },
  { value: 'bank_deposit', labelKey: 'cashRegister.categories.bank_deposit' },
  { value: 'other_payment', labelKey: 'cashRegister.categories.other_payment' },
] as const;

type CountLine = { denomination: string; quantity: string };

/** Treat money as equal within 1 afghani (avoids float noise). */
const moneyDiffers = (a: number, b: number) => Math.round(a - b) !== 0;

function RequiredMark() {
  return <span className="ms-0.5 text-rose-600">*</span>;
}

export default function CloseCashSession() {
  const { t } = useLanguage();
  const { formatDateTime } = useFormatAppDate();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [differenceReason, setDifferenceReason] = useState('');
  const [notes, setNotes] = useState('');
  const [manualActual, setManualActual] = useState('');
  const [useCount, setUseCount] = useState(false);
  const [removalAmount, setRemovalAmount] = useState('');
  const [removalCategory, setRemovalCategory] = useState('owner_withdrawal');
  const [removalDesc, setRemovalDesc] = useState('');
  const [countLines, setCountLines] = useState<CountLine[]>([]);

  const { data, isLoading } = useFetchObjects<{
    has_open_session: boolean;
    open_session: any;
    totals: Record<string, string> | null;
    denominations: string[];
    book_cash_afn?: string | null;
  }>({
    queryKey: ['cash-register-dashboard-close'],
    endpoint: 'cash-register/dashboard/',
  });

  const dens = data?.denominations || ['1000', '500', '100', '50', '20', '10', '5', '2', '1'];

  useEffect(() => {
    if (dens.length && countLines.length === 0) {
      setCountLines(dens.map((d) => ({ denomination: d, quantity: '' })));
    }
  }, [dens, countLines.length]);

  const countedTotal = useMemo(() => {
    return countLines.reduce((sum, row) => {
      const q = Number(row.quantity || 0);
      const d = Number(row.denomination || 0);
      return sum + d * q;
    }, 0);
  }, [countLines]);

  // Expected = AFN Cash book (GL 1000); same as Cash Register / دخل.
  const expected = Number(
    data?.totals?.expected_closing_balance ?? data?.book_cash_afn ?? 0,
  );
  const actual = useCount ? countedTotal : Number(manualActual || 0);
  const hasCountedInput = useCount
    ? countLines.some((r) => Number(r.quantity) > 0)
    : manualActual.trim() !== '';
  // Difference stays 0 until the user enters counted cash (fields use placeholders only).
  const difference = hasCountedInput ? actual - expected : 0;
  const hasDifference = hasCountedInput && moneyDiffers(actual, expected);
  const removal = Number(removalAmount || 0);
  const hasRemoval = removal > 0;
  const carry = Math.max(0, actual - removal);

  const setQty = (idx: number, qty: string) => {
    setCountLines((prev) => prev.map((row, i) => (i === idx ? { ...row, quantity: qty } : row)));
  };

  const handleClose = async () => {
    if (!data?.has_open_session) return;
    if (!hasCountedInput) {
      toast.error(t('cashRegister.countedCashRequired'));
      return;
    }
    if (hasDifference && !differenceReason.trim()) {
      toast.error(t('cashRegister.differenceReasonRequired'));
      return;
    }
    if (hasRemoval && !removalCategory) {
      toast.error(t('cashRegister.removalCategoryRequired'));
      return;
    }
    if (removal > actual) {
      toast.error(t('cashRegister.removalExceeds'));
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        actual_closing_balance: String(actual),
        carry_forward_amount: String(carry),
        difference_reason: hasDifference ? differenceReason.trim() : '',
        notes: notes.trim(),
      };
      if (useCount) {
        payload.count_lines = countLines
          .filter((r) => Number(r.quantity) > 0)
          .map((r) => ({
            denomination: r.denomination,
            quantity: Number(r.quantity),
          }));
      }
      if (hasRemoval) {
        payload.removals = [
          {
            category: removalCategory,
            amount: String(removal),
            description: removalDesc.trim() || undefined,
          },
        ];
      }
      await api.post('cash-register/close-session/', payload);
      toast.success(t('cashRegister.sessionClosed'));
      queryClient.invalidateQueries({ queryKey: ['cash-register-dashboard'] });
      navigate('/cash-register');
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        Object.values(err?.response?.data || {})?.[0] ||
        t('cashRegister.closeFailed');
      toast.error(
        typeof msg === 'string' ? msg : Array.isArray(msg) ? msg[0] : t('cashRegister.closeFailed'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!data?.has_open_session) {
    return (
      <div className="space-y-4 p-6">
        <p>{t('cashRegister.noOpenSession')}</p>
        <Button variant="outline" onClick={() => navigate('/cash-register')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('common.back')}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/cash-register')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{t('cashRegister.closeSession')}</h1>
          <p className="text-sm text-muted-foreground">
            {data.open_session?.session_number}
            {data.open_session?.opened_at
              ? ` · ${t('cashRegister.openedAt')} ${formatDateTime(data.open_session.opened_at)}`
              : ''}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm text-muted-foreground">{t('cashRegister.balance')}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-primary">
            {formatAfn(expected)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t('cashRegister.balanceFormula')}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">{t('cashRegister.countedCash')}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatAfn(actual)}</p>
        </div>
        <div
          className={cn(
            'rounded-xl border p-4',
            hasDifference && (difference < 0 ? 'border-rose-200 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60'),
          )}
        >
          <p className="text-sm text-muted-foreground">
            {!hasDifference
              ? t('cashRegister.difference')
              : difference < 0
                ? t('cashRegister.shortage')
                : t('cashRegister.overage')}
          </p>
          <p
            className={cn(
              'mt-1 text-2xl font-semibold tabular-nums',
              hasDifference && (difference < 0 ? 'text-rose-700' : 'text-amber-700'),
            )}
          >
            {formatAfn(Math.abs(difference))}
          </p>
        </div>
      </div>

      <section className="space-y-3 rounded-xl border p-4">
        <div>
          <h2 className="font-medium">{t('cashRegister.countSectionTitle')}</h2>
          <p className="text-xs text-muted-foreground">{t('cashRegister.countSectionHint')}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={useCount ? 'default' : 'outline'}
            size="sm"
            onClick={() => setUseCount(true)}
          >
            {t('cashRegister.countByDenomination')}
          </Button>
          <Button
            type="button"
            variant={!useCount ? 'default' : 'outline'}
            size="sm"
            onClick={() => setUseCount(false)}
          >
            {t('cashRegister.enterTotal')}
          </Button>
        </div>

        {useCount ? (
          <div className="space-y-2">
            <Label>
              {t('cashRegister.countedCash')}
              <RequiredMark />
            </Label>
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              {countLines.map((row, idx) => (
                <div key={row.denomination} className="grid grid-cols-3 items-center gap-3">
                  <Label className="tabular-nums">{formatAfn(Number(row.denomination))}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={row.quantity}
                    onChange={(e) => setQty(idx, e.target.value)}
                    placeholder={t('cashRegister.qtyPlaceholder')}
                  />
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {formatAfn(Number(row.denomination) * Number(row.quantity || 0))}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="counted-total">
              {t('cashRegister.countedCash')}
              <RequiredMark />
            </Label>
            <Input
              id="counted-total"
              type="number"
              min="0"
              step="1"
              value={manualActual}
              onChange={(e) => setManualActual(e.target.value)}
              placeholder={t('cashRegister.countedCashPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">{t('cashRegister.countedCashHelp')}</p>
          </div>
        )}

        {hasDifference ? (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <Label htmlFor="difference-reason">
              {t('cashRegister.differenceReason')}
              <RequiredMark />
            </Label>
            <Textarea
              id="difference-reason"
              value={differenceReason}
              onChange={(e) => setDifferenceReason(e.target.value)}
              rows={2}
              placeholder={t('cashRegister.differenceReasonPlaceholder')}
              required
            />
            <p className="text-xs text-muted-foreground">
              {t('cashRegister.differenceReasonHelp')}
            </p>
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-xl border p-4">
        <div>
          <h2 className="font-medium">{t('cashRegister.removeAtClose')}</h2>
          <p className="text-xs text-muted-foreground">{t('cashRegister.removeAtCloseHint')}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="removal-amount">
              {t('cashRegister.amount')}
              {hasRemoval ? <RequiredMark /> : null}
            </Label>
            <Input
              id="removal-amount"
              type="number"
              min="0"
              step="1"
              value={removalAmount}
              onChange={(e) => setRemovalAmount(e.target.value)}
              placeholder={t('cashRegister.removalAmountPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label>
              {t('cashRegister.category')}
              {hasRemoval ? <RequiredMark /> : null}
            </Label>
            <Select value={removalCategory} onValueChange={setRemovalCategory}>
              <SelectTrigger>
                <SelectValue placeholder={t('cashRegister.removalCategoryPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {REMOVAL_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {t(c.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="removal-note">{t('cashRegister.description')}</Label>
          <Input
            id="removal-note"
            value={removalDesc}
            onChange={(e) => setRemovalDesc(e.target.value)}
            placeholder={t('cashRegister.removalNotePlaceholder')}
          />
        </div>

        <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
          {t('cashRegister.carryForward')}:{' '}
          <strong className="tabular-nums">{formatAfn(carry)}</strong>
        </p>
      </section>

      <section className="space-y-2">
        <Label htmlFor="close-notes">{t('cashRegister.notes')}</Label>
        <Textarea
          id="close-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder={t('cashRegister.closeNotesPlaceholder')}
        />
      </section>

      <Button className="w-full sm:w-auto" onClick={handleClose} disabled={submitting}>
        <Lock className="mr-2 h-4 w-4" />
        {submitting ? t('common.saving') : t('cashRegister.confirmClose')}
      </Button>
    </div>
  );
}
