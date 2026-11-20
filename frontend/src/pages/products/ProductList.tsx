import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Eye, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DataTable, { TableColumn, TableAction, FilterOption } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { formatOrderNumeric } from '@/lib/orderNumeric';

const ProductList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: productsData, isLoading } = useFetchObjects<{
    results: any[];
    count: number;
    next: string | null;
    previous: string | null;
  }>({
    queryKey: ['products', currentPage.toString(), pageSize.toString(), searchTerm, statusFilter],
    endpoint: 'products',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      ...(statusFilter !== 'all' && { status: statusFilter })
    }
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['products'],
    endpoint: 'products'
  });

  const products = productsData?.results || [];
  const totalItems = productsData?.count || 0;

  const handleEdit = (product: any) => {
    // Products have actual edit pages, so navigate
    navigate(`/products/${product.id}/edit`);
  };

  const handleDetails = (product: any) => {
    // Products have actual detail pages, so navigate
    navigate(`/products/${product.id}`);
  };

  const columns: TableColumn[] = [
    {
      key: 'image',
      title: t('products.image'),
      width: '3.5rem',
      className: 'w-[3.5rem]',
      render: (value, row) => (
        value ? (
          <img src={value} alt={row.name} className="h-10 w-10 rounded-md object-cover border" />
        ) : (
          <div className="h-10 w-10 rounded-md border bg-muted" />
        )
      ),
    },
    {
      key: 'name',
      title: t('products.name'),
      width: '11rem',
      className: 'max-w-[11rem]',
      render: (value) => <span className="block truncate font-medium" title={value || '—'}>{value || '—'}</span>
    },
    {
      key: 'base_uom_details',
      title: t('products.baseUom', 'Base UOM'),
      width: '7rem',
      className: 'max-w-[7rem] whitespace-nowrap',
      render: (value, row) => (
        <span className="block truncate" title={value?.name || value?.symbol || row.base_uom || '—'}>
          {value?.symbol || value?.name || '—'}
        </span>
      ),
    },
    {
      key: 'packagings',
      title: t('products.packagingUnits', 'Units'),
      width: '14rem',
      className: 'max-w-[14rem]',
      render: (value) => {
        const packs = Array.isArray(value) ? value : [];
        if (!packs.length) return '—';
        return (
          <div className="flex flex-wrap gap-1">
            {packs.slice(0, 4).map((p: any) => {
              const qty = Number(p.qty_in_base) || 0;
              return (
                <Badge key={p.id || p.name} variant="outline" className="max-w-full truncate font-normal">
                  {p.name}
                  {qty > 1 ? ` ×${formatOrderNumeric(qty)}` : ''}
                </Badge>
              );
            })}
            {packs.length > 4 ? (
              <Badge variant="secondary">+{packs.length - 4}</Badge>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'barcode',
      title: t('products.barcode'),
      width: '8rem',
      className: 'max-w-[8rem] whitespace-nowrap',
      render: (value) => (
        <Badge variant="outline" className="max-w-full truncate font-mono" title={value || '-'}>
          {value || '-'}
        </Badge>
      )
    }
  ];

  const rowActions: TableAction[] = [
    {
      key: 'view',
      label: t('products.viewDetails'),
      icon: <Eye className="h-4 w-4" />,
      onClick: handleDetails,
      tooltip: t('products.viewDetails')
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: handleEdit,
      tooltip: t('products.editProductAction')
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => handleDelete(record.id, record.name),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('products.deleteProduct')
    }
  ];

  const filters: FilterOption[] = [
    {
      key: 'status',
      label: t('common.status'),
      placeholder: t('products.filterByStatus'),
      width: 'sm:w-40',
      options: [
        { value: 'active', label: t('common.active') },
        { value: 'inactive', label: t('common.inactive') },
        { value: 'discontinued', label: t('products.discontinued') }
      ]
    }
  ];

  const filterValues = {
    status: statusFilter
  };

  const handleFilterChange = (key: string, value: string) => {
    if (key === 'status') {
      setStatusFilter(value);
      setCurrentPage(1);
    }
  };

  const handleClearFilters = () => {
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
        data={products}
        columns={columns}
        loading={isLoading}
        title={t('products.title')}
        subtitle={t('products.manageInventory')}
        icon={<Package className="h-5 w-5" />}
        headerActions={
          <Button onClick={() => navigate('/products/add')}>
            <Plus className="h-4 w-4" />
            {t('products.addProductButton')}
          </Button>
        }
        searchable
        searchPlaceholder={t('products.searchProducts')}
        searchValue={searchTerm}
        onSearch={handleSearch}
        filters={filters}
        filterValues={filterValues}
        onFilterChange={handleFilterChange}
        showClearFilters={true}
        clearFiltersLabel={t('products.clearFilters')}
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
        emptyTitle={t('products.noProductsFound')}
        emptyDescription={searchTerm ? t('products.tryAdjustingSearch') : t('products.addFirstProduct')}
        loadingText={t('products.loadingProducts')}
        maxHeight="75vh"
        stickyHeader={true}
      />

      <ConfirmDialog />
    </div>
  );
};

export { ProductList };
export default ProductList;
