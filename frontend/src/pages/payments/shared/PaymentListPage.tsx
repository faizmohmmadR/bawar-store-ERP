import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Edit, Trash2, Eye, CreditCard, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DataTable, { TableColumn, TableAction } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import {
  toCurrencyFilterOptions,
} from '@/lib/currencyChoices';
import { CurrencyAmount } from '@/components/display/CurrencyAmount';
import { ListDate } from '@/components/display/ListDate';
import { listBadgeClass } from '@/lib/listTableFormat';
import { FilterOption } from '@/components/ui/data-table';
import OrderAutocomplete from '@/components/payments/OrderAutocomplete';
import { Payment } from '@/types/payment';
import { getPaymentConfig, PaymentModuleType } from './paymentConfig';

interface PaymentListPageProps {
  type: PaymentModuleType;
  filterMethod?: 'cash' | 'bank' | 'sarafi' | 'intermediary_credit';
  titleOverride?: string;
  subtitleOverride?: string;
  addPathOverride?: string;
  addLabelOverride?: string;
  emptyDescriptionOverride?: string;
}

const PaymentListPage = ({
  type,
  filterMethod,
  titleOverride,
  subtitleOverride,
  addPathOverride,
  addLabelOverride,
  emptyDescriptionOverride,
}: PaymentListPageProps) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const config = getPaymentConfig(type);
  const [searchParams] = useSearchParams();

  const initialOrderFilter = searchParams.get(config.orderQueryParam) || '';
  const [searchTerm, setSearchTerm] = useState('');
  const [orderFilter, setOrderFilter] = useState(initialOrderFilter);
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: paymentsData, isLoading } = useFetchObjects<{
    results: Payment[];
    count: number;
  }>({
    queryKey: [
      config.queryKey,
      currentPage.toString(),
      pageSize.toString(),
      searchTerm,
      orderFilter,
      currencyFilter,
    ],
    endpoint: 'payments/',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      payment_type: config.paymentType,
      ...(orderFilter && { object_id: orderFilter }),
      ...(filterMethod && { payment_method: filterMethod }),
      ...(currencyFilter !== 'all' && { currency: currencyFilter }),
    },
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: [config.queryKey],
    endpoint: 'payments',
  });

  const payments = paymentsData?.results || [];
  const totalItems = paymentsData?.count || 0;

  const isPurchase = type === 'purchase';
  const title =
    titleOverride ||
    (isPurchase ? t('payments.purchasePayments') : t('payments.salePayments'));
  const subtitle =
    subtitleOverride ||
    (isPurchase
      ? t('payments.managePurchasePayments')
      : t('payments.manageSalePayments'));
  const addLabel =
    addLabelOverride ||
    (isPurchase ? t('payments.addPurchasePayment') : t('payments.addSalePayment'));
  const emptyDescription =
    emptyDescriptionOverride ||
    (isPurchase
      ? t('payments.addFirstPurchasePayment', 'Add your first purchase payment')
      : t('payments.addFirstSalePayment'));

  const partyColumnKey = isPurchase ? 'vendor_name' : 'customer_name';
  const partyTitle = isPurchase
    ? t('rawMaterialPurchases.vendor', 'Vendor')
    : t('sales.customer');

  const columns: TableColumn[] = [
    {
      key: 'related_object_details',
      title: t('payments.relatedInvoice'),
      render: (value, record) => (
        <span className="font-semibold text-primary">{value?.invoice_number || '-'}{record.is_advance && <span className="ms-2 text-xs text-muted-foreground">{t('payments.advancePayment', 'Advance payment')}</span>}{record.general_payment && <span className="ms-2 text-xs text-muted-foreground">GPAY-{record.general_payment}</span>}</span>
      ),
    },
    {
      key: 'related_object_details',
      title: partyTitle,
      render: (value) => (
        <span className="text-sm">{value?.[partyColumnKey] || '-'}</span>
      ),
    },
    {
      key: 'amount',
      title: t('payments.amount'),
      render: (value, record) => (
        <CurrencyAmount
          amount={value}
          currency={record.currency_details}
          className="font-semibold"
          showCode
        />
      ),
    },
    {
      key: 'payment_date',
      title: t('payments.paymentDate'),
      className: 'whitespace-nowrap',
      render: (value) => <ListDate value={value} />,
    },
    {
      key: 'payment_method',
      title: t('payments.paymentMethod', 'Method'),
      render: (value) => (
        <Badge variant="outline" className={listBadgeClass}>
          {t(`payments.methods.${value || 'cash'}`, value || 'cash')}
        </Badge>
      ),
    },
    {
      key: 'reference_number',
      title: t('payments.reference'),
      render: (value) => <span className="font-mono text-sm">{value || '-'}</span>,
    },
    {
      key: 'payment_type',
      title: t('payments.type'),
      render: () => (
        <Badge variant="default" className={listBadgeClass}>
          {isPurchase ? t('payments.purchasePayment', 'Purchase payment') : t('payments.salePayment')}
        </Badge>
      ),
    },
  ];

  const rowActions: TableAction[] = [
    {
      key: 'view',
      label: t('payments.viewDetails'),
      icon: <Eye className="h-4 w-4" />,
      onClick: (record) => navigate(record.general_payment ? `${config.listPath}/general/${record.general_payment}` : config.detailPath(record.id)),
      tooltip: t('payments.viewDetails'),
    },
    {
      key: 'recordPayment',
      label: t('payments.recordPayment'),
      icon: <DollarSign className="h-4 w-4" />,
      onClick: (record) => {
        const orderId = record.related_object_details?.id;
        if (orderId) navigate(config.orderAddPath(orderId));
      },
      variant: 'ghost',
      className: 'text-primary hover:text-primary',
      tooltip: t('payments.recordPayment'),
      show: (record) => record.payment_method !== 'intermediary_credit' && !record.general_payment,
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: (record) => navigate(config.editPath(record.id)),
      tooltip: t('payments.editPayment'),
      show: (record) => record.payment_method !== 'intermediary_credit' && !record.general_payment,
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) =>
        handleDelete(
          record.id,
          `${record.related_object_details?.invoice_number || 'Payment'} - ${record.amount}`
        ),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('payments.deletePayment'),
      show: (record) => record.payment_method !== 'intermediary_credit' && !record.general_payment,
    },
  ];

  const orderFilterComponent = {
    key: 'order',
    label: t('payments.filterBySale'),
    component: (
      <OrderAutocomplete
        type={type}
        value={orderFilter}
        onChange={(value) => {
          setOrderFilter(value);
          setCurrentPage(1);
        }}
        placeholder={
          t('payments.selectSale')
        }
      />
    ),
  };

  const currencyFilterOptions = toCurrencyFilterOptions();

  const paymentFilters: FilterOption[] = [
    {
      key: 'currency',
      label: t('payments.currency'),
      placeholder: t('accounts.selectCurrency'),
      width: 'sm:w-40',
      options: currencyFilterOptions,
    },
  ];

  const hasActiveFilters = Boolean(orderFilter || currencyFilter !== 'all' || searchTerm);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={payments}
        columns={columns}
        loading={isLoading}
        title={title}
        subtitle={subtitle}
        icon={<CreditCard className="h-5 w-5" />}
        headerActions={
          <div className="flex gap-2"><Button variant="outline" onClick={() => navigate(`${config.listPath}/general`)}>{t('payments.generalList', 'General payments')}</Button>
          <Button onClick={() => navigate(addPathOverride || config.addPath)}>
            <Plus className="h-4 w-4" />
            {addLabel}
          </Button></div>
        }
        searchable
        searchPlaceholder={t('payments.searchPayments')}
        searchValue={searchTerm}
        onSearch={(value) => {
          setSearchTerm(value);
          setCurrentPage(1);
        }}
        customFilters={[orderFilterComponent]}
        filters={paymentFilters}
        filterValues={{ currency: currencyFilter }}
        onFilterChange={(key, value) => {
          if (key === 'currency') {
            setCurrencyFilter(value);
            setCurrentPage(1);
          }
        }}
        showClearFilters={hasActiveFilters}
        clearFiltersLabel={t('payments.clearFilters')}
        onClearFilters={() => {
          setOrderFilter('');
          setCurrencyFilter('all');
          setSearchTerm('');
          setCurrentPage(1);
        }}
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
          },
        }}
        emptyIcon={<CreditCard className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('payments.noPayments')}
        emptyDescription={
          searchTerm ? t('common.noSearchResults') : emptyDescription
        }
        loadingText={t('payments.loadingPayments')}
        maxHeight="75vh"
        stickyHeader
      />
      <ConfirmDialog />
    </div>
  );
};

export default PaymentListPage;
