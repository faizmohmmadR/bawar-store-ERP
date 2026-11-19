import type { Employee } from '@/types/employee';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Eye, Users, UserPlus, FileBarChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DataTable, { TableColumn, TableAction, FilterOption } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { CurrencyAmount } from '@/components/display/CurrencyAmount';
import { ListDate } from '@/components/display/ListDate';
import { listBadgeClass } from '@/lib/listTableFormat';
import { payrollPeriodFromDate } from '@/lib/calendarDate';
import { CreateEmployeeAccountDialog } from './CreateEmployeeAccountDialog';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

function balanceClass(amount: number | null | undefined) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value === 0) return 'font-semibold text-muted-foreground';
  if (value > 0) return 'font-semibold text-amber-700 dark:text-amber-400';
  return 'font-semibold text-emerald-700 dark:text-emerald-400';
}

const EmployeeList = () => {
  const { t } = useLanguage();
  const { calendar } = useCalendarPreference();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [accountEmployee, setAccountEmployee] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const currentPeriod = useMemo(
    () => payrollPeriodFromDate(new Date(), calendar) || { month: 'january', year: new Date().getFullYear(), period_calendar: calendar },
    [calendar],
  );

  const { data: employeesData, isLoading } = useFetchObjects<{
    results: Employee[];
    count: number;
    next: string | null;
    previous: string | null;
  }>({
    queryKey: [
      'employees',
      currentPage.toString(),
      pageSize.toString(),
      searchTerm,
      statusFilter,
      currentPeriod.month,
      String(currentPeriod.year),
      currentPeriod.period_calendar,
    ],
    endpoint: 'employees',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      month: currentPeriod.month,
      year: currentPeriod.year,
      period_calendar: currentPeriod.period_calendar,
      ...(statusFilter !== 'all' && { is_active: statusFilter }),
    },
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['employees'],
    endpoint: 'employees'
  });

  const employees = employeesData?.results || [];
  const totalItems = employeesData?.count || 0;

  const handleEdit = (employee: Employee) => {
    navigate(`/employees/${employee.id}/edit`);
  };

  const handleDetails = (employee: Employee) => {
    navigate(`/employees/${employee.id}`);
  };

  const columns: TableColumn[] = [
    {
      key: 'full_name', title: t('employees.nameContact'), className: 'max-w-[200px]',
      render: (value, record) => <div className="space-y-1 min-w-0">
        <p className="font-semibold break-words">{value}</p>
        <p className="text-xs text-muted-foreground break-all" dir="auto">{[record.phone, record.email].filter(Boolean).join(' · ')}</p>
      </div>,
    },
    {
      key: 'contract_start_date', title: t('employees.contractStatus'),
      render: (value, record) => <div className="space-y-1 text-xs">
        <p>{value ? <ListDate value={value} /> : t('employees.contractMissing')}
          {record.contract_end_date && <> – <ListDate value={record.contract_end_date} /></>}</p>
        <Badge variant={record.is_active ? 'default' : 'secondary'} className={listBadgeClass}>
          {record.is_active ? t('employees.active') : t('employees.inactive')}
        </Badge>
      </div>,
    },
    {
      key: 'salary', title: t('employees.monthlySalary', 'Monthly salary'),
      render: (_value, record) => {
        const summary = record.payment_summary;
        const amount = summary?.monthly_salary ?? summary?.salary ?? record.salary;
        return (
          <div>
            <CurrencyAmount amount={amount} currency={summary?.currency || record.currency_details} />
            <p className="text-xs text-muted-foreground">
              {t(`employees.salaryType${record.salary_type === 'daily' ? 'Daily' : record.salary_type === 'other' ? 'Other' : 'Monthly'}`)}
            </p>
          </div>
        );
      },
    },
    {
      key: 'overtime', title: t('payroll.overtime'),
      render: (_value, record) => (
        <CurrencyAmount
          amount={record.payment_summary?.total_overtime || 0}
          currency={record.payment_summary?.currency || record.currency_details}
        />
      ),
    },
    {
      key: 'deductions', title: t('payroll.deductions'),
      render: (_value, record) => (
        <CurrencyAmount
          amount={record.payment_summary?.total_deductions || 0}
          currency={record.payment_summary?.currency || record.currency_details}
        />
      ),
    },
    {
      key: 'net_salary', title: t('employees.netSalary', 'Net salary'),
      render: (_value, record) => (
        <CurrencyAmount
          amount={record.payment_summary?.net_salary ?? record.payment_summary?.salary ?? record.salary}
          currency={record.payment_summary?.currency || record.currency_details}
          className="font-semibold"
        />
      ),
    },
    {
      key: 'paid', title: t('employees.paid', 'Paid'),
      render: (_value, record) => (
        <CurrencyAmount
          amount={record.payment_summary?.total_paid || 0}
          currency={record.payment_summary?.currency || record.currency_details}
          className="font-semibold text-primary"
        />
      ),
    },
    {
      key: 'balance', title: t('employees.balance', 'Balance'),
      render: (_value, record) => {
        const summary = record.payment_summary;
        const amount = summary?.balance ?? summary?.total_remaining ?? 0;
        const prefix = Number(amount) > 0 ? '+' : undefined;
        return (
          <CurrencyAmount
            amount={amount}
            currency={summary?.currency || record.currency_details}
            prefixSign={prefix}
            className={cn(balanceClass(amount))}
          />
        );
      },
    },
  ];

  const rowActions: TableAction[] = [
    {
      key: 'view',
      label: t('employees.viewDetails'),
      icon: <Eye className="h-4 w-4" />,
      onClick: handleDetails,
      tooltip: t('employees.viewDetails')
    },
    {
      key: 'edit',
      label: t('employees.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: handleEdit,
      tooltip: t('employees.editEmployee')
    },
    {
      key: 'createAccount',
      label: t('employees.createAccount'),
      icon: <UserPlus className="h-4 w-4" />,
      onClick: (record) => setAccountEmployee(record),
      tooltip: t('employees.createAccount'),
      show: (record) => !record.user && !record.user_details,
    },
    {
      key: 'delete',
      label: t('employees.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => {
        const name = record.full_name || 'Employee';
        handleDelete(record.id, name);
      },
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('employees.deleteEmployee')
    }
  ];

  const filters: FilterOption[] = [
    {
      key: 'status',
      label: t('employees.status'),
      placeholder: t('employees.filterByStatus'),
      width: 'w-full sm:w-36',
      options: [
        { value: 'true', label: t('employees.active') },
        { value: 'false', label: t('employees.inactive') }
      ]
    },
  ];

  const filterValues = {
    status: statusFilter,

  };

  const handleFilterChange = (key: string, value: string) => {
    if (key === 'status') {
      setStatusFilter(value);
      setCurrentPage(1);
    }
  };

  const handleClearFilters = () => {
    setStatusFilter('all');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const hasActiveFilters = statusFilter !== 'all' || !!searchTerm;

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        tableClassName="min-w-0 [&_td]:whitespace-normal [&_th]:whitespace-normal [&_td]:break-words"
        data={employees}
        columns={columns}
        loading={isLoading}
        title={t('employees.title')}
        subtitle={t('employees.manageEmployeeRecords')}
        icon={<Users className="h-5 w-5" />}
        headerActions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate('/employees/report')}>
              <FileBarChart className="h-4 w-4" />
              {t('employees.reportTitle', 'Report')}
            </Button>
            <Button onClick={() => navigate('/employees/add')}>
              <Plus className="h-4 w-4" />
              {t('employees.addEmployee')}
            </Button>
          </div>
        }
        searchable
        searchPlaceholder={t('employees.searchEmployees')}
        searchValue={searchTerm}
        onSearch={handleSearch}
        filters={filters}
        filterValues={filterValues}
        onFilterChange={handleFilterChange}
        showClearFilters
        hasActiveFiltersOverride={hasActiveFilters}
        clearFiltersLabel={t('common.clear')}
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
        emptyTitle={t('employees.noEmployeesFound')}
        emptyDescription={searchTerm ? t('employees.tryAdjustingSearch') : t('employees.addFirstEmployee')}
        loadingText={t('employees.loadingEmployees')}
        maxHeight="75vh"
        stickyHeader={true}
      />

      <ConfirmDialog />
      {accountEmployee && (
        <CreateEmployeeAccountDialog
          open={!!accountEmployee}
          onOpenChange={(open) => {
            if (!open) setAccountEmployee(null);
          }}
          employeeId={accountEmployee.id}
          employeeName={accountEmployee.full_name}
          employeeEmail={accountEmployee.email}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['employees'] });
            setAccountEmployee(null);
          }}
        />
      )}
    </div>
  );
};

export default EmployeeList;
