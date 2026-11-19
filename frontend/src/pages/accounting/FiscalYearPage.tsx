import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarRange,
  Lock,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import DataTable, { type TableColumn } from '@/components/ui/data-table';
import { StatementAmount } from '@/components/accounting/StatementAmount';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import useFetchObjects from '@/api/useFetchObjects';
import api from '@/api/client';
import { toApiList } from '@/lib/utils';
import { toast } from 'sonner';
import { notifySuccess } from '@/lib/notify';

type FiscalYearRow = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed';
  status_display: string;
  is_current: boolean;
  net_income: string | number;
  closed_at?: string | null;
  closing_journal?: number | null;
  notes?: string;
};

type CarryForwardSnapshot = {
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  open_stock_lots: number;
};

type CloseFiscalYearResponse = {
  closed_fiscal_year: FiscalYearRow;
  next_fiscal_year: FiscalYearRow;
  net_income: number;
  carry_forward: CarryForwardSnapshot;
};

export default function FiscalYearPage() {
  const { formatDate } = useFormatAppDate();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [closeTarget, setCloseTarget] = useState<FiscalYearRow | null>(null);
  const [closeNotes, setCloseNotes] = useState('');
  const [closeResult, setCloseResult] = useState<CloseFiscalYearResponse | null>(null);

  const { data: currentFy, isLoading: currentLoading, refetch: refetchCurrent } = useFetchObjects<FiscalYearRow>({
    queryKey: ['fiscal-years', 'current'],
    endpoint: 'fiscal-years/current/',
    options: { staleTime: 30_000 },
  });

  const { data: fiscalYearsData, isLoading, isFetching, refetch } = useFetchObjects<
    FiscalYearRow[] | { results: FiscalYearRow[] }
  >({
    queryKey: ['fiscal-years'],
    endpoint: 'fiscal-years/',
    options: { staleTime: 30_000 },
  });

  const { data: preview, isLoading: previewLoading } = useFetchObjects<CarryForwardSnapshot>({
    queryKey: ['fiscal-years', String(closeTarget?.id ?? ''), 'carry-forward'],
    endpoint: closeTarget ? `fiscal-years/${closeTarget.id}/carry-forward/` : '',
    enabled: Boolean(closeTarget),
    options: { staleTime: 0 },
  });

  const closeMutation = useMutation({
    mutationFn: async (payload: { id: number; notes: string }) => {
      const response = await api.post(`fiscal-years/${payload.id}/close/`, { notes: payload.notes });
      return response.data as CloseFiscalYearResponse;
    },
    onSuccess: (data) => {
      setCloseResult(data);
      setCloseTarget(null);
      setCloseNotes('');
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] });
      refetch();
      refetchCurrent();
      notifySuccess(t('accounts.fiscalYearClosedSuccess'), {
        title: t('common.success') || 'Success',
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
    },
    onError: (error: { response?: { data?: { detail?: string } } }) => {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : t('accounts.fiscalYearCloseFailed'));
    },
  });

  const rows = useMemo(() => toApiList(fiscalYearsData), [fiscalYearsData]);

  const columns: TableColumn<FiscalYearRow>[] = useMemo(
    () => [
      {
        key: 'name',
        title: t('accounts.fiscalYearName'),
        render: (_value, row) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.name}</span>
            {row.is_current && (
              <Badge variant="secondary">{t('accounts.fiscalYearCurrent')}</Badge>
            )}
          </div>
        ),
      },
      {
        key: 'period',
        title: t('accounts.fiscalYearPeriod'),
        render: (_value, row) => `${formatDate(row.start_date)} — ${formatDate(row.end_date)}`,
      },
      {
        key: 'status',
        title: t('accounts.fiscalYearStatus'),
        render: (_value, row) => (
          <Badge variant={row.status === 'open' ? 'default' : 'outline'}>
            {row.status === 'open' ? t('accounts.fiscalYearOpen') : t('accounts.fiscalYearClosed')}
          </Badge>
        ),
      },
      {
        key: 'net_income',
        title: t('accounts.fiscalYearNetIncome'),
        render: (_value, row) =>
          row.status === 'closed' ? <StatementAmount value={row.net_income} /> : '—',
      },
      {
        key: 'actions',
        title: t('common.actions'),
        render: (_value, row) =>
          row.status === 'open' && row.is_current ? (
            <Button size="sm" variant="outline" onClick={() => setCloseTarget(row)}>
              <Lock className="h-4 w-4 mr-1" />
              {t('accounts.closeFiscalYear')}
            </Button>
          ) : null,
      },
    ],
    [t, formatDate],
  );

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-heading font-bold tracking-tight flex items-center gap-2">
            <CalendarRange className="h-7 w-7 text-primary" />
            {t('accounts.fiscalYears')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('accounts.fiscalYearsDesc')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('accounts.fiscalYearCurrentTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {currentLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('accounts.loadingReport')}
            </div>
          )}
          {!currentLoading && currentFy && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-semibold">{currentFy.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(currentFy.start_date)} — {formatDate(currentFy.end_date)}
                </p>
              </div>
              <Badge>{t('accounts.fiscalYearOpen')}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('accounts.fiscalYearHistory')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={rows}
            loading={isLoading}
            searchable={false}
            emptyTitle={t('accounts.fiscalYearEmpty')}
          />
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="p-5 space-y-2">
          <h3 className="font-medium">{t('accounts.fiscalYearHowItWorks')}</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc ps-5">
            <li>{t('accounts.fiscalYearHowItWorks1')}</li>
            <li>{t('accounts.fiscalYearHowItWorks2')}</li>
            <li>{t('accounts.fiscalYearHowItWorks3')}</li>
          </ul>
        </CardContent>
      </Card>

      <Dialog open={Boolean(closeTarget)} onOpenChange={(open) => !open && setCloseTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('accounts.closeFiscalYearTitle')}</DialogTitle>
            <DialogDescription>{t('accounts.closeFiscalYearDesc')}</DialogDescription>
          </DialogHeader>

          {closeTarget && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 bg-muted/40">
                <p className="font-medium">{closeTarget.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(closeTarget.start_date)} — {formatDate(closeTarget.end_date)}
                </p>
              </div>

              {previewLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('accounts.fiscalYearLoadingPreview')}
                </div>
              )}

              {preview && (
                <div className="rounded-lg border p-3 space-y-2 text-sm">
                  <p className="font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    {t('accounts.fiscalYearCarryForward')}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <span>{t('accounts.totalAssets')}</span>
                    <span className="text-start"><StatementAmount value={preview.total_assets} /></span>
                    <span>{t('accounts.totalLiabilities')}</span>
                    <span className="text-start"><StatementAmount value={preview.total_liabilities} /></span>
                    <span>{t('accounts.totalEquity')}</span>
                    <span className="text-start"><StatementAmount value={preview.total_equity} /></span>
                    <span>{t('accounts.openStockLots')}</span>
                    <span className="text-start font-medium">{preview.open_stock_lots}</span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="close-notes">{t('accounts.fiscalYearCloseNotes')}</Label>
                <Textarea
                  id="close-notes"
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  placeholder={t('accounts.fiscalYearCloseNotesPlaceholder')}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={closeMutation.isPending || !closeTarget}
              onClick={() =>
                closeTarget &&
                closeMutation.mutate({ id: closeTarget.id, notes: closeNotes })
              }
            >
              {closeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('accounts.confirmCloseFiscalYear')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(closeResult)} onOpenChange={(open) => !open && setCloseResult(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              {t('accounts.fiscalYearClosedSuccess')}
            </DialogTitle>
          </DialogHeader>
          {closeResult && (
            <div className="space-y-3 text-sm">
              <p>
                {closeResult.closed_fiscal_year.name}: {t('accounts.fiscalYearNetIncome')}{' '}
                <StatementAmount value={closeResult.net_income} />
              </p>
              <p>
                {t('accounts.fiscalYearOpenedSummary')}: {closeResult.next_fiscal_year.name}
              </p>
              <div className="rounded-lg border p-3 grid grid-cols-2 gap-2">
                <span>{t('accounts.totalAssets')}</span>
                <span className="text-start">
                  <StatementAmount value={closeResult.carry_forward.total_assets} />
                </span>
                <span>{t('accounts.totalLiabilities')}</span>
                <span className="text-start">
                  <StatementAmount value={closeResult.carry_forward.total_liabilities} />
                </span>
                <span>{t('accounts.totalEquity')}</span>
                <span className="text-start">
                  <StatementAmount value={closeResult.carry_forward.total_equity} />
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCloseResult(null)}>{t('common.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
