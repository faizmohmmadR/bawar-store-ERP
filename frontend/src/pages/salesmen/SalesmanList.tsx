import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Eye, UserCheck, MapPin, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import DataTable, { TableColumn, TableAction, FilterOption } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { formatListContactLine, listTextClass } from '@/lib/listTableFormat';
import { formatDisplayMoney } from '@/lib/displayMoney';
import { formatOrderNumeric } from '@/lib/orderNumeric';
import { FALLBACK_BASE_SYMBOL } from '@/lib/currencies';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';
import { usePartyPeriodCustomFilters } from '@/components/filters/DateRangeFilters';
import { usePartyPeriodFilter } from '@/hooks/usePartyPeriodFilter';
import { partyPeriodLabel } from '@/lib/partyPeriod';
import {
  fetchSalesmenForPrint,
  printSalesmenReport,
  type SalesmanPrintRow,
} from '@/pages/salesmen/print';

export const Salesmen = () => {
  const { t, language, direction } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedRows, setSelectedRows] = useState<(string | number)[]>([]);
  const [selectedSalesmenById, setSelectedSalesmenById] = useState<Record<string, SalesmanPrintRow>>({});
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

  const { data: salesmenData, isLoading } = useFetchObjects<{
    results: any[];
    count: number;
    next: string | null;
    previous: string | null;
  }>({
    queryKey: [
      'salesmen',
      currentPage.toString(),
      pageSize.toString(),
      searchTerm,
      statusFilter,
      dateFrom,
      dateTo,
    ],
    endpoint: 'salesmen',
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
    queryKey: ['salesmen'],
    endpoint: 'salesmen',
  });

  const salesmen = salesmenData?.results || [];
  const totalItems = salesmenData?.count || 0;
  const afnSymbol = resolveCurrencySymbol(1) || FALLBACK_BASE_SYMBOL;
  const formatAfn = (amount: number) =>
    `${formatDisplayMoney(amount, 'AFN')} ${afnSymbol}`;

  useEffect(() => {
    setSelectedSalesmenById((prev) => {
      const next = { ...prev };
      salesmen.forEach((salesman) => {
        const key = String(salesman.id);
        if (selectedRows.some((id) => String(id) === key)) {
          next[key] = salesman;
        }
      });
      Object.keys(next).forEach((key) => {
        if (!selectedRows.some((id) => String(id) === key)) {
          delete next[key];
        }
      });
      return next;
    });
  }, [salesmen, selectedRows]);

  const printLabels = useMemo(
    () => ({
      title: t('salesmen.printReportTitle'),
      documentRef: t('salesmen.printDocumentRef'),
      printedOn: t('salesmen.printedOn'),
      count: t('salesmen.printCount'),
      dateFrom: t('common.dateFrom'),
      dateTo: t('common.dateTo'),
      colNo: '#',
      colName: t('salesmen.name'),
      colPhone: t('salesmen.phone'),
      colAddress: t('salesmen.address'),
      colTotal: t('salesmen.commissionEarned'),
      colPaid: t('salesmen.commissionPaid'),
      colBalance: t('salesmen.commissionBalance'),
      noData: t('common.noData'),
      afnSuffix: afnSymbol,
    }),
    [t, afnSymbol],
  );

  const handlePrintSelected = async () => {
    if (selectedRows.length === 0) return;
    setPrinting(true);
    try {
      const rows = await fetchSalesmenForPrint(selectedRows, selectedSalesmenById, {
        ...(dateFrom && { date_from: dateFrom }),
        ...(dateTo && { date_to: dateTo }),
      });
      printSalesmenReport({
        salesmen: rows,
        labels: printLabels,
        language,
        direction,
        dateFrom,
        dateTo,
      });
    } catch {
      toast.error(t('salesmen.printFailed'));
    } finally {
      setPrinting(false);
    }
  };

  const columns: TableColumn[] = [
    {
      key: 'name',
      title: t('salesmen.name'),
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
      title: t('salesmen.phone'),
      className: 'whitespace-nowrap',
      render: (value) => value || '-',
    },
    {
      key: 'address',
      title: t('salesmen.address'),
      render: (value) => (
        <div className="flex items-center gap-1 max-w-xs">
          <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <span className="truncate">{value || t('salesmen.notAvailable')}</span>
        </div>
      ),
    },
    {
      key: 'sales_count',
      title: t('salesmen.salesCount'),
      className: 'whitespace-nowrap',
      render: (value) => formatOrderNumeric(Number(value) || 0),
    },
    {
      key: 'total_commission',
      title: t('salesmen.commissionEarned'),
      className: 'whitespace-nowrap',
      render: (value) => formatAfn(Number(value) || 0),
    },
    {
      key: 'commission_paid',
      title: t('salesmen.commissionPaid'),
      className: 'whitespace-nowrap',
      render: (value) => (
        <span className="text-primary tabular-nums">{formatAfn(Number(value) || 0)}</span>
      ),
    },
    {
      key: 'commission_balance',
      title: t('salesmen.commissionBalance'),
      className: 'whitespace-nowrap',
      render: (value) => (
        <span className="text-red-600 tabular-nums font-medium">
          {formatAfn(Number(value) || 0)}
        </span>
      ),
    },
  ];

  const rowActions: TableAction[] = [
    {
      key: 'view',
      label: t('salesmen.viewDetails'),
      icon: <Eye className="h-4 w-4" />,
      onClick: (record) => navigate(`/salesmen/${record.id}`),
      tooltip: t('salesmen.viewDetails'),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: (record) => navigate(`/salesmen/${record.id}/edit`),
      tooltip: t('salesmen.editSalesman'),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => handleDelete(record.id, record.name),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('salesmen.deleteSalesman'),
    },
  ];

  const bulkActions: TableAction<any[]>[] = [
    {
      key: 'print',
      label: t('salesmen.printSelected'),
      icon: <Printer className="h-4 w-4" />,
      onClick: handlePrintSelected,
    },
  ];

  const filters: FilterOption[] = [
    {
      key: 'status',
      label: t('salesmen.status'),
      placeholder: t('common.filterByStatus'),
      width: 'sm:w-40',
      options: [
        { value: 'active', label: t('salesmen.active') },
        { value: 'inactive', label: t('salesmen.inactive') },
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
    statusFilter !== 'all' || !!searchTerm || isPeriodFiltered;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={salesmen}
        columns={columns}
        loading={isLoading}
        title={t('salesmen.title')}
        subtitle={t('salesmen.subtitle')}
        icon={<UserCheck className="h-5 w-5" />}
        headerActions={
          <div className="flex flex-wrap gap-2">
            {selectedRows.length > 0 && (
              <Button variant="outline" onClick={handlePrintSelected} disabled={printing}>
                <Printer className="h-4 w-4" />
                {printing ? t('salesmen.preparingPrint') : t('salesmen.printSelected')}
              </Button>
            )}
            <Button onClick={() => navigate('/salesmen/add')}>
              <Plus className="h-4 w-4" />
              {t('salesmen.addSalesmanButton')}
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
          if (key === 'status') {
            setStatusFilter(value);
            setCurrentPage(1);
            setSelectedRows([]);
          }
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
        emptyIcon={<UserCheck className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('common.noData')}
        emptyDescription={searchTerm ? t('common.noSearchResults') : t('salesmen.addFirstSalesman')}
        loadingText={t('common.loading')}
        maxHeight="75vh"
        stickyHeader
      />

      <ConfirmDialog />
    </div>
  );
};
