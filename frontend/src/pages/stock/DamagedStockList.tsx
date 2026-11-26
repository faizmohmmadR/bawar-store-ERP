import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertOctagon, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DataTable, { TableColumn } from '@/components/ui/data-table';
import { ListDate } from '@/components/display/ListDate';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import { formatDisplayMoney } from '@/lib/displayMoney';
import { formatOrderNumeric } from '@/lib/orderNumeric';
import { listBadgeClass } from '@/lib/listTableFormat';

type DamagedAdjustment = {
  id: number;
  product?: number | null;
  product_name?: string | null;
  warehouse?: number | null;
  warehouse_name?: string | null;
  quantity_change?: number | string;
  quantity_before?: number | string;
  quantity_after?: number | string;
  unit_cost?: number | string | null;
  loss_value?: number | string | null;
  reason?: string | null;
  adjustment_date?: string | null;
  adjusted_by_name?: string | null;
  adjustment_type?: string;
  adjustment_type_display?: string;
};

const DamagedStockList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data, isLoading } = useFetchObjects<{
    results: DamagedAdjustment[];
    count: number;
  }>({
    queryKey: [
      'stock-adjustments-damaged',
      currentPage.toString(),
      pageSize.toString(),
      searchTerm,
    ],
    endpoint: 'stock-adjustments/',
    params: {
      page: currentPage,
      page_size: pageSize,
      adjustment_type: 'damaged',
      search: searchTerm,
    },
  });

  const rows = data?.results || [];
  const totalItems = data?.count || 0;

  const columns: TableColumn<DamagedAdjustment>[] = [
    {
      key: 'product_name',
      title: t('stock.product', 'Product'),
      width: '14rem',
      className: 'max-w-[14rem]',
      render: (value) => (
        <span className="block truncate font-medium" title={value || '—'}>
          {value || '—'}
        </span>
      ),
    },
    {
      key: 'warehouse_name',
      title: t('stock.warehouse', 'Warehouse'),
      width: '9rem',
      render: (value) => value || '—',
    },
    {
      key: 'quantity_change',
      title: t('stock.quantity', 'Quantity'),
      width: '8rem',
      className: 'tabular-nums',
      render: (value) => formatOrderNumeric(Math.abs(Number(value) || 0)),
    },
    {
      key: 'unit_cost',
      title: t('stock.unitCost', 'Unit cost'),
      width: '8rem',
      className: 'tabular-nums',
      render: (value) => formatDisplayMoney(Number(value) || 0, 'AFN'),
    },
    {
      key: 'loss_value',
      title: t('stock.lossValue', 'Loss value'),
      width: '8rem',
      className: 'tabular-nums',
      render: (value) => formatDisplayMoney(Number(value) || 0, 'AFN'),
    },
    {
      key: 'reason',
      title: t('stock.reason', 'Reason'),
      width: '14rem',
      className: 'max-w-[14rem]',
      render: (value) => (
        <span className="block truncate" title={value || '—'}>
          {value || '—'}
        </span>
      ),
    },
    {
      key: 'adjustment_date',
      title: t('stock.date', 'Date'),
      width: '8rem',
      render: (value) => <ListDate value={value} />,
    },
    {
      key: 'adjusted_by_name',
      title: t('stock.adjustedBy', 'Recorded by'),
      width: '9rem',
      render: (value) => value || '—',
    },
    {
      key: 'adjustment_type',
      title: t('common.status', 'Status'),
      width: '7rem',
      render: () => (
        <Badge variant="destructive" className={listBadgeClass}>
          {t('stock.condition.damaged', 'Damaged')}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={rows}
        columns={columns}
        loading={isLoading}
        title={t('stock.damagedStock', 'Damaged Products')}
        subtitle={t(
          'stock.damagedStockSubtitle',
          'Products removed from sellable stock as damaged. Loss posts to stock adjustment expense.',
        )}
        icon={<AlertOctagon className="h-5 w-5" />}
        searchable
        searchPlaceholder={t('stock.searchDamagedStocks', 'Search damaged stock…')}
        searchValue={searchTerm}
        onSearch={(value) => {
          setSearchTerm(value);
          setCurrentPage(1);
        }}
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
        emptyIcon={<AlertOctagon className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('stock.noDamagedStock', 'No damaged products')}
        emptyDescription={t(
          'stock.noDamagedStockHint',
          'When products are damaged, add them here from good stock.',
        )}
        emptyAction={
          <Button onClick={() => navigate('/stock/damaged/add')}>
            <Plus className="me-2 h-4 w-4" />
            {t('stock.addDamagedStock', 'Add Damaged Product')}
          </Button>
        }
        maxHeight="75vh"
        stickyHeader
        headerActions={
          <Button onClick={() => navigate('/stock/damaged/add')}>
            <Plus className="me-2 h-4 w-4" />
            {t('stock.addDamagedStock', 'Add Damaged Product')}
          </Button>
        }
      />
    </div>
  );
};

export default DamagedStockList;
