import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DataTable, { TableColumn, TableAction } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';

const EntryTypeList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: entryTypesData, isLoading } = useFetchObjects<{
    results: any[];
    count: number;
    next: string | null;
    previous: string | null;
  }>({
    queryKey: ['entry-types', currentPage.toString(), pageSize.toString(), searchTerm],
    endpoint: 'entry-types',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm
    }
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['entry-types'],
    endpoint: 'entry-types'
  });

  const entryTypes = entryTypesData?.results || [];
  const totalItems = entryTypesData?.count || 0;

  const handleEdit = (entryType: any) => {
    navigate(`/entry-types/${entryType.id}/edit`);
  };

  const columns: TableColumn[] = [
    {
      key: 'name',
      title: t('accounts.name'),
      width: '14rem',
      className: 'max-w-[14rem]',
      render: (value) => <span className="block truncate font-medium" title={value || '—'}>{value}</span>
    }
  ];

  const rowActions: TableAction[] = [
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: handleEdit,
      tooltip: t('accounts.editEntryType')
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => handleDelete(record.id, record.name),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('accounts.deleteEntryType')
    }
  ];

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={entryTypes}
        columns={columns}
        loading={isLoading}
        title={t('accounts.entryTypes')}
        subtitle={t('accounts.entryTypesSubtitle')}
        icon={<Tag className="h-5 w-5" />}
        headerActions={
          <Button onClick={() => navigate('/entry-types/add')}>
            <Plus className="h-4 w-4" />
            {t('accounts.addEntryType')}
          </Button>
        }
        searchable
        searchPlaceholder={t('accounts.searchEntryTypes')}
        searchValue={searchTerm}
        onSearch={handleSearch}
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
        emptyIcon={<Tag className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('accounts.noEntryTypesFound')}
        emptyDescription={searchTerm ? t('accounts.tryAdjustingSearch') : t('accounts.addFirstEntryType')}
        loadingText={t('accounts.loadingEntryTypes')}
        maxHeight="75vh"
        stickyHeader={true}
      />

      <ConfirmDialog />
    </div>
  );
};

export { EntryTypeList };
export default EntryTypeList;
