import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Eye, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CurrencyFilterSelect } from '@/components/forms/CurrencyFilterSelect';
import DataTable, { TableColumn, TableAction, FilterOption } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';

const AccountList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: accountsData, isLoading } = useFetchObjects<{
    results: any[];
    count: number;
    next: string | null;
    previous: string | null;
  }>({
    queryKey: ['accounts', currentPage.toString(), pageSize.toString(), searchTerm, currencyFilter],
    endpoint: 'accounts',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      ...(currencyFilter && { currency: currencyFilter }),
    },
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['accounts'],
    endpoint: 'accounts',
  });

  const accounts = accountsData?.results || [];
  const totalItems = accountsData?.count || 0;

  const columns: TableColumn[] = [
    {
      key: 'account_number',
      title: t('accounts.accountNumber'),
      width: '8rem',
      className: 'whitespace-nowrap',
      render: (value) => <span className="font-medium">{value}</span>,
    },
    {
      key: 'name',
      title: t('accounts.name'),
      width: '12rem',
      className: 'max-w-[12rem]',
      render: (value) => <span className="block truncate" title={value || '—'}>{value || '—'}</span>,
    },
    {
      key: 'currency_code',
      title: t('accounts.currency'),
      width: '5rem',
      className: 'whitespace-nowrap',
      render: (value) => <Badge variant="outline">{value}</Badge>,
    },
  ];

  const rowActions: TableAction[] = [
    {
      key: 'view',
      label: t('accounts.viewDetails'),
      icon: <Eye className="h-4 w-4" />,
      onClick: (record) => navigate(`/accounts/${record.id}`),
      tooltip: t('accounts.viewDetails'),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: (record) => navigate(`/accounts/${record.id}/edit`),
      tooltip: t('accounts.editAccountAction'),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => handleDelete(record.id, record.name || record.account_number),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('accounts.deleteAccount'),
    },
  ];

  const customFilters = [
    {
      key: 'currency',
      label: t('accounts.currency'),
      component: (
        <CurrencyFilterSelect
          value={currencyFilter || 'all'}
          onChange={(value) => {
            setCurrencyFilter(value === 'all' ? '' : value);
            setCurrentPage(1);
          }}
          label={t('accounts.currency')}
          placeholder={t('accounts.selectCurrency')}
        />
      ),
    },
  ];

  const hasActiveFilters = !!currencyFilter || !!searchTerm;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={accounts}
        columns={columns}
        loading={isLoading}
        title={t('accounts.title')}
        subtitle={t('accounts.subtitle')}
        icon={<Wallet className="h-5 w-5" />}
        headerActions={
          <Button onClick={() => navigate('/accounts/add')}>
            <Plus className="h-4 w-4" />
            {t('accounts.addAccount')}
          </Button>
        }
        searchable
        searchPlaceholder={t('accounts.searchAccounts')}
        searchValue={searchTerm}
        onSearch={(value) => { setSearchTerm(value); setCurrentPage(1); }}
        customFilters={customFilters}
        showClearFilters={hasActiveFilters}
        clearFiltersLabel={t('common.clearFilters')}
        onClearFilters={() => { setCurrencyFilter(''); setSearchTerm(''); setCurrentPage(1); }}
        rowActions={rowActions}
        pagination={{
          current: currentPage,
          pageSize,
          total: totalItems,
          onPageChange: setCurrentPage,
          showSizeChanger: true,
          pageSizeOptions: [10, 25, 50, 100],
          onPageSizeChange: (size) => { setPageSize(size); setCurrentPage(1); },
        }}
        emptyIcon={<Wallet className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('accounts.noAccountsFound')}
        emptyDescription={searchTerm ? t('accounts.tryAdjustingSearch') : t('accounts.addFirstAccount')}
        loadingText={t('accounts.loadingAccounts')}
        maxHeight="75vh"
        stickyHeader
      />
      <ConfirmDialog />
    </div>
  );
};

export { AccountList };
export default AccountList;
