import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Eye, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Autocomplete } from '@/components/ui/autocomplete';
import DataTable, { TableColumn, TableAction, FilterOption } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { ListDate } from '@/components/display/ListDate';
import { formatOrderNumeric } from '@/lib/orderNumeric';
import { FALLBACK_BASE_SYMBOL } from '@/lib/currencies';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';
import { listBadgeClass } from '@/lib/listTableFormat';
import type { SalesmanCommissionPayment } from '@/types/salesmanCommissionPayment';

const SalesmanCommissionPaymentList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [salesmanFilter, setSalesmanFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const afnSymbol = resolveCurrencySymbol(1) || FALLBACK_BASE_SYMBOL;

  const { data, isLoading } = useFetchObjects<{
    results: SalesmanCommissionPayment[];
    count: number;
  }>({
    queryKey: [
      'salesman-commission-payments',
      currentPage.toString(),
      pageSize.toString(),
      searchTerm,
      salesmanFilter,
      methodFilter,
    ],
    endpoint: 'salesman-commission-payments',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      ...(salesmanFilter && { salesman: salesmanFilter }),
      ...(methodFilter !== 'all' && { payment_method: methodFilter }),
    },
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['salesman-commission-payments'],
    endpoint: 'salesman-commission-payments',
    additionalQueryKeys: [['salesmen']],
  });

  const rows = data?.results || [];
  const totalItems = data?.count || 0;
  const hasActiveFilters = Boolean(salesmanFilter || methodFilter !== 'all' || searchTerm);

  const columns: TableColumn[] = [
    {
      key: 'salesman_details',
      title: t('salesmen.name'),
      width: '11rem',
      className: 'max-w-[11rem]',
      render: (value) => (
        <p className="truncate font-medium" title={value?.name || '—'}>{value?.name || '—'}</p>
      ),
    },
    {
      key: 'amount',
      title: t('salesmen.commissionAfn'),
      width: '7.5rem',
      className: 'whitespace-nowrap',
      render: (value) => (
        <span className="font-semibold tabular-nums">
          {formatOrderNumeric(Number(value) || 0)} {afnSymbol}
        </span>
      ),
    },
    {
      key: 'payment_method',
      title: t('payments.paymentMethod'),
      width: '7rem',
      className: 'max-w-[7rem]',
      render: (value) => {
        const label = t(`payments.methods.${value}`, String(value));
        return (
          <Badge variant="outline" className={`${listBadgeClass} max-w-full truncate`} title={label}>
            {label}
          </Badge>
        );
      },
    },
    {
      key: 'payment_date',
      title: t('payments.paymentDate'),
      width: '7rem',
      className: 'whitespace-nowrap',
      render: (value) => <ListDate value={value} />,
    },
    {
      key: 'reference_number',
      title: t('payments.referenceNumber'),
      width: '8rem',
      className: 'max-w-[8rem]',
      render: (value) => <span className="block truncate" title={value || '—'}>{value || '—'}</span>,
    },
  ];

  const rowActions: TableAction[] = [
    {
      key: 'view',
      label: t('common.view'),
      icon: <Eye className="h-4 w-4" />,
      onClick: (record) => navigate(`/salesman-commission-payments/${record.id}`),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: (record) => navigate(`/salesman-commission-payments/${record.id}/edit`),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) =>
        handleDelete(
          record.id,
          `${record.salesman_details?.name || 'Commission'} — ${record.amount}`,
        ),
      variant: 'destructive',
    },
  ];

  const filters: FilterOption[] = [
    {
      key: 'method',
      label: t('payments.paymentMethod'),
      placeholder: t('common.all'),
      options: [
        { value: 'all', label: t('common.all') },
        { value: 'cash', label: t('payments.methods.cash') },
        { value: 'bank', label: t('payments.methods.bank') },
        { value: 'sarafi', label: t('payments.methods.sarafi') },
      ],
    },
  ];

  const customFilters = [
    {
      key: 'salesman',
      label: t('salesmen.name'),
      component: (
        <Autocomplete
          endpoint="salesmen"
          value={salesmanFilter}
          onChange={(v) => {
            setSalesmanFilter(v ? String(v) : '');
            setCurrentPage(1);
          }}
          placeholder={t('salesmen.selectSalesman')}
          getOptionLabel={(o: { name?: string }) => o.name || ''}
          getOptionValue={(o: { id?: number | string }) => String(o.id ?? '')}
          variant="filter"
        />
      ),
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={rows}
        columns={columns}
        loading={isLoading}
        title={t('salesmen.commissionPayments')}
        subtitle={t('salesmen.commissionPaymentsSubtitle')}
        icon={<Wallet className="h-5 w-5" />}
        headerActions={
          <Button onClick={() => navigate('/salesman-commission-payments/add')}>
            <Plus className="h-4 w-4" />
            {t('salesmen.payCommission')}
          </Button>
        }
        searchable
        searchPlaceholder={t('common.search')}
        searchValue={searchTerm}
        onSearch={(value) => {
          setSearchTerm(value);
          setCurrentPage(1);
        }}
        customFilters={customFilters}
        customFilterValues={{ salesman: salesmanFilter }}
        onCustomFilterChange={(key, value) => {
          if (key === 'salesman') {
            setSalesmanFilter(value);
            setCurrentPage(1);
          }
        }}
        filters={filters}
        filterValues={{ method: methodFilter }}
        onFilterChange={(key, value) => {
          if (key === 'method') {
            setMethodFilter(value);
            setCurrentPage(1);
          }
        }}
        showClearFilters={hasActiveFilters}
        clearFiltersLabel={t('common.clearFilters')}
        onClearFilters={() => {
          setSalesmanFilter('');
          setMethodFilter('all');
          setSearchTerm('');
          setCurrentPage(1);
        }}
        rowActions={rowActions}
        pagination={{
          current: currentPage,
          pageSize,
          total: totalItems,
          onPageChange: setCurrentPage,
          showSizeChanger: true,
          pageSizeOptions: [10, 25, 50, 100],
          onPageSizeChange: (size) => {
            setPageSize(size);
            setCurrentPage(1);
          },
        }}
        emptyIcon={<Wallet className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('salesmen.noCommissionPayments')}
        emptyDescription={
          searchTerm ? t('common.noSearchResults') : t('salesmen.payCommissionHint')
        }
        loadingText={t('common.loading')}
        maxHeight="75vh"
        stickyHeader
      />
      <ConfirmDialog />
    </div>
  );
};

export default SalesmanCommissionPaymentList;
