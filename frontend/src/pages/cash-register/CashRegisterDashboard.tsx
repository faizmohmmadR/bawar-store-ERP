import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Banknote, Lock, Unlock, List, AlertTriangle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import DataTable, { TableColumn } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import api from '@/api/client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { formatAfn } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import { cashCategoryBadgeClass, cashCategoryLabel } from './i18nHelpers';

type DashboardPayload = {
  register: { id: number; name: string; code: string; linked_cash_account_code?: string };
  open_session: any | null;
  has_open_session: boolean;
  previous_carry_forward?: string | null;
  has_previous_session?: boolean;
  totals: Record<string, string> | null;
};

type Txn = {
  id: number;
  transaction_date: string;
  category: string;
  description: string | null;
  cash_in: string;
  cash_out: string;
};

const num = (v: string | number | null | undefined) => Number(v || 0);

function MoneyBlock({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'in' | 'out' | 'balance';
  hint?: string;
}) {
  const toneClass =
    tone === 'in'
      ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800'
      : tone === 'out'
        ? 'border-rose-200 bg-rose-50/60 text-rose-800'
        : tone === 'balance'
          ? 'border-primary/30 bg-primary/5 text-primary'
          : 'border-border bg-card text-foreground';

  return (
    <div className={`rounded-xl border p-4 sm:p-5 ${toneClass}`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
        {formatAfn(value)}
      </p>
      {hint ? <p className="mt-1 text-xs opacity-70">{hint}</p> : null}
    </div>
  );
}

function Breakdown({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: { label: string; value: number }[];
  tone: 'in' | 'out';
}) {
  const visible = rows.filter((r) => r.value > 0);
  if (!visible.length) return null;
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="mb-3 text-sm font-medium text-muted-foreground">{title}</p>
      <ul className="space-y-2">
        {visible.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
            <span>{row.label}</span>
            <span
              className={`font-medium tabular-nums ${
                tone === 'in' ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {tone === 'in' ? '+' : '−'}
              {formatAfn(row.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CashRegisterDashboard() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [depositDialog, setDepositDialog] = useState(false);
  const [openingDeposit, setOpeningDeposit] = useState('');
  const [midDayDeposit, setMidDayDeposit] = useState('');
  const [depositNote, setDepositNote] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useFetchObjects<DashboardPayload>({
    queryKey: ['cash-register-dashboard'],
    endpoint: 'cash-register/dashboard/',
  });

  const sessionId = data?.open_session?.id;
  const { data: txnData, isLoading: txnLoading } = useFetchObjects<{
    results: Txn[];
    count: number;
  }>({
    queryKey: ['cash-register-txns', String(sessionId || ''), String(page), searchTerm],
    endpoint: 'cash-register/transactions/',
    params: {
      page,
      page_size: 25,
      current: '1',
      ...(sessionId ? { session: sessionId } : {}),
      ...(searchTerm ? { search: searchTerm } : {}),
    },
    enabled: Boolean(data?.has_open_session),
  });

  const totals = data?.totals;
  const opening = num(totals?.opening_balance);
  const income = num(totals?.total_cash_in);
  const outcome = num(totals?.total_cash_out);
  const balance = num(totals?.expected_closing_balance);

  const carriedFromYesterday = num(data?.previous_carry_forward);
  const depositNow = num(openingDeposit);
  const openingTotal = carriedFromYesterday + depositNow;
  const hasPreviousSession = Boolean(data?.has_previous_session);

  const handleOpenSession = async () => {
    if (!hasPreviousSession && depositNow <= 0) {
      toast.error(t('cashRegister.depositRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        notes,
        opening_deposit: String(depositNow || 0),
      };
      // First day: also send opening_balance for compatibility
      if (!hasPreviousSession) {
        body.opening_balance = String(depositNow || 0);
      }
      await api.post('cash-register/open-session/', body);
      toast.success(t('cashRegister.sessionOpened'));
      setOpenDialog(false);
      setOpeningDeposit('');
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['cash-register-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register-txns'] });
      refetch();
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.non_field_errors?.[0] ||
        Object.values(err?.response?.data || {})?.[0] ||
        t('cashRegister.openFailed');
      toast.error(typeof msg === 'string' ? msg : t('cashRegister.openFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDepositCash = async () => {
    const amount = num(midDayDeposit);
    if (amount <= 0) {
      toast.error(t('cashRegister.depositRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await api.post('cash-register/deposit-cash/', {
        amount: String(amount),
        description: depositNote || undefined,
      });
      toast.success(t('cashRegister.depositSuccess'));
      setDepositDialog(false);
      setMidDayDeposit('');
      setDepositNote('');
      queryClient.invalidateQueries({ queryKey: ['cash-register-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register-txns'] });
      refetch();
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        Object.values(err?.response?.data || {})?.[0] ||
        t('cashRegister.depositFailed');
      toast.error(typeof msg === 'string' ? msg : t('cashRegister.depositFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const columns: TableColumn[] = [
    {
      key: 'transaction_date',
      title: t('cashRegister.date'),
      render: (v) => (v ? new Date(v).toLocaleString() : '—'),
    },
    {
      key: 'category',
      title: t('cashRegister.category'),
      render: (v) => (
        <Badge variant="outline" className={cn('font-medium', cashCategoryBadgeClass(v))}>
          {cashCategoryLabel(t, v)}
        </Badge>
      ),
    },
    {
      key: 'description',
      title: t('cashRegister.description'),
      render: (v) => v || '—',
    },
    {
      key: 'cash_in',
      title: t('cashRegister.income'),
      render: (v) =>
        num(v) > 0 ? (
          <span className="font-medium tabular-nums text-emerald-700">+{formatAfn(num(v))}</span>
        ) : (
          '—'
        ),
    },
    {
      key: 'cash_out',
      title: t('cashRegister.outcome'),
      render: (v) =>
        num(v) > 0 ? (
          <span className="font-medium tabular-nums text-rose-700">−{formatAfn(num(v))}</span>
        ) : (
          '—'
        ),
    },
  ];

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  const hasSession = Boolean(data?.has_open_session);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Banknote className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">{t('cashRegister.title')}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t('cashRegister.simpleSubtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasSession ? (
            <>
              <Button variant="outline" onClick={() => setDepositDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t('cashRegister.depositCash')}
              </Button>
              <Button variant="outline" onClick={() => navigate('/cash-register/transactions')}>
                <List className="mr-2 h-4 w-4" />
                {t('cashRegister.allTransactions')}
              </Button>
              <Button onClick={() => navigate('/cash-register/close')}>
                <Lock className="mr-2 h-4 w-4" />
                {t('cashRegister.closeSession')}
              </Button>
            </>
          ) : (
            <Button onClick={() => setOpenDialog(true)}>
              <Unlock className="mr-2 h-4 w-4" />
              {t('cashRegister.openSession')}
            </Button>
          )}
          <Button variant="ghost" onClick={() => navigate('/cash-register/reports')}>
            {t('cashRegister.reports')}
          </Button>
        </div>
      </div>

      {!hasSession && (
        <div className="rounded-xl border border-dashed bg-muted/20 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <p className="font-medium">{t('cashRegister.noOpenSession')}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasPreviousSession
                  ? t('cashRegister.nextOpeningHint', {
                      amount: formatAfn(carriedFromYesterday),
                    })
                  : t('cashRegister.firstOpeningHint')}
              </p>
            </div>
          </div>
        </div>
      )}

      {hasSession && totals && (
        <>
          <div className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{t('cashRegister.currentSession')}: </span>
            {data?.open_session?.session_number}
            {data?.open_session?.opened_at
              ? ` · ${new Date(data.open_session.opened_at).toLocaleString()}`
              : ''}
          </div>

          {/* Core formula: Opening + Income − Outcome = Balance */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MoneyBlock
              label={t('cashRegister.openingBalance')}
              value={opening}
              tone="neutral"
              hint={t('cashRegister.openingNotSales')}
            />
            <MoneyBlock
              label={t('cashRegister.income')}
              value={income}
              tone="in"
              hint={t('cashRegister.incomeHint')}
            />
            <MoneyBlock
              label={t('cashRegister.outcome')}
              value={outcome}
              tone="out"
              hint={t('cashRegister.outcomeHint')}
            />
            <MoneyBlock
              label={t('cashRegister.balance')}
              value={balance}
              tone="balance"
              hint={t('cashRegister.balanceFormula')}
            />
          </div>

          <p className="text-center text-sm text-muted-foreground tabular-nums">
            {formatAfn(opening)} + {formatAfn(income)} − {formatAfn(outcome)} ={' '}
            <span className="font-semibold text-foreground">{formatAfn(balance)}</span>
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <Breakdown
              title={t('cashRegister.incomeDetails')}
              tone="in"
              rows={[
                { label: t('cashRegister.cashSales'), value: num(totals.cash_sales) },
                { label: t('cashRegister.debtCollections'), value: num(totals.customer_debt_collections) },
                { label: t('cashRegister.otherReceipts'), value: num(totals.other_receipts) },
              ]}
            />
            <Breakdown
              title={t('cashRegister.outcomeDetails')}
              tone="out"
              rows={[
                { label: t('cashRegister.businessExpenses'), value: num(totals.business_expenses) },
                { label: t('cashRegister.supplierPayments'), value: num(totals.supplier_payments) },
                { label: t('cashRegister.ownerWithdrawals'), value: num(totals.owner_withdrawals) },
                { label: t('cashRegister.customerRefunds'), value: num(totals.customer_refunds) },
                { label: t('cashRegister.bankDeposits'), value: num(totals.bank_deposits) },
                { label: t('cashRegister.otherPayments'), value: num(totals.other_payments) },
              ]}
            />
          </div>

          <div>
            <h2 className="mb-3 text-base font-medium">{t('cashRegister.sessionTransactions')}</h2>
            <DataTable
              columns={columns}
              data={txnData?.results || []}
              loading={txnLoading}
              searchable
              searchPlaceholder={t('cashRegister.searchTransactions')}
              onSearch={(v) => {
                setSearchTerm(v);
                setPage(1);
              }}
              pagination={{
                current: page,
                pageSize: 25,
                total: txnData?.count || 0,
                onPageChange: setPage,
              }}
            />
          </div>
        </>
      )}

      <Dialog open={depositDialog} onOpenChange={setDepositDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cashRegister.depositCash')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">{t('cashRegister.depositCashHelp')}</p>
            <div className="space-y-2">
              <Label>{t('cashRegister.depositNow')}</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={midDayDeposit}
                onChange={(e) => setMidDayDeposit(e.target.value)}
                placeholder="2000"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('cashRegister.notes')}</Label>
              <Textarea
                value={depositNote}
                onChange={(e) => setDepositNote(e.target.value)}
                rows={2}
                placeholder={t('cashRegister.depositNotePlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepositDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleDepositCash} disabled={submitting}>
              {submitting ? t('common.saving') : t('cashRegister.depositCash')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cashRegister.openSession')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">{t('cashRegister.openDepositHelp')}</p>

            {hasPreviousSession && (
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">{t('cashRegister.fromYesterday')}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatAfn(carriedFromYesterday)}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>{t('cashRegister.depositNow')}</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={openingDeposit}
                onChange={(e) => setOpeningDeposit(e.target.value)}
                placeholder={hasPreviousSession ? '0' : '10000'}
              />
              <p className="text-xs text-muted-foreground">
                {hasPreviousSession
                  ? t('cashRegister.depositNowHint')
                  : t('cashRegister.firstDepositHint')}
              </p>
            </div>

            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">{t('cashRegister.openingTotal')}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-primary">
                {formatAfn(openingTotal)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatAfn(carriedFromYesterday)} + {formatAfn(depositNow)} = {formatAfn(openingTotal)}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t('cashRegister.notes')}</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleOpenSession} disabled={submitting}>
              {submitting ? t('common.saving') : t('cashRegister.openSession')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
