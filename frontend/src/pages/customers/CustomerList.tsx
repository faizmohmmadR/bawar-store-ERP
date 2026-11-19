import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Eye, Users, MapPin, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import DataTable, { TableColumn, TableAction } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { ListFinanceCell } from '@/components/display/ListFinanceCell';
import { formatListContactLine, listTextClass } from '@/lib/listTableFormat';
import { usePartyPeriodCustomFilters } from '@/components/filters/DateRangeFilters';
import { usePartyPeriodFilter } from '@/hooks/usePartyPeriodFilter';
import { partyPeriodLabel } from '@/lib/partyPeriod';
import {
  fetchCustomersForPrint,
  printCustomersReport,
  type CustomerPrintRow,
} from '@/pages/customers/print';

export const Customers = () => {
  const { t, language, direction } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedRows, setSelectedRows] = useState<(string | number)[]>([]);
  const [selectedCustomersById, setSelectedCustomersById] = useState<Record<string, CustomerPrintRow>>({});
  const [printing, setPrinting] = useState(false);

  const resetListSelection = useCallback(() => {
    setCurrentPage(1);
    setSelectedRows([]);
  }, []);

  const {
    period,
    setPeriod,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    dateFrom,
    dateTo,
    clear: clearPeriod,
    isFiltered: isPeriodFiltered,
  } = usePartyPeriodFilter({ onFilterChange: resetListSelection });

  const { data: customersData, isLoading } = useFetchObjects<{
    results: any[];
    count: number;
    next: string | null;
    previous: string | null;
  }>({
    queryKey: [
      'customers',
      currentPage.toString(),
      pageSize.toString(),
      searchTerm,
      dateFrom,
      dateTo,
    ],
    endpoint: 'customers',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      ...(dateFrom && { date_from: dateFrom }),
      ...(dateTo && { date_to: dateTo }),
    },
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['customers'],
    endpoint: 'customers',
  });

  const customers = customersData?.results || [];
  const totalItems = customersData?.count || 0;

  useEffect(() => {
    setSelectedCustomersById((prev) => {
      const next = { ...prev };
      customers.forEach((customer) => {
        const key = String(customer.id);
        if (selectedRows.some((id) => String(id) === key)) {
          next[key] = customer;
        }
      });
      Object.keys(next).forEach((key) => {
        if (!selectedRows.some((id) => String(id) === key)) {
          delete next[key];
        }
      });
      return next;
    });
  }, [customers, selectedRows]);

  const printLabels = useMemo(
    () => ({
      title: t('customers.printReportTitle'),
      documentRef: t('customers.documentRef'),
      printedOn: t('customers.printedOn'),
      count: t('customers.printCount'),
      dateFrom: t('common.dateFrom'),
      dateTo: t('common.dateTo'),
      colNo: '#',
      colName: t('customers.name'),
      colPhone: t('customers.phone'),
      colEmail: t('customers.email'),
      colAddress: t('customers.address'),
      colTotal: t('customers.total'),
      colPaid: t('customers.paid'),
      colBalance: t('customers.balance'),
      noData: t('common.noData'),
    }),
    [t],
  );

  const handlePrintSelected = async () => {
    if (selectedRows.length === 0) return;
    setPrinting(true);
    try {
      const rows = await fetchCustomersForPrint(selectedRows, selectedCustomersById, {
        ...(dateFrom && { date_from: dateFrom }),
        ...(dateTo && { date_to: dateTo }),
      });
      printCustomersReport({
        customers: rows,
        labels: printLabels,
        language,
        direction,
        dateFrom,
        dateTo,
      });
    } catch {
      toast.error(t('customers.printFailed'));
    } finally {
      setPrinting(false);
    }
  };

  const columns: TableColumn[] = [
    {
      key: 'name',
      title: t('customers.name'),
      className: 'max-w-[200px]',
      render: (value, record) => {
        const line = formatListContactLine(record.name || value, record.email);
        return (
          <span className={`${listTextClass} truncate block`} title={line}>
            {line}
          </span>
        );
      },
    },
    {
      key: 'phone',
      title: t('customers.phone'),
      className: 'whitespace-nowrap',
      render: (value) => value || '-',
    },
    {
      key: 'address',
      title: t('customers.address'),
      render: (value) => (
        <div className="flex items-center gap-1 max-w-xs">
          <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <span className="truncate">{value || t('customers.notAvailable')}</span>
        </div>
      ),
    },
    {
      key: 'finance',
      title: t('customers.total'),
      className: 'whitespace-nowrap',
      render: (value) => <ListFinanceCell finance={value} field="total_debit" />,
    },
    {
      key: 'finance',
      title: t('customers.paid'),
      className: 'whitespace-nowrap',
      render: (value) => <ListFinanceCell finance={value} field="total_credit" className="text-primary" />,
    },
    {
      key: 'finance',
      title: t('customers.remainingBalance'),
      className: 'whitespace-nowrap',
      render: (value) => <ListFinanceCell finance={value} field="balance" className="text-red-600" />,
    },
  ];

  const rowActions: TableAction[] = [
    {
      key: 'view',
      label: t('customers.viewDetails'),
      icon: <Eye className="h-4 w-4" />,
      onClick: (record) => navigate(`/customers/${record.id}`),
      tooltip: t('customers.viewDetails'),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: (record) => navigate(`/customers/${record.id}/edit`),
      tooltip: t('customers.editCustomerAction'),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => handleDelete(record.id, record.name || record.email),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('customers.deleteCustomer'),
    },
  ];

  const bulkActions: TableAction<any[]>[] = [
    {
      key: 'print',
      label: t('customers.printSelected'),
      icon: <Printer className="h-4 w-4" />,
      onClick: handlePrintSelected,
    },
  ];

  const customFilters = usePartyPeriodCustomFilters({
    period,
    onPeriodChange: setPeriod,
    dateFrom: customFrom,
    dateTo: customTo,
    onDateFromChange: setCustomFrom,
    onDateToChange: setCustomTo,
  });

  const hasActiveFilters = !!searchTerm || isPeriodFiltered;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={customers}
        columns={columns}
        loading={isLoading}
        title={t('customers.title')}
        subtitle={t('customers.manageCustomers')}
        icon={<Users className="h-5 w-5" />}
        headerActions={
          <div className="flex flex-wrap gap-2">
            {selectedRows.length > 0 && (
              <Button variant="outline" onClick={handlePrintSelected} disabled={printing}>
                <Printer className="h-4 w-4" />
                {printing ? t('customers.preparingPrint') : t('customers.printSelected')}
              </Button>
            )}
            <Button onClick={() => navigate('/customers/add')}>
              <Plus className="h-4 w-4" />
              {t('customers.addCustomer')}
            </Button>
          </div>
        }
        searchable
        searchPlaceholder={t('common.search')}
        searchValue={searchTerm}
        onSearch={(value) => {
          setSearchTerm(value);
          setCurrentPage(1);
          setSelectedRows([]);
        }}
        customFilters={customFilters}
        customFilterValues={{
          period: period === 'all' ? '' : partyPeriodLabel(period, t),
          ...(period === 'custom'
            ? { dateFrom: customFrom, dateTo: customTo }
            : {}),
        }}
        onCustomFilterChange={(key) => {
          if (key === 'period') clearPeriod();
          if (key === 'dateFrom') setCustomFrom('');
          if (key === 'dateTo') setCustomTo('');
          setCurrentPage(1);
          setSelectedRows([]);
        }}
        showClearFilters
        clearFiltersLabel={t('common.clearFilters')}
        hasActiveFiltersOverride={hasActiveFilters}
        onClearFilters={() => {
          setSearchTerm('');
          clearPeriod();
          setCurrentPage(1);
          setSelectedRows([]);
        }}
        rowActions={rowActions}
        selectable
        selectedRows={selectedRows}
        onSelectionChange={setSelectedRows}
        bulkActions={bulkActions}
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
          },
        }}
        emptyIcon={<Users className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('common.noData')}
        emptyDescription={searchTerm ? t('common.noSearchResults') : t('customers.addFirstCustomer')}
        loadingText={t('common.loading')}
        maxHeight="75vh"
        stickyHeader
      />

      <ConfirmDialog />
    </div>
  );
};
