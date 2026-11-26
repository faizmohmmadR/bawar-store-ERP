import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DataTable, { TableColumn } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import { formatAfn } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import { cashSessionStatusLabel } from './i18nHelpers';

function sessionStatusBadgeClass(status: string | null | undefined): string {
  if (status === 'open') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (status === 'closed') return 'border-slate-200 bg-slate-100 text-slate-800';
  return 'border-border bg-muted/40 text-muted-foreground';
}

export default function CashReports() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { data, isLoading } = useFetchObjects<{ results: any[]; count: number }>({
    queryKey: ['cash-register-reports'],
    endpoint: 'cash-register/reports/summary/',
  });

  const columns: TableColumn[] = [
    { key: 'session_number', title: t('cashRegister.session') },
    {
      key: 'status',
      title: t('cashRegister.status'),
      render: (v) => (
        <Badge variant="outline" className={cn('font-medium', sessionStatusBadgeClass(v))}>
          {cashSessionStatusLabel(t, v)}
        </Badge>
      ),
    },
    {
      key: 'opened_at',
      title: t('cashRegister.openedAt'),
      render: (v) => (v ? new Date(v).toLocaleString() : '—'),
    },
    {
      key: 'opening_balance',
      title: t('cashRegister.openingBalance'),
      render: (v) => <span className="tabular-nums">{formatAfn(Number(v))}</span>,
    },
    {
      key: 'total_cash_in',
      title: t('cashRegister.income'),
      render: (v) => <span className="tabular-nums text-emerald-700">+{formatAfn(Number(v))}</span>,
    },
    {
      key: 'total_cash_out',
      title: t('cashRegister.outcome'),
      render: (v) => <span className="tabular-nums text-rose-700">−{formatAfn(Number(v))}</span>,
    },
    {
      key: 'expected_closing_balance',
      title: t('cashRegister.balance'),
      render: (v) => <span className="tabular-nums font-semibold">{formatAfn(Number(v))}</span>,
    },
    {
      key: 'carry_forward_amount',
      title: t('cashRegister.carryForward'),
      render: (v) => <span className="tabular-nums">{formatAfn(Number(v))}</span>,
    },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/cash-register')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{t('cashRegister.reports')}</h1>
          <p className="text-sm text-muted-foreground">{t('cashRegister.reportsHint')}</p>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={data?.results || []}
        loading={isLoading}
        searchable={false}
      />
    </div>
  );
}
