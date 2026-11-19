import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DataTable, { TableColumn, TableAction } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';

export const ExchangeRateList = () => {
  const { t } = useLanguage();
  const { formatDateTime } = useFormatAppDate();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: exchangeRatesData, isLoading } = useFetchObjects<{
    results: any[];
    count: number;
  }>({
    queryKey: ['exchange-rates', currentPage.toString(), pageSize.toString(), searchTerm],
    endpoint: 'exchange-rates/',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm
    }
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['exchange-rates'],
    endpoint: 'exchange-rates'
  });

  const exchangeRates = exchangeRatesData?.results || [];
  const totalItems = exchangeRatesData?.count || 0;

  const handleEdit = (rate: any) => {
    navigate(`/settings/exchange-rates/${rate.id}/edit`);
  };

  const columns: TableColumn[] = [
    {
      key: 'from_currency_details',
      title: t('settings.exchangeRates.fromCurrency'),
      width: '6rem',
      className: 'whitespace-nowrap',
      render: (value) => <span className="font-medium">{value?.code || 'N/A'}</span>
    },
    {
      key: 'to_currency_details',
      title: t('settings.exchangeRates.toCurrency'),
      width: '6rem',
      className: 'whitespace-nowrap',
      render: (value) => <span className="font-medium">{value?.code || 'N/A'}</span>
    },
    {
      key: 'rate',
      title: t('settings.exchangeRates.rate'),
      width: '6rem',
      className: 'whitespace-nowrap tabular-nums',
      render: (value) => <span className="text-primary font-medium">{value ? parseFloat(value).toFixed(2) : '0.00'}</span>
    },
    {
      key: 'date',
      title: t('settings.exchangeRates.date'),
      width: '9rem',
      className: 'whitespace-nowrap',
      render: (value) => value ? formatDateTime(value) : 'N/A'
    },
    {
      key: 'is_active',
      title: t('common.status'),
      width: '5.5rem',
      className: 'max-w-[5.5rem]',
      render: (value) => (
        <Badge variant={value ? 'default' : 'secondary'}>
          {value ? t('common.active') : t('common.inactive')}
        </Badge>
      )
    }
  ];

  const rowActions: TableAction[] = [
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: handleEdit,
      tooltip: t('settings.exchangeRates.editExchangeRate')
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => handleDelete(record.id, `${record.from_currency_details?.code} → ${record.to_currency_details?.code}`),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('settings.exchangeRates.deleteExchangeRate')
    }
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={exchangeRates}
        columns={columns}
        loading={isLoading}
        title={t('settings.exchangeRates.title')}
        subtitle={t('settings.exchangeRates.manageCurrencyExchangeRates')}
        icon={<TrendingUp className="h-5 w-5" />}
        headerActions={
          <Button onClick={() => navigate('/settings/exchange-rates/add')}>
            <Plus className="h-4 w-4" />
            {t('settings.exchangeRates.add')}
          </Button>
        }
        searchable
        searchPlaceholder={t('settings.exchangeRates.searchExchangeRates')}
        searchValue={searchTerm}
        onSearch={(value) => {
          setSearchTerm(value);
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
          }
        }}
        emptyIcon={<TrendingUp className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('settings.exchangeRates.noExchangeRatesFound')}
        emptyDescription={searchTerm ? t('common.tryAdjustingSearch') : t('settings.exchangeRates.addFirstExchangeRate')}
        loadingText={t('settings.exchangeRates.loadingExchangeRates')}
        maxHeight="75vh"
        stickyHeader={true}
      />

      <ConfirmDialog />
    </div>
  );
};
