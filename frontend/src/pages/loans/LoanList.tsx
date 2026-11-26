import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Eye, DollarSign, Users, Truck, ArrowUpRight, ArrowDownLeft, CreditCard, FileBarChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Autocomplete } from '@/components/ui/autocomplete';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DataTable, { TableColumn, TableAction, FilterOption } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import type { LoanSummary } from '@/types/loan';
import useDelete from '@/api/useDelete';
import {
  toCurrencyFilterOptions,
} from '@/lib/currencyChoices';
import { formatLoanMoney, getLoanCurrencyCode } from '@/lib/loanFormat';
import {
  getLoanDirectionLabel,
  getLoanTypeOptions,
} from '@/lib/loanUtils';
import { ListDate } from '@/components/display/ListDate';

const LoanList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [loanerTypeFilter, setLoanerTypeFilter] = useState('all');
  const [loanTypeFilter, setLoanTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: loansData, isLoading } = useFetchObjects<{
    results: any[];
    count: number;
  }>({
    queryKey: ['loans', currentPage.toString(), pageSize.toString(), searchTerm, loanerTypeFilter, loanTypeFilter, statusFilter, currencyFilter],
    endpoint: 'loans/',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      ...(loanerTypeFilter !== 'all' && { loaner_type: loanerTypeFilter }),
      ...(loanTypeFilter !== 'all' && { loan_type: loanTypeFilter }),
      ...(statusFilter !== 'all' && { is_paid: statusFilter === 'paid' }),
      ...(currencyFilter !== 'all' && { currency: currencyFilter }),
    }
  });

  const { data: summaryData } = useFetchObjects<LoanSummary>({
    queryKey: ['loan-summary'],
    endpoint: 'loans/summary/',
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['loans'],
    endpoint: 'loans'
  });

  const loans = loansData?.results || [];
  const totalItems = loansData?.count || 0;
  const summary = summaryData || {
    total_loan_in: 0,
    total_loan_out: 0,
    unpaid_loan_in: 0,
    unpaid_loan_out: 0,
    net_balance: 0,
    total_loans: 0,
    unpaid_loans: 0
  };

  const handleDetails = (loan: any) => {
    navigate(`/loans/${loan.id}`);
  };

  const handleEdit = (loan: any) => {
    navigate(`/loans/${loan.id}/edit`);
  };

  const handlePayment = (loan: any) => {
    navigate(`/loan-payments/add?loan=${loan.id}`);
  };

  const getLoanerName = (loan: any) => {
    if (loan.loaner_type === 'customer' && loan.customer_details) {
      return loan.customer_details.name;
    } else if (loan.loaner_type === 'vendor' && loan.vendor_details) {
      return loan.vendor_details.name;
    }
    return loan.loaner_name || t('common.notAvailable');
  };

  const columns: TableColumn[] = [
    {
      key: 'loaner_type',
      title: t('loans.loanerType'),
      className: 'whitespace-nowrap',
      render: (value) => (
        value === 'customer' ? (
          <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5 font-normal bg-primary/10 text-primary border-primary/30">
            <Users className="h-3 w-3 me-0.5 shrink-0" />
            {t('loans.loanerTypes.customer')}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5 font-normal bg-accent/10 text-accent border-accent/30">
            <Truck className="h-3 w-3 me-0.5 shrink-0" />
            {t('loans.loanerTypes.vendor')}
          </Badge>
        )
      ),
    },
    {
      key: 'loaner_name',
      title: t('loans.loaner'),
      className: 'max-w-[160px]',
      render: (_, record) => {
        const name = getLoanerName(record);
        const phone = record.loaner_type === 'customer'
          ? record.customer_details?.phone
          : record.vendor_details?.phone;
        const line = phone ? `${name} · ${phone}` : name;
        return (
          <span className="text-sm truncate block" title={line}>
            {line}
          </span>
        );
      },
    },
    {
      key: 'amount',
      title: t('loans.amount'),
      className: 'whitespace-nowrap text-start',
      render: (value, record) => (
        <span className="text-sm font-semibold tabular-nums">
          {formatLoanMoney(value, record)} {getLoanCurrencyCode(record)}
        </span>
      ),
    },
    {
      key: 'loan_type',
      title: t('loans.loanType'),
      className: 'whitespace-nowrap',
      render: (value, record) => {
        const direction = getLoanDirectionLabel(record.loaner_type, value, t);
        const isReceivable = value === 'loan_out';
        return (
          <div className="flex items-center gap-1 flex-nowrap">
            <Badge
              variant="outline"
              className={`text-[11px] px-1.5 py-0 h-5 font-normal shrink-0 ${
                isReceivable
                  ? 'bg-accent/10 text-accent border-orange-200'
                  : 'bg-primary/10 text-primary border-primary/30'
              }`}
            >
              {isReceivable ? (
                <ArrowUpRight className="h-3 w-3 me-0.5 shrink-0" />
              ) : (
                <ArrowDownLeft className="h-3 w-3 me-0.5 shrink-0" />
              )}
              {direction}
            </Badge>
            {record.is_opening_balance && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 h-5 font-normal shrink-0">
                {t('loans.openingBalanceShort')}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'is_paid',
      title: t('loans.statusLabel'),
      className: 'whitespace-nowrap',
      render: (value, record) => (
        value ? (
          <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5 font-normal bg-primary/10 text-primary border-primary/30">
            {t('loans.status.paid')}
          </Badge>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] whitespace-nowrap">
            <Badge variant="outline" className="px-1.5 py-0 h-5 font-normal bg-red-50 text-red-700 border-red-200">
              {t('loans.status.unpaid')}
            </Badge>
            <span className="text-muted-foreground tabular-nums">
              {formatLoanMoney(record.balance_due, record)}
            </span>
          </span>
        )
      ),
    },
    {
      key: 'loan_date',
      title: t('loans.loanDate'),
      className: 'whitespace-nowrap',
      render: (value) => <ListDate value={value} />,
    },
    {
      key: 'bill_number',
      title: t('loans.billNumber'),
      className: 'whitespace-nowrap',
      render: (value) => (
        value ? (
          <span className="text-xs font-mono text-muted-foreground">#{value}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )
      ),
    },
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
      key: 'payment',
      label: t('loans.addPayment'),
      icon: <CreditCard className="h-4 w-4" />,
      onClick: handlePayment,
      tooltip: t('loans.addPayment'),
      show: (record) => !record.is_paid,
    },
    {
      key: 'edit',
      label: t('loans.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: handleEdit,
      tooltip: t('loans.editLoan')
    },
    {
      key: 'delete',
      label: t('loans.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => handleDelete(record.id, `${getLoanerName(record)} - ${record.amount}`),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('loans.deleteLoan')
    }
  ];

  const loanTypeFilterOptions = loanerTypeFilter === 'customer' || loanerTypeFilter === 'vendor'
    ? getLoanTypeOptions(loanerTypeFilter, t)
    : [
        { value: 'loan_in', label: t('loans.type.loanIn') },
        { value: 'loan_out', label: t('loans.type.loanOut') },
      ];

  const currencyFilterOptions = toCurrencyFilterOptions();

  const filters: FilterOption[] = [
    {
      key: 'loaner_type',
      label: t('loans.loanerType'),
      placeholder: t('loans.filterByLoanerType'),
      width: 'sm:w-40',
      options: [
        { value: 'customer', label: t('loans.loanerTypes.customer') },
        { value: 'vendor', label: t('loans.loanerTypes.vendor') }
      ]
    },
    {
      key: 'loan_type',
      label: t('loans.loanType'),
      placeholder: t('loans.filterByType'),
      width: 'sm:w-56',
      options: loanTypeFilterOptions,
    },
    {
      key: 'status',
      label: t('loans.statusLabel'),
      placeholder: t('loans.allStatuses'),
      width: 'sm:w-40',
      options: [
        { value: 'paid', label: t('loans.status.paid') },
        { value: 'unpaid', label: t('loans.status.unpaid') }
      ]
    },
    {
      key: 'currency',
      label: t('loans.currency'),
      placeholder: t('accounts.selectCurrency'),
      width: 'sm:w-40',
      options: currencyFilterOptions,
    },
  ];

  const filterValues = {
    loaner_type: loanerTypeFilter,
    loan_type: loanTypeFilter,
    status: statusFilter,
    currency: currencyFilter,
  };

  const handleFilterChange = (key: string, value: string) => {
    if (key === 'loaner_type') {
      setLoanerTypeFilter(value);
      setLoanTypeFilter('all');
      setCurrentPage(1);
    } else if (key === 'loan_type') {
      setLoanTypeFilter(value);
      setCurrentPage(1);
    } else if (key === 'status') {
      setStatusFilter(value);
      setCurrentPage(1);
    } else if (key === 'currency') {
      setCurrencyFilter(value);
      setCurrentPage(1);
    }
  };

  const handleClearFilters = () => {
    setLoanerTypeFilter('all');
    setLoanTypeFilter('all');
    setStatusFilter('all');
    setCurrencyFilter('all');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const hasActiveFilters = loanerTypeFilter !== 'all' || loanTypeFilter !== 'all' || statusFilter !== 'all' || Boolean(searchTerm);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border px-3 py-2.5">
          <div className="text-xs text-muted-foreground">{t('loans.stats.totalLoanIn')}</div>
          <div className="text-lg font-bold text-primary tabular-nums">{formatLoanMoney(summary.total_loan_in, null)}</div>
        </div>
        <div className="bg-white rounded-lg border px-3 py-2.5">
          <div className="text-xs text-muted-foreground">{t('loans.stats.totalLoanOut')}</div>
          <div className="text-lg font-bold text-accent tabular-nums">{formatLoanMoney(summary.total_loan_out, null)}</div>
        </div>
        <div className="bg-white rounded-lg border px-3 py-2.5">
          <div className="text-xs text-muted-foreground">{t('loans.stats.unpaidLoanIn')}</div>
          <div className="text-lg font-bold text-red-600 tabular-nums">{formatLoanMoney(summary.unpaid_loan_in, null)}</div>
        </div>
        <div className="bg-white rounded-lg border px-3 py-2.5">
          <div className="text-xs text-muted-foreground">{t('loans.stats.unpaidLoanOut')}</div>
          <div className="text-lg font-bold text-red-600 tabular-nums">{formatLoanMoney(summary.unpaid_loan_out, null)}</div>
        </div>
      </div>

      <DataTable
        data={loans}
        columns={columns}
        loading={isLoading}
        title={t('loans.title')}
        subtitle={t('loans.manageLoanRecords')}
        icon={<DollarSign className="h-5 w-5" />}
        headerActions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate('/loans/report')}>
              <FileBarChart className="h-4 w-4" />
              {t('loans.reportTitle', 'Report')}
            </Button>
            <Button variant="outline" onClick={() => navigate('/loan-payments')}>
              {t('loans.loanPayments')}
            </Button>
            <Button onClick={() => navigate('/loans/add')}>
              <Plus className="h-4 w-4" />
              {t('loans.addLoan')}
            </Button>
          </div>
        }
        searchable
        searchPlaceholder={t('loans.searchPlaceholder')}
        searchValue={searchTerm}
        onSearch={(value) => {
          setSearchTerm(value);
          setCurrentPage(1);
        }}
        filters={filters}
        filterValues={filterValues}
        onFilterChange={handleFilterChange}
        showClearFilters={hasActiveFilters}
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
        emptyIcon={<DollarSign className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('loans.noRecords')}
        emptyDescription={searchTerm ? t('loans.tryAdjustingSearch') : t('loans.noRecordsDesc')}
        loadingText={t('loans.loadingLoans')}
        maxHeight="75vh"
        stickyHeader={true}
      />

      <ConfirmDialog />
    </div>
  );
};

export default LoanList;
