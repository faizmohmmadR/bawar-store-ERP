import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Eye, ShoppingCart, DollarSign, Undo2, Printer, PackagePlus, FileBarChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Autocomplete } from '@/components/ui/autocomplete';
import DataTable, { TableColumn, TableAction, FilterOption, CustomFilter } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import {
  toCurrencyFilterOptions,
} from '@/lib/currencyChoices';
import { CurrencyAmount } from '@/components/display/CurrencyAmount';
import { ListDate } from '@/components/display/ListDate';
import { formatListContactLine, listAmountClass, listBadgeClass, listTextClass } from '@/lib/listTableFormat';
import { cn } from '@/lib/utils';
import { printSaleBill } from '@/pages/sales/print';

export const SaleList = () => {
  const { t, language, direction } = useLanguage();
  const { calendar } = useCalendarPreference();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [printingId, setPrintingId] = useState<string | number | null>(null);

  const { data: salesData, isLoading } = useFetchObjects<{
    results: any[];
    count: number;
    next: string | null;
    previous: string | null;
  }>({
    queryKey: ['sales', currentPage.toString(), pageSize.toString(), searchTerm, customerFilter, currencyFilter, statusFilter],
    endpoint: 'sales',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      ...(customerFilter && { customer: customerFilter }),
      ...(currencyFilter !== 'all' && { currency: currencyFilter }),
      ...(statusFilter !== 'all' && { status: statusFilter })
    }
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['sales'],
    endpoint: 'sales',
    additionalQueryKeys: [
      'employee-payroll-history',
      'employee-financial-summary',
      'employee-yearly-summary',
      'payrolls',
      'employee',
      'employees',
    ],
  });

  const sales = salesData?.results || [];
  const totalItems = salesData?.count || 0;

  const handleEdit = (sale: any) => {
    navigate(`/sales/${sale.id}/edit`);
  };

  const handleDetails = (sale: any) => {
    navigate(`/sales/${sale.id}`);
  };

  const handlePrint = async (sale: any) => {
    try {
      setPrintingId(sale.id);
      await printSaleBill({
        saleId: sale.id,
        language,
        direction,
        calendar,
        t,
      });
    } catch (err) {
      console.error(err);
      alert(t('sales.printFailed', 'Could not print this sale. Try again.'));
    } finally {
      setPrintingId(null);
    }
  };

  const columns: TableColumn[] = [
    {
      key: 'transaction_type',
      title: t('common.transactionType', 'Type'),
      width: '4.5rem',
      className: 'whitespace-nowrap',
      render: value => value === 'free' ? t('common.free', 'Free') : t('common.paid', 'Paid'),
    },
    {
      key: 'invoice_number',
      title: t('sales.invoiceNumber'),
      width: '8rem',
      className: 'whitespace-nowrap',
      render: (value) => (
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 shrink-0 rounded-full bg-primary/100"></div>
          <span className="font-semibold">{value}</span>
        </div>
      )
    },
    {
      key: 'bill_no',
      title: t('sales.billNo', 'Bill No'),
      width: '6rem',
      className: 'whitespace-nowrap',
      render: (value) =>
        value ? (
          <span className="text-sm font-medium">{value}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: 'customer_details',
      title: t('sales.customer'),
      className: 'max-w-[180px]',
      render: (value, record) => {
        const employeeName = record?.employee_details?.full_name;
        const name = employeeName || value?.name || t('common.notAvailable');
        const line = employeeName
          ? `${name} · ${t('sales.employee', 'Employee')}`
          : formatListContactLine(name, value?.email);
        return (
          <span className={`${listTextClass} truncate block`} title={line}>
            {line}
          </span>
        );
      },
    },
    {
      key: 'sale_date',
      title: t('sales.saleDate'),
      className: 'whitespace-nowrap',
      render: (value) => <ListDate value={value} />,
    },
    {
      key: 'status',
      title: t('common.status'),
      render: (value) => {
        const variants: Record<string, any> = {
          delivered: 'default',
          confirmed: 'secondary',
          draft: 'outline',
          cancelled: 'destructive'
        };
        return (
          <Badge variant={variants[value] || 'outline'} className={listBadgeClass}>
            {t(`sales.status.${value}`, value) || t('common.notAvailable')}
          </Badge>
        );
      }
    },
    {
      key: 'subtotal_amount',
      title: t('sales.subtotal'),
      className: 'whitespace-nowrap',
      render: (value, record) => (
        <CurrencyAmount amount={value} currency={record.currency_details} showCode className="text-gray-700" />
      ),
    },
    {
      key: 'discount_amount',
      title: t('sales.discount'),
      className: 'whitespace-nowrap',
      render: (value, record) => {
        const amount = parseFloat(value?.toString() || '0');
        if (amount === 0) return <span className="text-muted-foreground">-</span>;
        return (
          <CurrencyAmount
            amount={amount}
            currency={record.currency_details}
            showCode
            prefixSign="-"
            className="text-accent"
          />
        );
      },
    },
    {
      key: 'final_total',
      title: t('sales.grandTotal'),
      className: 'whitespace-nowrap',
      render: (value, record) => (
        <CurrencyAmount
          amount={value ?? record.total_amount}
          currency={record.currency_details}
          showCode
          className="font-bold text-primary"
        />
      ),
    },
    {
      key: 'paid_amount',
      title: t('sales.paidAmount'),
      className: 'whitespace-nowrap',
      render: (value, record) => (
        <CurrencyAmount
          amount={value}
          currency={record.currency_details}
          showCode
          className="text-primary font-medium"
        />
      ),
    },
    {
      key: 'remaining_amount',
      title: t('sales.dueAmount'),
      className: 'whitespace-nowrap text-start',
      render: (_value, record) => {
        const total = parseFloat(record.total_amount?.toString() || '0');
        const paid = parseFloat(record.paid_amount?.toString() || '0');
        const remaining = total - paid;
        return (
          <CurrencyAmount
            amount={remaining}
            currency={record.currency_details}
            showCode
            className={cn(
              listAmountClass,
              remaining > 0 ? 'text-red-600' : 'text-muted-foreground',
            )}
          />
        );
      },
    },
  ];

  const rowActions: TableAction[] = [
    {
      key: 'view',
      label: t('sales.viewSale'),
      icon: <Eye className="h-4 w-4" />,
      onClick: handleDetails,
      tooltip: t('sales.viewSale'),
    },
    {
      key: 'recordPayment',
      label: t('sales.recordPayment'),
      icon: <DollarSign className="h-4 w-4" />,
      onClick: (record) => navigate(`/sale-payments/add?sale_id=${record.id}`),
      tooltip: t('sales.recordPayment'),
    },
    {
      key: 'print',
      label: t('sales.printInvoice'),
      icon: <Printer className="h-4 w-4" />,
      onClick: handlePrint,
      tooltip: t('sales.printInvoice'),
    },
    {
      key: 'return',
      label: t('returns.addReturn'),
      icon: <Undo2 className="h-4 w-4" />,
      onClick: (record) => navigate(`/sales/${record.id}/return`),
      tooltip: t('returns.addReturn'),
    },
    {
      key: 'addRawMaterial',
      label: t('sales.addRawMaterial', 'Add raw material'),
      icon: <PackagePlus className="h-4 w-4" />,
      onClick: (record) => {
        if (record.status === 'cancelled') return;
        navigate(`/sales/${record.id}/add-raw-material`);
      },
      tooltip: t('sales.addRawMaterial', 'Add raw material'),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: handleEdit,
      tooltip: t('common.edit'),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => handleDelete(record.id, record.invoice_number),
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('common.delete'),
    },
  ];

  const currencyFilterOptions = toCurrencyFilterOptions();

  const filters: FilterOption[] = [
    {
      key: 'status',
      label: t('common.status'),
      placeholder: t('sales.filterByStatus'),
      width: 'sm:w-40',
      options: [
        { value: 'draft', label: t('sales.status.draft') },
        { value: 'confirmed', label: t('sales.status.confirmed') },
        { value: 'delivered', label: t('sales.status.delivered') },
        { value: 'cancelled', label: t('sales.status.cancelled') }
      ]
    },
    {
      key: 'currency',
      label: t('sales.currency', 'Currency'),
      placeholder: t('sales.filterByCurrency', 'Filter by currency'),
      width: 'sm:w-40',
      options: currencyFilterOptions,
    },
  ];

  const filterValues = {
    currency: currencyFilter,
    status: statusFilter
  };

  const handleFilterChange = (key: string, value: string) => {
    if (key === 'currency') {
      setCurrencyFilter(value);
      setCurrentPage(1);
    } else if (key === 'status') {
      setStatusFilter(value);
      setCurrentPage(1);
    }
  };

  const handleClearFilters = () => {
    setCustomerFilter('');
    setCurrencyFilter('all');
    setStatusFilter('all');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const hasActiveFilters = customerFilter || currencyFilter !== 'all' || statusFilter !== 'all' || searchTerm;

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const customFilters = [
    {
      key: 'customer',
      label: t('sales.customer'),
      component: (
        <Autocomplete
          endpoint="customers"
          value={customerFilter}
          onChange={(value) => {
            setCustomerFilter(value);
            setCurrentPage(1);
          }}
          placeholder={t('sales.filterByCustomer')}
          getOptionLabel={(c) => c.name}
          getOptionValue={(c) => c.id.toString()}
        />
      )
    }
  ];



  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={sales}
        columns={columns}
        loading={isLoading}
        title={t('sales.title')}
        subtitle={t('sales.manageSaleTransactions')}
        icon={<ShoppingCart className="h-5 w-5" />}
        headerActions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate('/sales/report')}>
              <FileBarChart className="h-4 w-4" />
              {t('sales.reportTitle', 'Report')}
            </Button>
            <Button onClick={() => navigate('/sales/add')}>
              <Plus className="h-4 w-4" />
              {t('sales.addSale')}
            </Button>
          </div>
        }
        searchable
        searchPlaceholder={t('sales.searchSales')}
        searchValue={searchTerm}
        onSearch={handleSearch}
        customFilters={customFilters}
        filters={filters}
        filterValues={filterValues}
        customFilterValues={{ customer: customerFilter }}
        onFilterChange={handleFilterChange}
        showClearFilters={true}
        clearFiltersLabel={t('common.clearFilters')}
        onClearFilters={handleClearFilters}
        rowActions={rowActions}
        rowActionsAsMenu
        onRowClick={handleDetails}
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
        emptyIcon={<ShoppingCart className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('common.noDataFound')}
        emptyDescription={searchTerm ? t('common.noSearchResults') : t('sales.addSaleDescription')}
        loadingText={t('common.loading')}
        maxHeight="75vh"
        stickyHeader={true}
      />

      <ConfirmDialog />
    </div>
  );
};