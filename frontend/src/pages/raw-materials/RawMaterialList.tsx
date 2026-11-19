import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Eye, Package, FileBarChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DataTable, { TableColumn, TableAction, FilterOption } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import type { RawMaterial } from '@/types/raw-material';

const MATERIAL_TYPES = [
  'bottle',
  'bottle_with_cap',
  'cap',
  'cap_label',
  'label',
  'label_double',
  'plastic',
  'carton',
  'carton_plastic',
  'chemistry',
  'boiler',
  'other',
] as const;

const materialTypeLabelKey = (type: string) => (
  `rawMaterials.type${type.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`
);

const RawMaterialList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: categoriesData } = useFetchObjects<{ results: { id: number; name: string }[] }>({
    queryKey: ['raw-material-categories'], endpoint: 'raw-material-categories', params: { page_size: 1000 },
  });
  const categoryApplies = typeFilter === 'all' || ['bottle', 'bottle_with_cap', 'plastic'].includes(typeFilter);

  const { data: materialsData, isLoading } = useFetchObjects<{
    results: RawMaterial[];
    count: number;
  }>({
    queryKey: [
      'raw-materials',
      currentPage.toString(),
      pageSize.toString(),
      searchTerm,
      typeFilter,
      categoryFilter,
      unitFilter,
    ],
    endpoint: 'raw-materials',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      ...(categoryFilter && { category: categoryFilter }),
      ...(typeFilter !== 'all' && { material_type: typeFilter }),
      ...(unitFilter !== 'all' && { unit: unitFilter }),
    },
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['raw-materials'],
    endpoint: 'raw-materials',
  });

  const materials = materialsData?.results || [];
  const totalItems = materialsData?.count || 0;

  const typeLabel = (value: string) =>
    t(materialTypeLabelKey(value || 'chemistry'), value);

  const columns: TableColumn[] = [
    {
      key: 'category_name',
      title: t('rawMaterials.category', 'Category'),
      width: '8rem',
      className: 'max-w-[8rem]',
      render: (_value, record) => {
        const name = record.category_name || '—';
        return <span className="block truncate" title={name}>{name}</span>;
      },
    },
    {
      key: 'name',
      title: t('rawMaterials.name'),
      width: '11rem',
      className: 'max-w-[11rem]',
      render: (value) => <span className="block truncate font-medium" title={value || '—'}>{value || '—'}</span>,
    },
    {
      key: 'description',
      title: t('rawMaterials.description'),
      width: '12rem',
      className: 'max-w-[12rem]',
      render: (value) => (
        <div className="truncate" title={value || ''}>
          {value || '-'}
        </div>
      ),
    },
    {
      key: 'unit',
      title: t('rawMaterials.unit'),
      width: '3.5rem',
      className: 'w-[3.5rem] whitespace-nowrap text-center',
      align: 'center',
      render: (value) => <Badge variant="outline">{value || 'kg'}</Badge>,
    },
    {
      key: 'capacity_kg',
      title: t('rawMaterials.capacityKg', 'Capacity (kg)'),
      width: '8rem',
      className: 'max-w-[8rem] whitespace-nowrap',
      render: (value, record) => {
        if (record.material_type === 'plastic') return record.bottles_per_plastic ? `${record.bottles_per_plastic} ${t('rawMaterials.bottlesPerPlastic')}` : null;
        if (!['bottle', 'bottle_with_cap', 'carton'].includes(record.material_type)) return null;
        const label = record.capacity_kg ? `${Number(record.capacity_kg).toLocaleString(undefined, { maximumFractionDigits: 4 })} kg` : '';
        if (!label) return null;
        const cartonExtra =
          record.material_type === 'carton' && record.bottles_per_carton
            ? ` · ${record.bottles_per_carton}/ctn`
            : '';
        return (
          <span className="tabular-nums">
            {label}
            {cartonExtra}
          </span>
        );
      },
    },
    {
      key: 'material_type',
      title: t('rawMaterials.materialType'),
      width: '8rem',
      className: 'max-w-[8rem]',
      render: (value) => {
        const label = typeLabel(value);
        return <Badge variant="secondary" className="max-w-full truncate" title={label}>{label}</Badge>;
      },
    },
  ];

  const rowActions: TableAction[] = [
    {
      key: 'view',
      label: t('rawMaterials.viewRawMaterial'),
      icon: <Eye className="h-4 w-4" />,
      onClick: (material) => navigate(`/raw-materials/${material.id}`),
      tooltip: t('rawMaterials.viewRawMaterial'),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: (material) => navigate(`/raw-materials/${material.id}/edit`),
      tooltip: t('common.edit'),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => handleDelete(record.id, record.name),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('common.delete'),
    },
  ];

  const filters: FilterOption[] = [
    {
      key: 'material_type',
      label: t('rawMaterials.materialType'),
      placeholder: t('rawMaterials.filterByType', 'Filter by type'),
      width: 'sm:w-44',
      options: MATERIAL_TYPES.map((value) => ({
        value,
        label: typeLabel(value),
      })),
    },
    ...(categoryApplies ? [{
      key: 'category',
      label: t('rawMaterials.category'),
      placeholder: t('rawMaterials.selectCategory'),
      width: 'sm:w-44',
      options: [...(categoriesData?.results || [])].sort((a, b) => a.name.localeCompare(b.name)).map((category) => ({ value: String(category.id), label: category.name })),
    }] : []),
    {
      key: 'unit',
      label: t('rawMaterials.unit'),
      placeholder: t('rawMaterials.filterByUnit', 'Filter by unit'),
      width: 'sm:w-36',
      options: [
        { value: 'kg', label: t('rawMaterials.kilogram', 'Kilogram (kg)') },
        { value: 'g', label: t('rawMaterials.gram', 'Gram (gr)') },
        { value: 'piece', label: t('rawMaterials.piece', 'Piece') },
      ],
    },
  ];

  const handleFilterChange = (key: string, value: string) => {
    if (key === 'material_type') {
      setTypeFilter(value);
      if (value !== 'all' && !['bottle', 'bottle_with_cap', 'plastic'].includes(value)) setCategoryFilter('');
    }
    if (key === 'category') setCategoryFilter(value === 'all' ? '' : value);
    if (key === 'unit') setUnitFilter(value);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setTypeFilter('all');
    setCategoryFilter('');
    setUnitFilter('all');
    setSearchTerm('');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={materials}
        columns={columns}
        loading={isLoading}
        title={t('rawMaterials.title')}
        subtitle={t('rawMaterials.manageRawMaterials')}
        icon={<Package className="h-5 w-5" />}
        headerActions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate('/raw-materials/report')}>
              <FileBarChart className="h-4 w-4" />
              {t('rawMaterials.reportTitle', 'Report')}
            </Button>
            <Button onClick={() => navigate('/raw-materials/add')}>
              <Plus className="h-4 w-4" />
              {t('rawMaterials.addRawMaterial')}
            </Button>
          </div>
        }
        searchable
        searchPlaceholder={t('rawMaterials.searchRawMaterials')}
        searchValue={searchTerm}
        onSearch={(value) => {
          setSearchTerm(value);
          setCurrentPage(1);
        }}
        filters={filters}
        filterValues={{ material_type: typeFilter, category: categoryFilter || 'all', unit: unitFilter }}
        onFilterChange={handleFilterChange}
        showClearFilters
        clearFiltersLabel={t('rawMaterials.clearFilters')}
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
          },
        }}
        emptyIcon={<Package className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('rawMaterials.noRawMaterialsFound')}
        emptyDescription={
          searchTerm || categoryFilter || typeFilter !== 'all' || unitFilter !== 'all'
            ? t('rawMaterials.tryAdjustingSearch')
            : t('rawMaterials.addFirstRawMaterial')
        }
        loadingText={t('rawMaterials.loadingRawMaterials')}
        maxHeight="75vh"
        stickyHeader
      />

      <ConfirmDialog />
    </div>
  );
};

export default RawMaterialList;
