import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Package, FileBarChart, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Autocomplete } from '@/components/ui/autocomplete';
import DataTable, { TableColumn, TableAction } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import { formatOrderNumeric } from '@/lib/orderNumeric';
import {
  baseUomLabel,
  formatPackagingBreakdown,
  stockValue,
} from '@/lib/inventoryDisplay';
import { resolveBarcode } from '@/lib/resolveBarcode';
import { notifyError } from '@/lib/notify';
import type { InventoryBalance } from '@/types/inventory';

const StockList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data, isLoading } = useFetchObjects<{
    results: InventoryBalance[];
    count: number;
  }>({
    queryKey: [
      'inventory-balances',
      currentPage.toString(),
      pageSize.toString(),
      searchTerm,
      productFilter,
      warehouseFilter,
    ],
    endpoint: 'inventory-balances/',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      ...(productFilter && { product: productFilter }),
      ...(warehouseFilter && { warehouse: warehouseFilter }),
    },
  });

  const balances = data?.results || [];
  const totalItems = data?.count || 0;

  const statusFor = (row: InventoryBalance) => {
    const onHand = Number(row.quantity_on_hand) || 0;
    const reorder = Number(row.product_details?.reorder_level) || 0;
    const minimum = Number(row.product_details?.min_stock_level) || 0;
    if (onHand <= 0) {
      return { label: t('stock.outOfStock', 'Out of stock'), variant: 'destructive' as const };
    }
    if (minimum > 0 && onHand <= minimum) {
      return { label: t('stock.criticalStock', 'Critical'), variant: 'destructive' as const };
    }
    if (reorder > 0 && onHand <= reorder) {
      return { label: t('stock.lowStock', 'Low stock'), variant: 'secondary' as const };
    }
    return { label: t('stock.inStock', 'In stock'), variant: 'default' as const };
  };

  const columns: TableColumn<InventoryBalance>[] = [
    {
      key: 'product_details',
      title: t('stock.product', 'Product'),
      width: '14rem',
      className: 'max-w-[14rem]',
      render: (value) => {
        const name = value?.name || t('common.notAvailable');
        const sku = value?.sku;
        return (
          <div className="min-w-0 space-y-0.5">
            <span className="block truncate font-medium" title={name}>{name}</span>
            {sku ? <span className="block truncate text-xs text-muted-foreground">SKU {sku}</span> : null}
          </div>
        );
      },
    },
    {
      key: 'warehouse_name',
      title: t('stock.warehouse', 'Warehouse'),
      width: '9rem',
      className: 'max-w-[9rem]',
      render: (value) => (
        <span className="block truncate" title={value || '—'}>{value || '—'}</span>
      ),
    },
    {
      key: 'quantity_on_hand',
      title: t('stock.baseOnHand', 'On hand (base)'),
      width: '9rem',
      className: 'whitespace-nowrap tabular-nums',
      render: (value, row) => {
        const uom = baseUomLabel(row.product_details);
        return (
          <span>
            {formatOrderNumeric(Number(value) || 0)}
            {uom ? <span className="ms-1 text-muted-foreground">{uom}</span> : null}
          </span>
        );
      },
    },
    {
      key: 'quantity_available',
      title: t('stock.available', 'Available'),
      width: '8rem',
      className: 'whitespace-nowrap tabular-nums',
      render: (value, row) => {
        const available = value ?? Number(row.quantity_on_hand) - Number(row.quantity_reserved || 0);
        const uom = baseUomLabel(row.product_details);
        return (
          <span>
            {formatOrderNumeric(Number(available) || 0)}
            {uom ? <span className="ms-1 text-muted-foreground">{uom}</span> : null}
          </span>
        );
      },
    },
    {
      key: 'packaging_breakdown',
      title: t('stock.asPackaging', 'As packaging'),
      width: '14rem',
      className: 'max-w-[14rem]',
      render: (value) => {
        const text = formatPackagingBreakdown(value);
        return (
          <span className="block truncate text-sm" title={text}>{text}</span>
        );
      },
    },
    {
      key: 'average_cost',
      title: t('stock.avgCost', 'Avg cost (AFN)'),
      width: '8rem',
      className: 'whitespace-nowrap tabular-nums',
      render: (value) => formatOrderNumeric(Number(value) || 0),
    },
    {
      key: 'stock_value',
      title: t('stock.onHandValue', 'Value'),
      width: '8rem',
      className: 'whitespace-nowrap tabular-nums',
      render: (_value, row) => formatOrderNumeric(stockValue(row.quantity_on_hand, row.average_cost)),
    },
    {
      key: 'status',
      title: t('common.status', 'Status'),
      width: '7rem',
      render: (_value, row) => {
        const status = statusFor(row);
        return <Badge variant={status.variant}>{status.label}</Badge>;
      },
    },
  ];

  const rowActions: TableAction<InventoryBalance>[] = [
    {
      key: 'view',
      label: t('common.view', 'View'),
      icon: <Eye className="h-4 w-4" />,
      onClick: (row) => navigate(`/stock/${row.id}`),
      tooltip: t('stock.viewStock', 'View stock'),
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={balances}
        columns={columns}
        loading={isLoading}
        title={t('stock.title', 'Stock')}
        subtitle={t(
          'stock.manageInventoryBalances',
          'On-hand balances by product and warehouse (base units)',
        )}
        icon={<Package className="h-5 w-5" />}
        headerActions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate('/stock/low-stock')}>
              <AlertTriangle className="h-4 w-4" />
              {t('stock.lowStock', 'Low stock')}
            </Button>
            <Button variant="outline" onClick={() => navigate('/stock/report')}>
              <FileBarChart className="h-4 w-4" />
              {t('stock.report', 'Report')}
            </Button>
          </div>
        }
        searchable
        searchPlaceholder={t(
          'stock.searchProductsBarcode',
          'Search name, SKU, or barcode…',
        )}
        searchValue={searchTerm}
        onSearch={(value) => {
          setSearchTerm(value);
          setCurrentPage(1);
        }}
        customFilters={[
          {
            key: 'warehouse',
            label: t('stock.warehouse', 'Warehouse'),
            width: 'sm:w-48',
            component: (
              <Autocomplete
                variant="filter"
                endpoint="warehouses"
                value={warehouseFilter}
                onChange={(value) => {
                  setWarehouseFilter(value?.toString() || '');
                  setCurrentPage(1);
                }}
                placeholder={t('stock.allWarehouses', 'All warehouses')}
                getOptionLabel={(wh) => wh.name}
                getOptionValue={(wh) => wh.id.toString()}
                className="h-9 w-full"
              />
            ),
          },
          {
            key: 'product',
            label: t('stock.product', 'Product'),
            width: 'sm:w-56',
            component: (
              <Autocomplete
                variant="filter"
                endpoint="products"
                value={productFilter}
                onChange={(value) => {
                  setProductFilter(value?.toString() || '');
                  setCurrentPage(1);
                }}
                onCodeSubmit={async (code) => {
                  const resolved = await resolveBarcode(code);
                  if (!resolved) {
                    notifyError(
                      t('products.barcodeNotFound', 'No product found for this barcode'),
                    );
                    return false;
                  }
                  setProductFilter(String(resolved.product.id));
                  setSearchTerm('');
                  setCurrentPage(1);
                  return true;
                }}
                placeholder={t('stock.allProducts', 'All products')}
                searchPlaceholder={t(
                  'products.scanOrSearchProduct',
                  'Scan barcode or search name / SKU',
                )}
                getOptionLabel={(p) =>
                  [p.sku, p.name].filter(Boolean).join(' · ') || p.name
                }
                getOptionValue={(p) => p.id.toString()}
                className="h-9 w-full"
              />
            ),
          },
        ]}
        customFilterValues={{ warehouse: warehouseFilter, product: productFilter }}
        showClearFilters={Boolean(warehouseFilter || productFilter || searchTerm)}
        clearFiltersLabel={t('common.clearFilters', 'Clear filters')}
        onClearFilters={() => {
          setWarehouseFilter('');
          setProductFilter('');
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
        emptyIcon={<Package className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('stock.noStockFound', 'No stock balances found')}
        emptyDescription={t(
          'stock.purchaseToStock',
          'Receive a product purchase to create stock balances.',
        )}
        loadingText={t('common.loading', 'Loading…')}
        maxHeight="75vh"
        stickyHeader
      />
    </div>
  );
};

export default StockList;
