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

const REMOVAL_CATEGORIES = [
  { value: 'owner_withdrawal', labelKey: 'cashRegister.categories.owner_withdrawal' },
  { value: 'bank_deposit', labelKey: 'cashRegister.categories.bank_deposit' },
  { value: 'other_payment', labelKey: 'cashRegister.categories.other_payment' },
] as const;

type CountLine = { denomination: string; quantity: string };

export default function CloseCashSession() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [differenceReason, setDifferenceReason] = useState('');
  const [notes, setNotes] = useState('');
  const [manualActual, setManualActual] = useState('');
  const [useCount, setUseCount] = useState(true);
  const [removalAmount, setRemovalAmount] = useState('');
  const [removalCategory, setRemovalCategory] = useState('owner_withdrawal');
  const [removalDesc, setRemovalDesc] = useState('');
  const [countLines, setCountLines] = useState<CountLine[]>([]);

  const { data, isLoading } = useFetchObjects<{
    has_open_session: boolean;
    open_session: any;
    totals: Record<string, string> | null;
    denominations: string[];
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

  const expected = Number(data?.totals?.expected_closing_balance || 0);
  const actual = useCount ? countedTotal : Number(manualActual || 0);
  const difference = actual - expected;
  const removal = Number(removalAmount || 0);
  const carry = Math.max(0, actual - removal);

  const setQty = (idx: number, qty: string) => {
    setCountLines((prev) => prev.map((row, i) => (i === idx ? { ...row, quantity: qty } : row)));
  };

  const handleClose = async () => {
    if (!data?.has_open_session) return;
    if (difference !== 0 && !differenceReason.trim()) {
      toast.error(t('cashRegister.differenceReasonRequired'));
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
        difference_reason: differenceReason,
        notes,
      };
      if (useCount) {
        payload.count_lines = countLines
          .filter((r) => Number(r.quantity) > 0)
          .map((r) => ({
            denomination: r.denomination,
            quantity: Number(r.quantity),
          }));
      }
      if (removal > 0) {
        payload.removals = [
          {
            category: removalCategory,
            amount: String(removal),
            description: removalDesc || undefined,
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
      toast.error(typeof msg === 'string' ? msg : Array.isArray(msg) ? msg[0] : t('cashRegister.closeFailed'));
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
          <p className="text-sm text-muted-foreground">{data.open_session?.session_number}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm text-muted-foreground">{t('cashRegister.balance')}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-primary">{formatAfn(expected)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('cashRegister.balanceFormula')}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">{t('cashRegister.countedCash')}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatAfn(actual)}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">
            {difference === 0
              ? t('cashRegister.difference')
              : difference < 0
                ? t('cashRegister.shortage')
                : t('cashRegister.overage')}
          </p>
          <p
            className={`mt-1 text-2xl font-semibold tabular-nums ${
              difference === 0 ? '' : difference < 0 ? 'text-rose-700' : 'text-amber-700'
            }`}
          >
            {formatAfn(Math.abs(difference))}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant={useCount ? 'default' : 'outline'}
          size="sm"
          onClick={() => setUseCount(true)}
        >
          {t('cashRegister.countByDenomination')}
        </Button>
        <Button
          variant={!useCount ? 'default' : 'outline'}
          size="sm"
          onClick={() => setUseCount(false)}
        >
          {t('cashRegister.enterTotal')}
        </Button>
      </div>

      {useCount ? (
        <div className="space-y-2 rounded-lg border p-4">
          {countLines.map((row, idx) => (
            <div key={row.denomination} className="grid grid-cols-3 items-center gap-3">
              <Label className="tabular-nums">{formatAfn(Number(row.denomination))}</Label>
              <Input
                type="number"
                min="0"
                value={row.quantity}
                onChange={(e) => setQty(idx, e.target.value)}
                placeholder="0"
              />
              <p className="text-sm tabular-nums text-muted-foreground">
                {formatAfn(Number(row.denomination) * Number(row.quantity || 0))}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <Label>{t('cashRegister.countedCash')}</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={manualActual}
            onChange={(e) => setManualActual(e.target.value)}
          />
        </div>
      )}

      {difference !== 0 && (
        <div className="space-y-2">
          <Label>{t('cashRegister.differenceReason')}</Label>
          <Textarea
            value={differenceReason}
            onChange={(e) => setDifferenceReason(e.target.value)}
            rows={2}
            required
          />
        </div>
      )}

      <div className="space-y-3 rounded-lg border p-4">
        <p className="font-medium">{t('cashRegister.removeAtClose')}</p>
        <p className="text-xs text-muted-foreground">{t('cashRegister.removeAtCloseHint')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('cashRegister.amount')}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={removalAmount}
              onChange={(e) => setRemovalAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('cashRegister.category')}</Label>
            <Select value={removalCategory} onValueChange={setRemovalCategory}>
              <SelectTrigger>
                <SelectValue />
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
          <Label>{t('cashRegister.description')}</Label>
          <Input value={removalDesc} onChange={(e) => setRemovalDesc(e.target.value)} />
        </div>
        <p className="text-sm">
          {t('cashRegister.carryForward')}:{' '}
          <strong className="tabular-nums">{formatAfn(carry)}</strong>
        </p>
      </div>

      <div className="space-y-2">
        <Label>{t('cashRegister.notes')}</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      <Button className="w-full sm:w-auto" onClick={handleClose} disabled={submitting}>
        <Lock className="mr-2 h-4 w-4" />
        {submitting ? t('common.saving') : t('cashRegister.confirmClose')}
      </Button>
    </div>
  );
}
