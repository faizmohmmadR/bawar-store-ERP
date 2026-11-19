import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Eye, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Autocomplete } from '@/components/ui/autocomplete';
import DataTable, { TableColumn, TableAction, FilterOption } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import {
  toCurrencyFilterOptions,
} from '@/lib/currencyChoices';
import { CurrencyAmount } from '@/components/display/CurrencyAmount';
import { ListDate } from '@/components/display/ListDate';
import { formatListContactLine, listBadgeClass, listTextClass } from '@/lib/listTableFormat';

export const ReturnList = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [salesFilter, setSalesFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: returnsData, isLoading } = useFetchObjects<{
    results: any[];
    count: number;
  }>({
    queryKey: ['returns', currentPage.toString(), pageSize.toString(), searchTerm, salesFilter, currencyFilter],
    endpoint: 'returns',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      ...(salesFilter && { sales: salesFilter }),
      ...(currencyFilter !== 'all' && { currency: currencyFilter })
    }
  });

  const { data: salesData } = useFetchObjects<any[]>({
    queryKey: ['sales-all'],
    endpoint: 'sales',
  });

    const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['returns'],
    endpoint: 'returns'
  });

  const returns = returnsData?.results || [];
  const totalItems = returnsData?.count || 0;

  const handleEdit = (returnItem: any) => {
    navigate(`/returns/${returnItem.id}/edit`);
  };

  const handleDetails = (returnItem: any) => {
    navigate(`/returns/${returnItem.id}`);
  };

  const columns: TableColumn[] = [
    {
      key: 'return_number',
      title: t('returns.returnNumber'),
      render: (value) => (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-accent/100 rounded-full"></div>
          <span className="font-semibold">{value}</span>
        </div>
      )
    },
    {
      key: 'sales_details',
      title: t('returns.sales'),
      className: 'max-w-[160px]',
      render: (value) => {
        const invoice = value?.invoice_number || 'N/A';
        const line = formatListContactLine(invoice, value?.customer);
        return (
          <span className={`${listTextClass} truncate block`} title={line}>
            {line}
          </span>
        );
      },
    },
    {
      key: 'return_date',
      title: t('returns.returnDate'),
      className: 'whitespace-nowrap',
      render: (value) => <ListDate value={value} />,
    },
    {
      key: 'total_amount',
      title: t('returns.totalAmount'),
      className: 'whitespace-nowrap',
      render: (value, record) => (
        <CurrencyAmount amount={value} currency={record.currency_details} showCode className="font-bold text-primary" />
      ),
    },
    {
      key: 'refund_amount',
      title: t('returns.refundAmount'),
      className: 'whitespace-nowrap',
      render: (value, record) => (
        <CurrencyAmount amount={value} currency={record.currency_details} showCode className="font-bold text-primary" />
      ),
    },
    {
      key: 'reason',
      title: t('returns.reason'),
      render: (value) => value ? <Badge variant="outline" className={listBadgeClass}>{value}</Badge> : '-'
    }
  ];

  const rowActions: TableAction[] = [
    {
      key: 'view',
      label: t('common.view'),
      icon: <Eye className="h-4 w-4" />,
      onClick: handleDetails,
      tooltip: t('common.view')
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: handleEdit,
      tooltip: t('common.edit')
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => handleDelete(record.id, record.return_number),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('common.delete')
    }
  ];

  const sales = Array.isArray(salesData) ? salesData : salesData?.results || [];
  const currencyFilterOptions = toCurrencyFilterOptions();
  const filters: FilterOption[] = [
    {
      key: 'currency',
      label: t('returns.currency'),
      placeholder: t('returns.currency'),
      width: 'sm:w-40',
      options: currencyFilterOptions,
    },
  ];

  const filterValues = {
    currency: currencyFilter
  };

  const handleFilterChange = (key: string, value: string) => {
    if (key === 'currency') {
      setCurrencyFilter(value);
      setCurrentPage(1);
    }
  };

  const handleClearFilters = () => {
    setSalesFilter('');
setCurrencyFilter('all');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const customFilters = [
    {
      key: 'sales',
      label: t('returns.sales'),
      component: (
        <Autocomplete
          options={sales.map(s => ({
            value: s.id.toString(),
            label: `${s.invoice_number} - ${s.customer_details?.name || 'N/A'}`
          }))}
          value={salesFilter}
          onChange={(value) => {
            setSalesFilter(value);
            setCurrentPage(1);
          }}
          placeholder={t('returns.filterBySale')}
        />
      )
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={returns}
        columns={columns}
        loading={isLoading}
        title={t('returns.returns')}
        subtitle={t('returns.manageReturnTransactions')}
        icon={<RotateCcw className="h-5 w-5" />}
        headerActions={
          <Button onClick={() => navigate('/returns/add')}>
            <Plus className="h-4 w-4" />
            {t('returns.addReturn')}
          </Button>
        }
        searchable
        searchPlaceholder={t('returns.searchReturns')}
        searchValue={searchTerm}
        onSearch={handleSearch}
        customFilters={customFilters}
        filters={filters}
        filterValues={filterValues}
        customFilterValues={{ sales: salesFilter }}
        onFilterChange={handleFilterChange}
        showClearFilters={true}
        clearFiltersLabel={t('common.clearFilters')}
        onClearFilters={handleClearFilters}
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
          }
        }}
        emptyIcon={<RotateCcw className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('returns.noReturns')}
        emptyDescription={searchTerm ? t('returns.tryAdjustingSearch') : t('returns.addFirstReturn')}
        loadingText={t('returns.loadingReturns')}
        maxHeight="75vh"
        stickyHeader={true}
      />

      <ConfirmDialog />
    </div>
  );
};

export default ReturnList;
