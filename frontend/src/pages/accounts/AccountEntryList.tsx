import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Receipt, Edit, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Autocomplete } from '@/components/ui/autocomplete';
import DataTable, { TableColumn, TableAction } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { ListDate } from '@/components/display/ListDate';
import { formatListContactLine, listBadgeClass, listTextClass } from '@/lib/listTableFormat';

const AccountEntryList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [entryTypeFilter, setEntryTypeFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: entriesData, isLoading } = useFetchObjects<{
    results: any[];
    count: number;
    next: string | null;
    previous: string | null;
  }>({
    queryKey: ['account-entries', currentPage.toString(), pageSize.toString(), searchTerm, accountFilter, entryTypeFilter],
    endpoint: 'account-entries',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      ...(accountFilter && { account: accountFilter }),
      ...(entryTypeFilter && { entry_type: entryTypeFilter })
    }
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['account-entries'],
    endpoint: 'account-entries'
  });

  const entries = entriesData?.results || [];
  const totalItems = entriesData?.count || 0;

  const columns: TableColumn[] = [
    {
      key: 'entry_date',
      title: t('accounts.date'),
      className: 'whitespace-nowrap',
      render: (value) => <ListDate value={value} />,
    },
    {
      key: 'account_details',
      title: t('accounts.account'),
      className: 'max-w-[160px]',
      render: (value) => {
        const line = formatListContactLine(value?.account_number || '-', value?.holder_name);
        return (
          <span className={`${listTextClass} truncate block`} title={line}>
            {line}
          </span>
        );
      },
    },
    {
      key: 'entry_type_details',
      title: t('accounts.entryType'),
      width: '7rem',
      className: 'max-w-[7rem]',
      render: (value) => <Badge variant="outline" className={`${listBadgeClass} max-w-full truncate`}>{value?.name || '-'}</Badge>
    },
    {
      key: 'debit_amount',
      title: t('accounts.debit'),
      width: '6.5rem',
      className: 'whitespace-nowrap',
      render: (value) => <span className="text-primary font-semibold tabular-nums">{parseFloat(value || 0).toFixed(2)}</span>
    },
    {
      key: 'credit_amount',
      title: t('accounts.credit'),
      width: '6.5rem',
      className: 'whitespace-nowrap',
      render: (value) => <span className="text-red-600 font-semibold tabular-nums">{parseFloat(value || 0).toFixed(2)}</span>
    },
    {
      key: 'reference_number',
      title: t('accounts.reference'),
      width: '8rem',
      className: 'max-w-[8rem]',
      render: (value) => <span className="block truncate" title={value || '-'}>{value || '-'}</span>
    },
    {
      key: 'linked_transaction',
      title: 'Source',
      width: '9rem',
      className: 'max-w-[9rem]',
      render: (value, record) => {
        if (record.content_type && record.object_id) {
          const type = record.content_type_name || 'Transaction';
          const ref = record.reference_number || `#${record.object_id}`;
          return (
            <span className="inline-flex max-w-full items-center gap-1 text-xs">
              <Badge variant="secondary" className={`${listBadgeClass} shrink-0`}>{type}</Badge>
              <span className="truncate">{ref}</span>
            </span>
          );
        }
        return <span className="text-gray-400 text-xs">Manual Entry</span>;
      }
    },
    {
      key: 'notes',
      title: t('accounts.notes'),
      width: '10rem',
      className: 'max-w-[10rem]',
      render: (value) => (
        <div className="truncate" title={value || ''}>{value || '-'}</div>
      )
    }
  ];

  const rowActions: TableAction[] = [
    {
      key: 'view',
      label: t('common.view'),
      icon: <Eye className="h-4 w-4" />,
      onClick: (record) => navigate(`/account-entries/${record.id}`),
      variant: 'ghost',
      tooltip: 'View entry details'
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: (record) => navigate(`/account-entries/${record.id}/edit`),
      variant: 'ghost',
      tooltip: t('accounts.editEntry')
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => handleDelete(record.id, record.reference_number || `Entry ${record.id}`),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('accounts.deleteEntry')
    }
  ];

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setAccountFilter('');
    setEntryTypeFilter('');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const hasActiveFilters = accountFilter || entryTypeFilter || searchTerm;

  const customFilters = [
    {
      key: 'account',
      label: t('accounts.account'),
      component: (
        <Autocomplete
          endpoint="accounts"
          value={accountFilter}
          onChange={(value) => {
            setAccountFilter(value);
            setCurrentPage(1);
          }}
          placeholder={t('accounts.selectAccount')}
          getOptionLabel={(a) => {
            const holderName = a.customer_name || a.vendor_name || '';
            const currency = a.currency_code || '';
            return `${a.account_number} - ${holderName} (${currency})`;
          }}
          getOptionValue={(a) => a.id.toString()}
        />
      )
    },
    {
      key: 'entry_type',
      label: t('accounts.entryType'),
      component: (
        <Autocomplete
          endpoint="entry-types"
          value={entryTypeFilter}
          onChange={(value) => {
            setEntryTypeFilter(value);
            setCurrentPage(1);
          }}
          placeholder={t('accounts.selectEntryType')}
          getOptionLabel={(e) => e.name}
          getOptionValue={(e) => e.id.toString()}
        />
      )
    }
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={entries}
        columns={columns}
        loading={isLoading}
        title={t('accounts.accountEntries')}
        subtitle={t('accounts.accountEntriesSubtitle')}
        icon={<Receipt className="h-5 w-5" />}
        headerActions={
          <Button onClick={() => navigate('/account-entries/add')}>
            <Plus className="h-4 w-4" />
            {t('accounts.addEntry')}
          </Button>
        }
        searchable
        searchPlaceholder={t('accounts.searchEntries')}
        searchValue={searchTerm}
        onSearch={handleSearch}
        customFilters={customFilters}
        customFilterValues={{ account: accountFilter, entry_type: entryTypeFilter }}
        showClearFilters={hasActiveFilters}
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
        emptyIcon={<Receipt className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('accounts.noEntriesFound')}
        emptyDescription={searchTerm ? t('accounts.tryAdjustingSearch') : t('accounts.addFirstEntry')}
        loadingText={t('accounts.loadingEntries')}
        maxHeight="75vh"
        stickyHeader={true}
      />

      <ConfirmDialog />
    </div>
  );
};

export { AccountEntryList };
export default AccountEntryList;
