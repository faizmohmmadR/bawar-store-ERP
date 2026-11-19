import { ReturnToPack } from '@/components/stock/ReturnToPack';
import { DamageBottlesDialog } from '@/components/stock/DamageBottlesDialog';
import { DualCurrencyAmount } from '@/components/display/DualCurrencyCosts';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Eye, Package, RotateCcw, AlertOctagon, FileBarChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Autocomplete } from '@/components/ui/autocomplete';
import DataTable, { TableColumn, TableAction } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { ListDate } from '@/components/display/ListDate';
import { stockPieces } from '@/lib/stockApi';
import type { Stock } from '@/types/stock';

type StockMaterialDetails = NonNullable<
  NonNullable<Stock['product_details']>['raw_material_details']
>;

const StockList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [repackingStock, setRepackingStock] = useState<Stock | null>(null);
  const [damageStock, setDamageStock] = useState<Stock | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [filterLabels, setFilterLabels] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: stocksData, isLoading } = useFetchObjects<{
    results: Stock[];
    count: number;
  }>({
    queryKey: ['stocks', currentPage.toString(), pageSize.toString(), searchTerm, productFilter, categoryFilter, typeFilter],
    endpoint: 'stocks/',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      condition: 'good',
      ...(productFilter && { product: productFilter }),
      ...(categoryFilter && { category: categoryFilter }),
      ...(typeFilter && { material_type: typeFilter }),
    }
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['stocks'],
    endpoint: 'stocks'
  });

  const stocks = stocksData?.results || [];
  const totalItems = stocksData?.count || 0;

  const handleDetails = (stock: Stock) => {
    navigate(`/stock/${stock.id}`);
  };

  const handleEdit = (stock: Stock) => {
    navigate(`/stock/${stock.id}/edit`);
  };

  const getStockStatus = (pieces: number) => {
    if (pieces === 0) return { label: t('stock.outOfStock'), variant: 'destructive' as const };
    if (pieces <= 100) return { label: t('stock.lowStock'), variant: 'secondary' as const };
    return { label: t('stock.inStock'), variant: 'default' as const };
  };

  const formatMaterialCapacity = (material: StockMaterialDetails) => {
    const multiplier = material.material_type === 'carton' ? Number(material.bottles_per_carton || 0)
      : material.material_type === 'plastic' ? Number(material.bottles_per_plastic || 0) : 1;
    if (!(multiplier > 0)) return '—';
    if (material?.capacity_liters != null) {
      const liters = Number(material.capacity_liters) * multiplier;
      const value = material.capacity_display_unit === 'ml' ? liters * 1000 : liters;
      const unit = material.capacity_display_unit || 'L';
      return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
    }
    if (material?.capacity_kg != null) {
      return `${(Number(material.capacity_kg) * multiplier).toLocaleString(undefined, { maximumFractionDigits: 4 })} kg`;
    }
    return '—';
  };

  const unitLabel = (record: Stock, plural = false) => {
    const type = record.product_details?.material_type;
    return type === 'carton' ? (plural ? t('stock.cartonUnits', 'cartons') : t('stock.cartonUnit', 'carton'))
      : type === 'plastic' ? (plural ? t('stock.plasticPackUnits', 'plastic packs') : t('stock.plasticPackUnit', 'plastic pack'))
      : type === 'bottle' || type === 'bottle_with_cap' ? (plural ? t('stock.bottleUnits', 'bottles') : t('stock.bottleUnit', 'bottle'))
      : t('stock.piece', 'piece');
  };
  const quantity = (value: string | number | undefined) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
  const onHand = (record: Stock) => Number(record.on_hand_quantity ?? stockPieces(record));

  const columns: TableColumn<Stock>[] = [
    {
      key: 'product_details',
      title: t('stock.product'),
      width: '11rem',
      className: 'max-w-[11rem]',
      render: (value) => {
        const type = value?.material_type || value?.raw_material_details?.material_type;
        const typeLabel = type ? t(`rawMaterials.type${type.split('_').map((part: string) => part[0].toUpperCase() + part.slice(1)).join('')}`) : null;
        const name = value?.name || value?.raw_material_details?.name || t('stock.notAvailable');
        return (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <span className="block max-w-full truncate font-medium" title={name}>{name}</span>
            {typeLabel && (
              <Badge variant="outline" className="max-w-full truncate border-blue-200 bg-blue-50 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300" title={typeLabel}>
                {typeLabel}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'material_capacity',
      title: t('stock.itemCapacity', 'Item capacity'),
      width: '7rem',
      className: 'whitespace-nowrap',
      render: (_value, record) => {
        const material = record.product_details?.raw_material_details;
        return <bdi dir="ltr">{material ? formatMaterialCapacity(material)
          : record.product_details?.bottle_capacity_kg ? `${quantity(Number(record.product_details.bottle_capacity_kg))} kg`
          : record.product_details?.bottle_capacity_liters ? `${quantity(Number(record.product_details.bottle_capacity_liters))} L` : '—'}</bdi>;
      },
    },
    {
      key: 'package_size',
      title: t('stock.packageSize', 'Pack size'),
      width: '8rem',
      className: 'max-w-[8rem] whitespace-nowrap',
      render: (_value, record) => {
        const material = record.product_details?.raw_material_details;
        const count = material?.material_type === 'carton' ? material.bottles_per_carton
          : material?.material_type === 'plastic' ? material.bottles_per_plastic
          : !record.product_details?.raw_material && !record.product_details?.material_type ? record.product_details?.bottles_per_carton : null;
        return count ? <span>{quantity(count)} {t('stock.bottleUnits', 'bottles')} / {material ? unitLabel(record) : t('stock.cartonUnit', 'carton')}</span> : '—';
      },
    },
    {
      key: 'on_hand_quantity',
      title: t('stock.onHandQuantity'),
      width: '7.5rem',
      className: 'whitespace-nowrap',
      render: (_value, record) => <span className="tabular-nums"><bdi dir="ltr">{quantity(onHand(record))}</bdi> {unitLabel(record, true)}</span>,
    },
    {
      key: 'average_unit_cost_afn',
      title: t('stock.weightedAverageUnitCost'),
      width: '10.5rem',
      className: 'max-w-[10.5rem] whitespace-nowrap',
      render: (_value, record) => {
        const averageCost = record.average_unit_cost_afn ?? record.buy_price;
        return (
          <div className="space-y-0.5 whitespace-nowrap">
            <DualCurrencyAmount afn={averageCost} rate={record.usd_to_afn_rate} />
            <p className="text-xs text-muted-foreground">{t('stock.perStockUnit', { unit: unitLabel(record) })}</p>
          </div>
        );
      },
    },
    {
      key: 'expire_date',
      title: t('stock.earliestExpiry'),
      width: '7rem',
      className: 'whitespace-nowrap',
      render: value => value ? <ListDate value={value} /> : '—',
    },
    {
      key: 'status',
      title: t('stock.availabilityStatus'),
      width: '7.5rem',
      className: 'max-w-[7.5rem]',
      render: (_value, record) => {
        const available = Number(record.available_quantity ?? stockPieces(record));
        const status = available <= 0 && onHand(record) > 0
          ? { label: t('stock.noSellableStock'), variant: 'destructive' as const }
          : getStockStatus(available);
        return (
          <div className="space-y-1">
            <Badge variant={status.variant} className="max-w-full truncate text-xs" title={status.label}>{status.label}</Badge>
            {available < onHand(record) && (
              <p className="truncate text-xs text-muted-foreground">
                {t('stock.availableCount', { count: quantity(available) })}
              </p>
            )}
          </div>
        );
      },
    },
  ];

  const isBottleStock = (record: Stock) =>
    record.condition === 'good'
    && ['bottle', 'bottle_with_cap'].includes(
      record.product_details?.material_type
      || record.product_details?.raw_material_details?.material_type
      || '',
    );

  const rowActions: TableAction<Stock>[] = [
    {
      key: 'view',
      label: t('common.view'),
      icon: <Eye className="h-4 w-4" />,
      onClick: handleDetails,
      tooltip: t('common.view'),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: handleEdit,
      tooltip: t('common.edit'),
    },
    {
      key: 'return_to_pack',
      label: t('stock.returnToPack', 'Return to Pack'),
      icon: <RotateCcw className="h-4 w-4" />,
      onClick: (record) => setRepackingStock(record),
      show: (record) => isBottleStock(record) && Number(record.available_quantity ?? stockPieces(record)) >= 1,
    },
    {
      key: 'damage_bottles',
      label: t('stock.damageBottles', 'Damage bottles'),
      icon: <AlertOctagon className="h-4 w-4" />,
      onClick: (record) => setDamageStock(record),
      show: (record) => isBottleStock(record) && Number(record.available_quantity ?? stockPieces(record)) >= 1,
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => handleDelete(record.id, record.product_details?.name || t('stock.stockItem')),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('common.delete'),
    },
  ];

  const customFilters = [
    {
      key: 'material_type',
      label: t('rawMaterials.materialType'),
      component: <Autocomplete variant="filter" value={typeFilter}
        options={['bottle', 'carton', 'plastic'].map(type => ({ id: type, name: t(`packing.component_${type}`) }))}
        getOptionLabel={option => option.name} getOptionValue={option => option.id}
        placeholder={`${t('common.all')} ${t('rawMaterials.materialType')}`}
        onChange={(value, option) => {
          setTypeFilter(value ? String(value) : '');
          setFilterLabels(previous => ({ ...previous, material_type: option?.name || '' }));
          setCurrentPage(1);
        }} />,
    },
    {
      key: 'category',
      label: t('rawMaterials.category', 'Category'),
      component: <Autocomplete variant="filter" endpoint="raw-material-categories" value={categoryFilter}
        getOptionLabel={option => option.name} getOptionValue={option => String(option.id)}
        placeholder={`${t('common.all')} ${t('rawMaterials.category', 'Category')}`}
        onChange={(value, option) => {
          setCategoryFilter(value ? String(value) : '');
          setFilterLabels(previous => ({ ...previous, category: option?.name || '' }));
          setCurrentPage(1);
        }} />,
    },
    {
      key: 'product',
      label: t('stock.product'),
      component: (
        <Autocomplete
          variant="filter"
          endpoint="products"
          getOptionLabel={(p) => p.name}
          getOptionValue={(p) => p.id.toString()}
          value={productFilter}
          onChange={(value, option) => {
            setProductFilter(value?.toString() || '');
            setFilterLabels((prev) => ({
              ...prev,
              product: option?.name || '',
            }));
            setCurrentPage(1);
          }}
          placeholder={`${t('common.all')} ${t('stock.product')}`}
        />
      ),
    },
  ];

  const customFilterValues = {
    ...(productFilter && filterLabels.product ? { product: filterLabels.product } : {}),
    ...(categoryFilter && filterLabels.category ? { category: filterLabels.category } : {}),
    ...(typeFilter && filterLabels.material_type ? { material_type: filterLabels.material_type } : {}),
  };

  const handleCustomFilterChange = (key: string) => {
    if (key === 'product') setProductFilter('');
    if (key === 'category') setCategoryFilter('');
    if (key === 'material_type') setTypeFilter('');
    setFilterLabels((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setProductFilter('');
    setCategoryFilter('');
    setTypeFilter('');
    setFilterLabels({});
    setSearchTerm('');
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(productFilter || categoryFilter || typeFilter || searchTerm);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={stocks}
        columns={columns}
        loading={isLoading}
        title={t('stock.allStockItems')}
        subtitle={t('stock.latestCostHint')}
        icon={<Package className="h-5 w-5" />}
        headerActions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate('/stock/report')}>
              <FileBarChart className="h-4 w-4" />{t('stock.reportTitle', 'Report')}
            </Button>
            <Button variant="outline" onClick={() => navigate('/stock/returned-for-packing')}>
              <RotateCcw className="h-4 w-4" />{t('stock.returnedForPacking', 'Returned for Packing')}
            </Button>
            <Button variant="outline" onClick={() => navigate('/stock/bottle-damages')}>
              <AlertOctagon className="h-4 w-4" />{t('stock.bottleDamageHistory', 'Bottle damages')}
            </Button>
            <Button variant="outline" onClick={() => navigate('/stock/add-material')}><Plus className="h-4 w-4" />{t('stock.addMaterialStock')}</Button>
          </div>
        }
        searchable
        searchPlaceholder={t('common.search')}
        searchValue={searchTerm}
        onSearch={(value) => {
          setSearchTerm(value);
          setCurrentPage(1);
        }}
        customFilters={customFilters}
        customFilterValues={customFilterValues}
        onCustomFilterChange={handleCustomFilterChange}
        showClearFilters={hasActiveFilters}
        clearFiltersLabel={t('common.clearFilters')}
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
        emptyIcon={<Package className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('stock.noStockItems')}
        emptyDescription={searchTerm ? t('common.noSearchResults') : t('stock.stockItemsDesc')}
        loadingText={t('common.loading')}
        maxHeight="75vh"
        stickyHeader={true}
      />


      {repackingStock && <ReturnToPack
        key={repackingStock.id}
        stockId={repackingStock.id}
        open
        onOpenChange={open => { if (!open) setRepackingStock(null); }}
        showTrigger={false}
        showHistory={false}
      />}
      {damageStock && (
        <DamageBottlesDialog
          key={`damage-${damageStock.id}`}
          stockId={damageStock.id}
          open
          onOpenChange={(open) => { if (!open) setDamageStock(null); }}
          showTrigger={false}
        />
      )}
      <ConfirmDialog />
    </div>
  );
};

export default StockList;
