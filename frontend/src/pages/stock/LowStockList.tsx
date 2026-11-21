import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import DataTable, { TableColumn, TableAction } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import { formatOrderNumeric } from '@/lib/orderNumeric';
import {
  baseUomLabel,
  formatPackagingBreakdown,
  stockValue,
} from '@/lib/inventoryDisplay';
import type { InventoryBalance } from '@/types/inventory';

const LowStockList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading } = useFetchObjects<InventoryBalance[]>({
    queryKey: ['stocks-low-stock', searchTerm],
    endpoint: 'stocks/low-stock/',
  });

  const balances = (Array.isArray(data) ? data : [])
    .filter((row) => {
      if (!searchTerm.trim()) return true;
      const name = row.product_details?.name || '';
      const sku = row.product_details?.sku || '';
      const q = searchTerm.toLowerCase();
      return name.toLowerCase().includes(q) || sku.toLowerCase().includes(q);
    });

  const columns: TableColumn<InventoryBalance>[] = [
    {
      key: 'product_details',
      title: t('stock.product', 'Product'),
      width: '14rem',
      className: 'max-w-[14rem]',
      render: (value) => (
        <span className="block truncate font-medium" title={value?.name || '—'}>
          {value?.name || '—'}
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
      key: 'quantity_on_hand',
      title: t('stock.baseOnHand', 'On hand (base)'),
      width: '9rem',
      className: 'tabular-nums',
      render: (value, row) => {
        const uom = baseUomLabel(row.product_details);
        return `${formatOrderNumeric(Number(value) || 0)}${uom ? ` ${uom}` : ''}`;
      },
    },
    {
      key: 'reorder_level',
      title: t('stock.reorderLevel', 'Reorder level'),
      width: '8rem',
      className: 'tabular-nums',
      render: (_value, row) =>
        formatOrderNumeric(Number(row.product_details?.reorder_level) || 0),
    },
    {
      key: 'min_stock_level',
      title: t('stock.minStockLevel', 'Critical min'),
      width: '8rem',
      className: 'tabular-nums',
      render: (_value, row) =>
        formatOrderNumeric(Number(row.product_details?.min_stock_level) || 0),
    },
    {
      key: 'packaging_breakdown',
      title: t('stock.asPackaging', 'As packaging'),
      width: '14rem',
      render: (value) => formatPackagingBreakdown(value),
    },
    {
      key: 'stock_value',
      title: t('stock.onHandValue', 'Value'),
      width: '8rem',
      className: 'tabular-nums',
      render: (_value, row) =>
        formatOrderNumeric(stockValue(row.quantity_on_hand, row.average_cost)),
    },
    {
      key: 'status',
      title: t('common.status', 'Status'),
      width: '7rem',
      render: () => <Badge variant="secondary">{t('stock.lowStock', 'Low stock')}</Badge>,
    },
  ];

  const rowActions: TableAction<InventoryBalance>[] = [
    {
      key: 'view',
      label: t('common.view', 'View'),
      icon: <Eye className="h-4 w-4" />,
      onClick: (row) => navigate(`/stock/${row.id}`),
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={balances}
        columns={columns}
        loading={isLoading}
        title={t('stock.lowStock', 'Low stock')}
        subtitle={t(
          'stock.lowStockHint',
          'Balances at or below the product reorder level',
        )}
        icon={<TrendingDown className="h-5 w-5" />}
        searchable
        searchPlaceholder={t('stock.searchProducts', 'Search products…')}
        searchValue={searchTerm}
        onSearch={setSearchTerm}
        rowActions={rowActions}
        emptyIcon={<TrendingDown className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('stock.noLowStock', 'No low-stock items')}
        emptyDescription={t(
          'stock.noLowStockHint',
          'All tracked products are above reorder level.',
        )}
        maxHeight="75vh"
        stickyHeader
      />
    </div>
  );
};

export default LowStockList;
