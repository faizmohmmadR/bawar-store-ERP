import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Eye, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DataTable, { TableColumn, TableAction } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';

const LoanerList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: loanersData, isLoading } = useFetchObjects<{
    results: any[];
    count: number;
  }>({
    queryKey: ['loaners', currentPage.toString(), pageSize.toString(), searchTerm],
    endpoint: 'loaners/',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm
    }
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['loaners'],
    endpoint: 'loaners'
  });

  const loaners = loanersData?.results || [];
  const totalItems = loanersData?.count || 0;

  const handleDetails = (loaner: any) => {
    navigate(`/loans/loaners/${loaner.id}`);
  };

  const handleEdit = (loaner: any) => {
    navigate(`/loans/loaners/${loaner.id}/edit`);
  };

  const columns: TableColumn[] = [
    {
      key: 'name',
      title: t('loans.loanerName'),
      width: '11rem',
      className: 'max-w-[11rem]',
      render: (value) => <span className="block truncate font-medium text-primary" title={value || '—'}>{value}</span>
    },
    {
      key: 'phone',
      title: t('loans.loanerPhone'),
      width: '8rem',
      className: 'whitespace-nowrap',
      render: (value) => value || '-'
    },
    {
      key: 'email',
      title: t('loans.loanerEmail'),
      width: '11rem',
      className: 'max-w-[11rem]',
      render: (value) => <span className="block truncate" title={value || '-'}>{value || '-'}</span>
    },
    {
      key: 'address',
      title: t('loans.loanerAddress'),
      width: '12rem',
      className: 'max-w-[12rem]',
      render: (value) => (
        <div className="truncate" title={value || ''}>
          {value || '-'}
        </div>
      )
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
      key: 'view',
      label: t('loans.viewDetails'),
      icon: <Eye className="h-4 w-4" />,
      onClick: handleDetails,
      tooltip: t('loans.viewDetails')
    },
    {
      key: 'edit',
      label: t('loans.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: handleEdit,
      tooltip: t('loans.editLoaner')
    },
    {
      key: 'delete',
      label: t('loans.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => handleDelete(record.id, record.name),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('loans.deleteLoaner')
    }
  ];

  const handleClearFilters = () => {
    setSearchTerm('');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={loaners}
        columns={columns}
        loading={isLoading}
        title={t('loans.loanerManagement')}
        subtitle={t('loans.manageLoanerContacts')}
        icon={<Users className="h-5 w-5" />}
        headerActions={
          <Button onClick={() => navigate('/loans/loaners/add')}>
            <Plus className="h-4 w-4" />
            {t('loans.addLoaner')}
          </Button>
        }
        searchable
        searchPlaceholder={t('loans.searchLoaners')}
        searchValue={searchTerm}
        onSearch={(value) => {
          setSearchTerm(value);
          setCurrentPage(1);
        }}
        showClearFilters={!!searchTerm}
        clearFiltersLabel={t('loans.clearFilters')}
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
        emptyIcon={<Users className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('loans.noLoaners')}
        emptyDescription={searchTerm ? t('loans.tryAdjustingSearch') : t('loans.noLoanersDesc')}
        loadingText={t('loans.loadingLoaners')}
        maxHeight="75vh"
        stickyHeader={true}
      />

      <ConfirmDialog />
    </div>
  );
};

export default LoanerList;
