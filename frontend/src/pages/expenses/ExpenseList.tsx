import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Eye, Receipt, FileBarChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Autocomplete } from '@/components/ui/autocomplete';
import DataTable, { TableColumn, TableAction } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import {
  toCurrencyFilterOptions,
} from '@/lib/currencyChoices';
import { CurrencyAmount } from '@/components/display/CurrencyAmount';
import { ListDate } from '@/components/display/ListDate';
import { listBadgeClass } from '@/lib/listTableFormat';
import { FilterOption } from '@/components/ui/data-table';

export const ExpenseList = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: expensesData, isLoading } = useFetchObjects<{
    results: any[];
    count: number;
  }>({
    queryKey: ['expenses', currentPage.toString(), pageSize.toString(), searchTerm, categoryFilter, userFilter, currencyFilter],
    endpoint: 'expenses/',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      ...(categoryFilter && { category: categoryFilter }),
      ...(userFilter && { user: userFilter }),
      ...(currencyFilter !== 'all' && { currency: currencyFilter }),
    }
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['expenses'],
    endpoint: 'expenses'
  });

  const expenses = expensesData?.results || [];
  const totalItems = expensesData?.count || 0;
  const handleDetails = (expense: any) => {
    navigate(`/expenses/${expense.id}`);
  };

  const handleEdit = (expense: any) => {
    navigate(`/expenses/${expense.id}/edit`);
  };

  const expenseColumns: TableColumn[] = [
    {
      key: 'category_details',
      title: t('expenses.category'),
      render: (value) => (
        <Badge variant="outline" className={listBadgeClass}>{value?.name || 'N/A'}</Badge>
      )
    },
    {
      key: 'amount',
      title: t('expenses.amount'),
      render: (value, record) => (
        <CurrencyAmount
          amount={value}
          currency={record.currency_details}
          className="font-medium text-primary"
          showCode
        />
      )
    },
    {
      key: 'currency_details',
      title: t('expenses.currency'),
      render: (value) => (
        <Badge variant="secondary">
          {value ? `${value.code} (${value.symbol})` : '-'}
        </Badge>
      )
    },
    {
      key: 'expense_date',
      title: t('expenses.expenseDate'),
      className: 'whitespace-nowrap',
      render: (value) => <ListDate value={value} />,
    },
    {
      key: 'user_details',
      title: t('expenses.user'),
      render: (value) => (
        <div className="max-w-xs truncate" title={value?.fullname || ''}>
          {value?.fullname || '-'}
        </div>
      )
    },
    {
      key: 'receipt',
      title: t('expenses.receipt'),
      render: (value) => (
        value ? (
          <div className="flex items-center gap-2">
            <Badge variant="default" className="flex items-center gap-1">
              <Receipt className="h-3 w-3" />
              {t('expenses.hasReceipt')}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(value, '_blank')}
              className="h-6 w-6 p-0"
            >
              <Eye className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <Badge variant="outline">-</Badge>
        )
      )
    }
  ];

  const expenseRowActions: TableAction[] = [
    {
      key: 'view',
      label: t('expenses.viewDetails'),
      icon: <Eye className="h-4 w-4" />,
      onClick: handleDetails,
      tooltip: t('expenses.viewDetails')
    },
    {
      key: 'edit',
      label: t('expenses.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: handleEdit,
      tooltip: t('expenses.editExpense')
    },
    {
      key: 'delete',
      label: t('expenses.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => handleDelete(record.id, `${record.category_details?.name || 'Expense'} - ${record.amount}`),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('expenses.deleteExpense')
    }
  ];

  const expenseCustomFilters = [
    {
      key: 'category',
      label: t('expenses.category'),
      component: (
        <Autocomplete
          endpoint="expense-categories"
          value={categoryFilter}
          onChange={(value) => {
            setCategoryFilter(value);
            setCurrentPage(1);
          }}
          placeholder={t('expenses.selectCategory')}
          getOptionLabel={(c) => c.name}
          getOptionValue={(c) => c.id.toString()}
        />
      )
    },
    {
      key: 'user',
      label: t('expenses.user'),
      component: (
        <Autocomplete
          endpoint="users" getOptionLabel={(u) => `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || u.username} getOptionValue={(u) => u.id.toString()}
          value={userFilter}
          onChange={(value) => {
            setUserFilter(value);
            setCurrentPage(1);
          }}
          placeholder={t('expenses.selectUser')}
        />
      )
    },
  ];

  const currencyFilterOptions = toCurrencyFilterOptions();

  const expenseFilters: FilterOption[] = [
    {
      key: 'currency',
      label: t('expenses.currency'),
      placeholder: t('accounts.selectCurrency'),
      width: 'sm:w-40',
      options: currencyFilterOptions,
    },
  ];

  const handleClearExpenseFilters = () => {
    setCategoryFilter('');
    setUserFilter('');
    setCurrencyFilter('all');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const hasActiveExpenseFilters =
    categoryFilter || userFilter || currencyFilter !== 'all' || searchTerm;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={expenses}
        columns={expenseColumns}
        loading={isLoading}
        title={t('expenses.expenses')}
        subtitle={t('expenses.manageExpenseRecords')}
        icon={<Receipt className="h-5 w-5" />}
        headerActions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/expenses/report')}>
              <FileBarChart className="h-4 w-4" />
              {t('expenses.reportTitle', 'Report')}
            </Button>
            <Button onClick={() => navigate('/expenses/add')}>
              <Plus className="h-4 w-4" />
              {t('expenses.addExpense')}
            </Button>
          </div>
        }
        searchable
        searchPlaceholder={t('expenses.searchExpenses')}
        searchValue={searchTerm}
        onSearch={(value) => {
          setSearchTerm(value);
          setCurrentPage(1);
        }}
        customFilters={expenseCustomFilters}
        filters={expenseFilters}
        filterValues={{ currency: currencyFilter }}
        onFilterChange={(key, value) => {
          if (key === 'currency') {
            setCurrencyFilter(value);
            setCurrentPage(1);
          }
        }}
        showClearFilters={hasActiveExpenseFilters}
        clearFiltersLabel={t('expenses.clearFilters')}
        onClearFilters={handleClearExpenseFilters}
        rowActions={expenseRowActions}
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
        emptyTitle={t('expenses.noExpensesFound')}
        emptyDescription={searchTerm ? t('expenses.tryAdjustingSearch') : t('expenses.addFirstExpense')}
        loadingText={t('expenses.loadingExpenses')}
        maxHeight="75vh"
        stickyHeader={true}
      />

      <ConfirmDialog />
    </div>
  );
};

export default ExpenseList;
