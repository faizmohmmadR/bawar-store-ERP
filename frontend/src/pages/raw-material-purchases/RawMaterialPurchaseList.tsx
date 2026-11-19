import { Autocomplete } from '@/components/ui/autocomplete';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toCurrencyFilterOptions } from '@/lib/currencyChoices';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Eye, ShoppingCart, Package, DollarSign, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DataTable, { TableColumn, TableAction, FilterOption } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { CurrencyAmount } from '@/components/display/CurrencyAmount';
import { ListDate } from '@/components/display/ListDate';
import { formatListContactLine, listAmountClass, listBadgeClass, listTextClass } from '@/lib/listTableFormat';
import { cn } from '@/lib/utils';

const RawMaterialPurchaseList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [materialFilter, setMaterialFilter] = useState('');
  const [period, setPeriod] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: purchasesData, isLoading } = useFetchObjects<{
    results: any[];
    count: number;
  }>({
    queryKey: ['raw-material-purchases', currentPage.toString(), pageSize.toString(), searchTerm, vendorFilter, currencyFilter, statusFilter, materialFilter, period],
    endpoint: 'raw-material-purchases',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      ...(vendorFilter && { vendor: vendorFilter }),
      ...(materialFilter && { raw_material: materialFilter }),
      period,
      ...(currencyFilter !== 'all' && { currency: currencyFilter }),
      ...(statusFilter !== 'all' && { status: statusFilter })
    }
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['raw-material-purchases'],
    endpoint: 'raw-material-purchases'
  });

  const purchases = purchasesData?.results || [];
  const totalItems = purchasesData?.count || 0;

  const handleEdit = (purchase: any) => {
    navigate(`/raw-material-purchases/${purchase.id}/edit`);
  };

  const handleDetails = (purchase: any) => {
    navigate(`/raw-material-purchases/${purchase.id}`);
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
      title: t('rawMaterialPurchases.invoiceNumber'),
      render: (value, record) => {
        const line = `${value}`;
        return (
          <span className={`${listTextClass} font-semibold truncate block`} title={line}>
            {line}
          </span>
        );
      },
    },
    {
      key: 'bill_number',
      title: t('rawMaterialPurchases.billNumber'),
      render: (value) => (
        <span className={`${listTextClass} truncate block`} title={value || ''}>
          {value || '—'}
        </span>
      ),
    },
    {
      key: 'vendor_details',
      title: t('rawMaterialPurchases.vendor'),
      className: 'max-w-[180px]',
      render: (value) => {
        const name = value?.name || t('common.notAvailable');
        const line = formatListContactLine(name, value?.email);
        return (
          <span className={`${listTextClass} truncate block`} title={line}>
            {line}
          </span>
        );
      },
    },
    {
      key: 'purchase_date',
      title: t('rawMaterialPurchases.purchaseDate'),
      className: 'whitespace-nowrap',
      render: (value) => <ListDate value={value} />,
    },
    {
      key: 'status',
      title: t('common.status'),
      render: (value) => {
        const variants: Record<string, any> = {
          received: 'default',
          pending: 'secondary',
          draft: 'outline',
          cancelled: 'destructive'
        };
        return <Badge variant={variants[value] || 'outline'} className={listBadgeClass}>{t(`rawMaterialPurchases.status.${value}`, value) || t('common.notAvailable')}</Badge>;
      }
    },
    {
      key: 'total_amount',
      title: t('common.total'),
      className: 'whitespace-nowrap',
      render: (value, record) => (
        <span className="text-sm font-bold text-primary whitespace-nowrap tabular-nums">
          <CurrencyAmount amount={value} currency={record.currency_details} showCode className="font-bold text-primary" />
        </span>
      ),
    },
    {
      key: 'paid_amount',
      title: t('rawMaterialPurchases.paidAmount'),
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
      key: 'final_total',
      title: t('rawMaterialPurchases.finalTotal'),
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
      label: t('common.view'),
      icon: <Eye className="h-4 w-4" />,
      onClick: handleDetails,
      tooltip: t('common.view')
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: handleEdit,
      tooltip: t('common.edit')
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => handleDelete(record.id, record.invoice_number),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('common.delete')
    }
  ];

  const filters: FilterOption[] = [
    {
      key: 'status',
      label: t('common.status'),
      placeholder: t('rawMaterialPurchases.filterByStatus'),
      width: 'sm:w-40',
      options: [
        { value: 'draft', label: t('rawMaterialPurchases.status.draft') },
        { value: 'pending', label: t('rawMaterialPurchases.status.pending') },
        { value: 'received', label: t('rawMaterialPurchases.status.received') },
        { value: 'cancelled', label: t('rawMaterialPurchases.status.cancelled') }
      ]
    },
  ];

  const filterValues = {
    currency: currencyFilter,
    status: statusFilter
  };

  const handleFilterChange = (key: string, value: string) => {
    if (key === 'currency') { setCurrencyFilter(value); setCurrentPage(1); }
    if (key === 'status') {
      setStatusFilter(value);
      setCurrentPage(1);
    }
  };

  const handleClearFilters = () => {
    setVendorFilter('');
    setMaterialFilter('');
    setPeriod('all');
    setCurrencyFilter('all');
    setStatusFilter('all');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={purchases}
        columns={columns}
        loading={isLoading}
        title={t('rawMaterialPurchases.title')}
        subtitle={`${t('rawMaterialPurchases.managePurchases')} ${t('stock.purchaseHistoryHint')}`}
        icon={<ShoppingCart className="h-5 w-5" />}
        headerActions={
          <Button onClick={() => navigate('/raw-material-purchases/add')}>
            <Plus className="h-4 w-4" />
            {t('rawMaterialPurchases.addPurchase')}
          </Button>
        }
        singleRowFilters
        searchable
        searchPlaceholder={t('rawMaterialPurchases.searchPurchases')}
        searchValue={searchTerm}
        onSearch={handleSearch}
        filters={[...filters, { key: 'currency', label: t('rawMaterialPurchases.currency'), options: toCurrencyFilterOptions() }]}
        customFilters={[
          { key: 'vendor', label: t('rawMaterialPurchases.vendor'), width: 'sm:w-52', component: <Autocomplete variant="filter" endpoint="vendors" value={vendorFilter} onChange={value => { setVendorFilter(value ? String(value) : ''); setCurrentPage(1); }} getOptionLabel={option => option.name} getOptionValue={option => String(option.id)} placeholder={t('common.all')} /> },
          { key: 'material', label: t('rawMaterialStock.rawMaterial'), width: 'sm:w-52', component: <Autocomplete variant="filter" endpoint="raw-materials" value={materialFilter} onChange={value => { setMaterialFilter(value ? String(value) : ''); setCurrentPage(1); }} getOptionLabel={option => option.name} getOptionValue={option => String(option.id)} placeholder={t('common.all')} /> },
          { key: 'period', label: t('reports.period'), component: <Select value={period} onValueChange={value => { setPeriod(value); setCurrentPage(1); }}><SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger><SelectContent>{[['all', 'allTime'], ['daily', 'today'], ['weekly', 'thisWeek'], ['yearly', 'thisYear']].map(([value, label]) => <SelectItem key={value} value={value}>{t(`reports.${label}`)}</SelectItem>)}</SelectContent></Select> },
        ]}
        filterValues={filterValues}
        onFilterChange={handleFilterChange}
        showClearFilters={true}
        clearFiltersLabel={t('rawMaterialPurchases.clearFilters')}
        onClearFilters={handleClearFilters}
        rowActions={rowActions}
        rowActionsAsMenu
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
        emptyTitle={t('rawMaterialPurchases.noPurchasesFound')}
        emptyDescription={searchTerm ? t('rawMaterialPurchases.tryAdjustingSearch') : t('rawMaterialPurchases.addFirstPurchase')}
        loadingText={t('rawMaterialPurchases.loadingPurchases')}
        maxHeight="75vh"
        stickyHeader={true}
      />

      <ConfirmDialog />
    </div>
  );
};

export default RawMaterialPurchaseList;
