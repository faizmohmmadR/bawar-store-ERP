import { DualCurrencyAmount } from '@/components/display/DualCurrencyCosts';
import { MaterialCategorySelect } from '@/components/raw-materials/MaterialCategorySelect';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Package, Layers, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DataTable, { TableColumn, TableAction } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { ListDate } from '@/components/display/ListDate';
import type { RawMaterialStock } from '@/types/raw-material';

const RawMaterialStockList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: stocksData, isLoading } = useFetchObjects<{
    results: RawMaterialStock[];
    count: number;
  }>({
    queryKey: ['raw-material-stocks', currentPage.toString(), pageSize.toString(), searchTerm, categoryFilter, typeFilter],
    endpoint: 'raw-material-stocks',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      ...(categoryFilter && { raw_material__category: categoryFilter }),
      ...(typeFilter !== 'all' && { raw_material__material_type: typeFilter }),
    }
  });

  const stocks = stocksData?.results || [];
  const totalItems = stocksData?.count || 0;

  const getStockStatus = (quantity: number) => {
    if (quantity === 0) return { label: t('rawMaterialStock.outOfStock'), variant: 'destructive' as const };
    if (quantity <= 10) return { label: t('rawMaterialStock.lowStock'), variant: 'secondary' as const };
    return { label: t('rawMaterialStock.inStock'), variant: 'default' as const };
  };

  const columns: TableColumn<RawMaterialStock>[] = [
    {
      key: 'material_type',
      title: t('rawMaterials.materialType'),
      width: '7.5rem',
      className: 'max-w-[7.5rem]',
      render: (_value, record) => {
        const type = record.raw_material_details?.material_type || '';
        const label = t(
          `rawMaterials.type${type.split('_').map((part: string) => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`,
          type,
        );
        return (
          <Badge variant="outline" className="max-w-full truncate text-xs font-normal" title={label}>
            {label}
          </Badge>
        );
      },
    },
    {
      key: 'category_name',
      title: t('rawMaterials.category', 'Category'),
      width: '8rem',
      className: 'max-w-[8rem]',
      render: (_value, record) => {
        const name = record.raw_material_details?.category_name || '—';
        return <span className="block truncate text-sm" title={name}>{name}</span>;
      },
    },
    {
      key: 'raw_material_details',
      title: t('rawMaterialStock.rawMaterial'),
      width: '11rem',
      className: 'max-w-[11rem]',
      render: (value) => {
        const name = value?.name || t('common.notAvailable');
        return <span className="block truncate font-medium" title={name}>{name}</span>;
      },
    },
    {
      key: 'raw_material_unit',
      title: t('rawMaterials.unit'),
      width: '3.5rem',
      className: 'w-[3.5rem] whitespace-nowrap text-center',
      align: 'center',
      render: (_value, record) => (
        <span className="inline-flex justify-center rounded border border-border bg-muted/40 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          {record.raw_material_details?.unit || 'kg'}
        </span>
      ),
    },
    {
      key: 'quantity',
      title: t('rawMaterialStock.quantity'),
      width: '7rem',
      className: 'whitespace-nowrap',
      render: (value) => {
        const quantity = parseFloat(value?.toString() || '0');
        const status = getStockStatus(quantity);
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span className="font-semibold tabular-nums text-primary">
              {quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}
            </span>
            <Badge variant={status.variant} className="px-1.5 py-0 text-[10px] leading-4">
              {status.label}
            </Badge>
          </div>
        );
      },
    },
    {
      key: 'piece_count',
      title: t('rawMaterialPurchases.pieceCount'),
      width: '4.5rem',
      className: 'whitespace-nowrap tabular-nums',
      render: (_value, record) => (
        <span className="font-medium tabular-nums">
          {record.raw_material_details?.unit === 'kg'
            ? Number(record.piece_count || 0).toLocaleString()
            : '—'}
        </span>
      ),
    },
    {
      key: 'average_unit_cost_afn',
      title: t('stock.weightedAverageUnitCost'),
      width: '10.5rem',
      className: 'max-w-[10.5rem] whitespace-nowrap',
      render: (_value, record) => (
        <div className="space-y-0.5">
          <DualCurrencyAmount
            afn={record.average_unit_cost_afn ?? record.last_purchase_price}
            rate={record.usd_to_afn_rate}
          />
          {record.price_is_sample && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] leading-4">
              {t('rawMaterialStock.samplePrice', 'Sample price')}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'last_purchase_date',
      title: t('rawMaterialStock.lastPurchaseDate'),
      width: '7rem',
      className: 'whitespace-nowrap',
      render: (value) => (value ? <ListDate value={value} /> : '—'),
    },
  ];

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['raw-material-stocks'],
    endpoint: 'raw-material-stocks',
  });

  const rowActions: TableAction<RawMaterialStock>[] = [
    {
      key: 'details',
      label: t('common.view'),
      icon: <Eye className="h-4 w-4" />,
      onClick: (stock) => {
        const materialId = stock.raw_material_details?.id ?? stock.raw_material;
        navigate(`/raw-materials/${materialId}`);
      },
      tooltip: t('common.view'),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Pencil className="h-4 w-4" />,
      onClick: (stock) => navigate(`/raw-material-stocks/${stock.id}/edit`),
      tooltip: t('common.edit'),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (stock) => handleDelete(stock.id, stock.raw_material_details?.name ?? String(stock.id)),
      tooltip: t('common.delete'),
      variant: 'destructive',
    },
  ];

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setCategoryFilter('');
    setTypeFilter('all');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={stocks}
        columns={columns}
        loading={isLoading}
        title={t('rawMaterialStock.title')}
        subtitle={t('rawMaterialStock.stockItemsDesc')}
        icon={<Package className="h-5 w-5" />}
        headerActions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate('/raw-material-stocks/add')}><Plus className="h-4 w-4" />{t('rawMaterialStock.addStock', 'Add Stock')}</Button>
            <Button variant="outline" onClick={() => navigate('/raw-materials')}>
              <Layers className="h-4 w-4" />
              {t('rawMaterials.title')}
            </Button>
          </div>
        }
        filters={[{ key: 'material_type', label: t('rawMaterials.materialType'), placeholder: t('rawMaterials.materialType'), options:
          ['bottle', 'bottle_with_cap', 'cap', 'cap_label', 'label', 'label_double', 'plastic', 'carton', 'carton_plastic', 'chemistry', 'boiler', 'other'].map((value) => ({
            value, label: t(`rawMaterials.type${value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`, value),
          })),
        }]}
        filterValues={{ material_type: typeFilter }}
        onFilterChange={(_key, value) => { setTypeFilter(value); setCurrentPage(1); }}
        customFilters={[{ key: 'category', label: t('rawMaterials.category'), component: <MaterialCategorySelect variant="filter" value={categoryFilter} onChange={(value) => { setCategoryFilter(value); setCurrentPage(1); }} /> }]}
        singleRowFilters
        searchable
        searchPlaceholder={t('common.search')}
        searchValue={searchTerm}
        onSearch={handleSearch}
        showClearFilters={true}
        clearFiltersLabel={t('rawMaterialStock.clearFilters')}
        onClearFilters={handleClearFilters}
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
          }
        }}
        emptyIcon={<Package className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('rawMaterialStock.noStockItems')}
        emptyDescription={searchTerm ? t('common.noSearchResults') : t('rawMaterialStock.stockItemsDesc')}
        loadingText={t('common.loading')}
        maxHeight="75vh"
        stickyHeader={true}
      />

      <ConfirmDialog />


    </div>
  );
};

export default RawMaterialStockList;
