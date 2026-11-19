import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { calendarMonthOptions, formatPayrollPeriod, toDateObject } from '@/lib/calendarDate';
import type { Payroll } from '@/types/payroll';
import type { Employee } from '@/types/employee';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Eye, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Autocomplete } from '@/components/ui/autocomplete';
import DataTable, { TableColumn, TableAction, FilterOption } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { CurrencyAmount } from '@/components/display/CurrencyAmount';
import { ListDate } from '@/components/display/ListDate';
import { formatListContactLine, listBadgeClass, listTextClass } from '@/lib/listTableFormat';

export const PayrollList = () => {
  const { t, language } = useLanguage();
  const { calendar } = useCalendarPreference();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: payrollsData, isLoading } = useFetchObjects<{
    results: Payroll[];
    count: number;
    next: string | null;
    previous: string | null;
  }>({
    queryKey: ['payrolls', currentPage.toString(), pageSize.toString(), searchTerm, employeeFilter, yearFilter, monthFilter, typeFilter, calendar],
    endpoint: 'payrolls',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      ...(employeeFilter && { employee: employeeFilter }),
      ...((yearFilter !== 'all' || monthFilter !== 'all') && { period_calendar: calendar }),
      ...(yearFilter !== 'all' && { year: yearFilter }),
      ...(monthFilter !== 'all' && { month: monthFilter }),
      ...(typeFilter !== 'all' && { payroll_type: typeFilter }),
    }
  });

    const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['payrolls'],
    endpoint: 'payrolls',
    additionalQueryKeys: ['employees', 'employee-financial-summary', 'employee-yearly-summary', 'employee-payroll-history', 'payroll']
  });

  const payrolls = payrollsData?.results || [];
  const totalItems = payrollsData?.count || 0;

  const { data: employeesData } = useFetchObjects<Employee[] | { results: Employee[] }>({ queryKey: ['employees-all'], endpoint: 'employees/' });
  const employees = Array.isArray(employeesData) ? employeesData : employeesData?.results || [];

  const handleEdit = (payroll: Payroll) => {
    navigate(`/payroll/${payroll.id}/edit`);
  };

  const handleDetails = (payroll: Payroll) => {
    navigate(`/payroll/${payroll.id}`);
  };

  const months = calendarMonthOptions(calendar, language);
  const currentYear = toDateObject(new Date(), calendar)!.year;
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

  const columns: TableColumn[] = [
    {
      key: 'employee_details',
      title: t('payroll.employee'),
      className: 'max-w-[180px]',
      render: (value) => {
        const name = value?.fullname || 'N/A';
        const line = formatListContactLine(name, value?.phone);
        return (
          <span className={`${listTextClass} truncate block`} title={line}>
            {line}
          </span>
        );
      },
    },
    {
      key: 'month',
      title: t('payroll.period'),
      render: (value, record) => {
        const monthLabel = formatPayrollPeriod(value, record.year, record.period_calendar || 'gregorian', calendar, language);
        return <Badge variant="outline" className={listBadgeClass}>{monthLabel}</Badge>;
      }
    },
    {
      key: 'payroll_type',
      title: t('payroll.type'),
      render: (value) => (
        <Badge variant="secondary" className={listBadgeClass}>
          {value === 'advance' ? t('payroll.advancePayment') : t('payroll.salaryPayment')}
        </Badge>
      )
    },
    {
      key: 'amount',
      title: t('payroll.amount'),
      className: 'whitespace-nowrap',
      render: (value, record) => (
        <CurrencyAmount amount={value || 0} currency={record.currency_details} showCode className="font-bold text-primary" />
      ),
    },
    {
      key: 'adjustments',
      title: `${t('payroll.overtime')} / ${t('payroll.deductions')}`,
      render: (_value, record) => <div className="space-y-1 text-xs">
        <p>+ <CurrencyAmount amount={Number(record.bonus || 0) + Number(record.overtime || 0)} currency={record.currency_details} /></p>
        <p>− <CurrencyAmount amount={record.deductions || 0} currency={record.currency_details} /></p>
      </div>,
    },
    {
      key: 'reference_number',
      title: t('payroll.referenceNumber', 'Reference number'),
      className: 'max-w-[140px]',
      render: (value) => (
        <span className={`${listTextClass} truncate block`} title={value || undefined}>
          {value || '—'}
        </span>
      ),
    },
    {
      key: 'payment_date',
      title: t('payroll.paymentDate'),
      className: 'whitespace-nowrap',
      render: (value) => <ListDate value={value} />,
    }
  ];

  const rowActions: TableAction[] = [
    {
      key: 'view',
      label: t('payroll.viewDetails'),
      icon: <Eye className="h-4 w-4" />,
      onClick: handleDetails,
      tooltip: t('payroll.viewDetails')
    },
    {
      key: 'edit',
      label: t('payroll.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: handleEdit,
      tooltip: t('payroll.editPayroll'),
    },
    {
      key: 'delete',
      label: t('payroll.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => {
        const employeeName = record.employee_details?.fullname || 'Payroll';
        handleDelete(record.id, `${employeeName} - ${formatPayrollPeriod(record.month, record.year, record.period_calendar || 'gregorian', calendar, language)}`);
      },
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('payroll.deletePayroll')
    }
  ];

  const filters: FilterOption[] = [
    {
      key: 'year',
      label: t('payroll.year'),
      placeholder: t('payroll.filterByYear'),
      width: 'sm:w-32',
      options: years.map(y => ({ value: y.toString(), label: y.toString() }))
    },
    {
      key: 'month',
      label: t('payroll.month'),
      placeholder: t('payroll.filterByMonth'),
      width: 'sm:w-40',
      options: months
    },
    {
      key: 'type',
      label: t('payroll.type'),
      placeholder: t('payroll.type'),
      width: 'sm:w-40',
      options: [
        { value: 'salary', label: t('payroll.salaryPayment') },
        { value: 'advance', label: t('payroll.advancePayment') },
      ]
    }
  ];

  const filterValues = {
    year: yearFilter,
    month: monthFilter,
    type: typeFilter,
  };

  const handleFilterChange = (key: string, value: string) => {
    if (key === 'year') {
      setYearFilter(value);
      setCurrentPage(1);
    } else if (key === 'month') {
      setMonthFilter(value);
      setCurrentPage(1);
    } else if (key === 'type') {
      setTypeFilter(value);
      setCurrentPage(1);
    }
  };

  const handleClearFilters = () => {
    setEmployeeFilter('');
    setYearFilter('all');
    setMonthFilter('all');
    setTypeFilter('all');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const customFilters = [
    {
      key: 'employee',
      label: t('payroll.employee'),
      component: (
        <Autocomplete
          options={employees.map(e => ({
            id: e.id.toString(),
            value: e.id.toString(),
            label: e.full_name || 'N/A'
          }))}
          getOptionLabel={(opt) => opt.label}
          getOptionValue={(opt) => opt.value}
          value={employeeFilter}
          onChange={(value) => {
            setEmployeeFilter(value?.toString() || '');
            setCurrentPage(1);
          }}
          placeholder={t('payroll.filterByEmployee')}
        />
      )
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={payrolls}
        columns={columns}
        loading={isLoading}
        title={t('payroll.payrolls')}
        subtitle={t('payroll.manageEmployeePayrolls')}
        icon={<DollarSign className="h-5 w-5" />}
        headerActions={
          <Button onClick={() => navigate('/payroll/add')}>
            <Plus className="h-4 w-4" />
            {t('payroll.addPayroll')}
          </Button>
        }
        searchable
        searchPlaceholder={t('payroll.searchPayrolls')}
        searchValue={searchTerm}
        onSearch={handleSearch}
        customFilters={customFilters}
        filters={filters}
        filterValues={filterValues}
        customFilterValues={{ employee: employeeFilter }}
        onFilterChange={handleFilterChange}
        showClearFilters={true}
        clearFiltersLabel={t('payroll.clearFilters')}
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
        emptyTitle={t('payroll.noPayrollsFound')}
        emptyDescription={searchTerm ? t('payroll.tryAdjustingSearch') : t('payroll.addFirstPayroll')}
        loadingText={t('payroll.loadingPayrolls')}
        maxHeight="75vh"
        stickyHeader={true}
      />

      <ConfirmDialog />
    </div>
  );
};

export default PayrollList;
