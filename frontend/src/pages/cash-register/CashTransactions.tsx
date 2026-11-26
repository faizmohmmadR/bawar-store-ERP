import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DataTable, { TableColumn, FilterOption } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import { Badge } from '@/components/ui/badge';
import { formatAfn } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import { cashCategoryBadgeClass, cashCategoryLabel } from './i18nHelpers';

export default function CashTransactions() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [direction, setDirection] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useFetchObjects<{ results: any[]; count: number }>({
    queryKey: ['cash-txns-all', String(page), searchTerm, direction],
    endpoint: 'cash-register/transactions/',
    params: {
      page,
      page_size: 25,
      ...(searchTerm ? { search: searchTerm } : {}),
      ...(direction !== 'all' ? { direction } : {}),
    },
  });

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
        Number(v) > 0 ? (
          <span className="font-medium tabular-nums text-emerald-700">+{formatAfn(Number(v))}</span>
        ) : (
          '—'
        ),
    },
    {
      key: 'cash_out',
      title: t('cashRegister.outcome'),
      render: (v) =>
        Number(v) > 0 ? (
          <span className="font-medium tabular-nums text-rose-700">−{formatAfn(Number(v))}</span>
        ) : (
          '—'
        ),
    },
  ];

  const filters: FilterOption[] = [
    {
      key: 'direction',
      label: t('cashRegister.direction'),
      placeholder: t('cashRegister.direction'),
      options: [
        { value: 'all', label: t('common.all') },
        { value: 'in', label: t('cashRegister.income') },
        { value: 'out', label: t('cashRegister.outcome') },
      ],
    },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/cash-register')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">{t('cashRegister.allTransactions')}</h1>
      </div>
      <DataTable
        columns={columns}
        data={data?.results || []}
        loading={isLoading}
        searchable
        searchPlaceholder={t('cashRegister.searchTransactions')}
        onSearch={(v) => {
          setSearchTerm(v);
          setPage(1);
        }}
        filters={filters}
        filterValues={{ direction }}
        onFilterChange={(key, value) => {
          if (key === 'direction') setDirection(value);
          setPage(1);
        }}
        pagination={{
          current: page,
          pageSize: 25,
          total: data?.count || 0,
          onPageChange: setPage,
        }}
      />
    </div>
  );
}
