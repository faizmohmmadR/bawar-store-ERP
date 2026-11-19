import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Eye, Building2, MapPin, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import DataTable, { TableColumn, TableAction, FilterOption } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { ListFinanceCell } from '@/components/display/ListFinanceCell';
import { formatListContactLine, listTextClass } from '@/lib/listTableFormat';
import { usePartyPeriodCustomFilters } from '@/components/filters/DateRangeFilters';
import { usePartyPeriodFilter } from '@/hooks/usePartyPeriodFilter';
import { partyPeriodLabel } from '@/lib/partyPeriod';
import {
  fetchVendorsForPrint,
  printVendorsReport,
  type VendorPrintRow,
} from '@/pages/vendors/print';

export const Vendors = () => {
  const { t, language, direction } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedRows, setSelectedRows] = useState<(string | number)[]>([]);
  const [selectedVendorsById, setSelectedVendorsById] = useState<Record<string, VendorPrintRow>>({});
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

  const { data: vendorsData, isLoading } = useFetchObjects<{
    results: any[];
    count: number;
    next: string | null;
    previous: string | null;
  }>({
    queryKey: [
      'vendors',
      currentPage.toString(),
      pageSize.toString(),
      searchTerm,
      statusFilter,
      dateFrom,
      dateTo,
    ],
    endpoint: 'vendors',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      ...(statusFilter !== 'all' && { status: statusFilter }),
      ...(dateFrom && { date_from: dateFrom }),
      ...(dateTo && { date_to: dateTo }),
    },
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['vendors'],
    endpoint: 'vendors',
  });

  const vendors = vendorsData?.results || [];
  const totalItems = vendorsData?.count || 0;

  useEffect(() => {
    setSelectedVendorsById((prev) => {
      const next = { ...prev };
      vendors.forEach((vendor) => {
        const key = String(vendor.id);
        if (selectedRows.some((id) => String(id) === key)) {
          next[key] = vendor;
        }
      });
      Object.keys(next).forEach((key) => {
        if (!selectedRows.some((id) => String(id) === key)) {
          delete next[key];
        }
      });
      return next;
    });
  }, [vendors, selectedRows]);

  const printLabels = useMemo(
    () => ({
      title: t('vendors.printReportTitle'),
      documentRef: t('vendors.documentRef'),
      printedOn: t('vendors.printedOn'),
      count: t('vendors.printCount'),
      dateFrom: t('common.dateFrom'),
      dateTo: t('common.dateTo'),
      colNo: '#',
      colName: t('vendors.name'),
      colPhone: t('vendors.phone'),
      colEmail: t('vendors.email'),
      colAddress: t('vendors.address'),
      colTotal: t('vendors.totalDebit'),
      colPaid: t('vendors.totalCredit'),
      colBalance: t('vendors.balance'),
      noData: t('common.noData'),
    }),
    [t],
  );

  const handlePrintSelected = async () => {
    if (selectedRows.length === 0) return;
    setPrinting(true);
    try {
      const rows = await fetchVendorsForPrint(selectedRows, selectedVendorsById, {
        ...(dateFrom && { date_from: dateFrom }),
        ...(dateTo && { date_to: dateTo }),
      });
      printVendorsReport({
        vendors: rows,
        labels: printLabels,
        language,
        direction,
        dateFrom,
        dateTo,
      });
    } catch {
      toast.error(t('vendors.printFailed'));
    } finally {
      setPrinting(false);
    }
  };

  const columns: TableColumn[] = [
    {
      key: 'name',
      title: t('vendors.name'),
      className: 'max-w-[200px]',
      render: (value, record) => {
        const line = formatListContactLine(value, record.email);
        return (
          <span className={`${listTextClass} truncate block`} title={line}>
            {line}
          </span>
        );
      },
    },
    {
      key: 'phone',
      title: t('vendors.phone'),
      className: 'whitespace-nowrap',
      render: (value) => value || '-',
    },
    {
      key: 'address',
      title: t('vendors.address'),
      render: (value) => (
        <div className="flex items-center gap-1 max-w-xs">
          <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <span className="truncate">{value || t('vendors.notAvailable')}</span>
        </div>
      ),
    },
    {
      key: 'finance',
      title: t('vendors.totalDebit'),
      className: 'whitespace-nowrap',
      render: (value) => <ListFinanceCell finance={value} field="total_debit" />,
    },
    {
      key: 'finance',
      title: t('vendors.totalCredit'),
      className: 'whitespace-nowrap',
      render: (value) => <ListFinanceCell finance={value} field="total_credit" className="text-primary" />,
    },
    {
      key: 'finance',
      title: t('vendors.balance'),
      className: 'whitespace-nowrap',
      render: (value) => <ListFinanceCell finance={value} field="balance" className="text-red-600" />,
    },
  ];

  const rowActions: TableAction[] = [
    {
      key: 'view',
      label: t('vendors.viewDetails'),
      icon: <Eye className="h-4 w-4" />,
      onClick: (record) => navigate(`/vendors/${record.id}`),
      tooltip: t('vendors.viewDetails'),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: (record) => navigate(`/vendors/${record.id}/edit`),
      tooltip: t('vendors.editVendor'),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => handleDelete(record.id, record.name),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('vendors.deleteVendor'),
    },
  ];

  const bulkActions: TableAction<any[]>[] = [
    {
      key: 'print',
      label: t('vendors.printSelected'),
      icon: <Printer className="h-4 w-4" />,
      onClick: handlePrintSelected,
    },
  ];

  const filters: FilterOption[] = [
    {
      key: 'status',
      label: t('vendors.status'),
      placeholder: t('common.filterByStatus'),
      width: 'sm:w-40',
      options: [
        { value: 'active', label: t('vendors.active') },
        { value: 'inactive', label: t('vendors.inactive') },
      ],
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

  const hasActiveFilters =
    statusFilter !== 'all'
    || !!searchTerm
    || isPeriodFiltered;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={vendors}
        columns={columns}
        loading={isLoading}
        title={t('vendors.title')}
        subtitle={t('vendors.subtitle')}
        icon={<Building2 className="h-5 w-5" />}
        headerActions={
          <div className="flex flex-wrap gap-2">
            {selectedRows.length > 0 && (
              <Button variant="outline" onClick={handlePrintSelected} disabled={printing}>
                <Printer className="h-4 w-4" />
                {printing ? t('vendors.preparingPrint') : t('vendors.printSelected')}
              </Button>
            )}
            <Button onClick={() => navigate('/vendors/add')}>
              <Plus className="h-4 w-4" />
              {t('vendors.addVendorButton')}
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
        filters={filters}
        customFilters={customFilters}
        filterValues={{ status: statusFilter }}
        customFilterValues={{
          period: period === 'all' ? '' : partyPeriodLabel(period, t),
          ...(period === 'custom'
            ? { dateFrom: customFrom, dateTo: customTo }
            : {}),
        }}
        onFilterChange={(key, value) => {
          if (key === 'status') setStatusFilter(value);
          setCurrentPage(1);
          setSelectedRows([]);
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
          setStatusFilter('all');
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
        emptyIcon={<Building2 className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('common.noData')}
        emptyDescription={searchTerm ? t('common.noSearchResults') : t('vendors.addFirstVendor')}
        loadingText={t('common.loading')}
        maxHeight="75vh"
        stickyHeader
      />

      <ConfirmDialog />
    </div>
  );
};
