import { formatPrice } from '@/lib/formatNumber';
import { DualCurrencyCosts } from '@/components/display/DualCurrencyCosts';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit, Eye, Plus, PackageCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Autocomplete } from '@/components/ui/autocomplete';
import DataTable, { TableAction, TableColumn } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';
import { ListDate } from '@/components/display/ListDate';
import type { PackingRun } from '@/types/packing';

const PackingRunList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [tankFilter, setTankFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data, isLoading } = useFetchObjects<{
    results: PackingRun[];
    count: number;
  }>({
    queryKey: [
      'packing-runs',
      String(page),
      String(pageSize),
      search,
      tankFilter,
      productFilter,
    ],
    endpoint: 'packing-runs',
    params: {
      page,
      page_size: pageSize,
      search,
      ...(tankFilter && { storage_tank: tankFilter }),
      ...(productFilter && { product: productFilter }),
    },
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['packing-runs'],
    endpoint: 'packing-runs',
    additionalQueryKeys: [
      ['packing-run'],
      ['stocks'],
      ['storage-tanks'],
      ['raw-material-stocks'],
      ['packing-available-returns'],
      ['returned-for-packing'],
      ['packing-returns'],
      ['stock'],
    ],
  });

  const amount = (value: string | number, digits = 4) =>
    Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits });
  const currency = resolveCurrencySymbol(1);

  const rowActions: TableAction<PackingRun>[] = [
    {
      key: 'view',
      label: t('common.view'),
      icon: <Eye className="h-4 w-4" />,
      onClick: (run) => navigate(`/packing/${run.id}`),
      tooltip: t('packing.viewPacking', 'View packing'),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: (run) => navigate(`/packing/${run.id}/edit`),
      tooltip: t('packing.editPacking'),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (run) => handleDelete(run.id, run.packing_number),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('packing.deletePacking', 'Delete packing'),
    },
  ];

  const columns: TableColumn<PackingRun>[] = [
    {
      key: 'packing_number',
      title: t('packing.packingNumber'),
      width: '7.5rem',
      className: 'whitespace-nowrap',
      render: (value) => <span className="font-mono font-medium">{value}</span>,
    },
    {
      key: 'created_at',
      title: t('packing.packingDate'),
      width: '7rem',
      className: 'whitespace-nowrap',
      render: (value) => <ListDate value={value} />,
    },
    {
      key: 'storage_tank_name',
      title: t('packing.sourceType', 'Packing source'),
      width: '11rem',
      className: 'max-w-[11rem]',
      render: (value, run) => {
        const label = [value, run.packing_return ? `${t('stock.returnedForPacking', 'Returned for Packing')} · ${run.returned_bottle_count}` : null].filter(Boolean).join(' + ');
        return <span className="block truncate font-medium" title={label}>{label || '—'}</span>;
      },
    },
    {
      key: 'product_name',
      title: t('packing.finishedProduct'),
      width: '10rem',
      className: 'max-w-[10rem]',
      render: (value) => <span className="block truncate font-medium" title={value || '—'}>{value || '—'}</span>,
    },
    {
      key: 'quantity_kg',
      title: t('packing.kgPacked'),
      width: '6rem',
      className: 'whitespace-nowrap',
      render: (value) => <span className="tabular-nums">{amount(value)} kg</span>,
    },
    {
      key: 'bottle_count',
      title: t('packing.bottleCount'),
      width: '5rem',
      className: 'whitespace-nowrap',
      render: (value) => <span className="tabular-nums">{amount(value, 0)}</span>,
    },
    {
      key: 'total_cost_afn',
      title: t('packing.totalCost'),
      width: '7rem',
      className: 'whitespace-nowrap',
      render: (value) => (
        <span className="font-medium tabular-nums">
          {currency}
          {formatPrice(value)}
        </span>
      ),
    },
    {
      key: 'cost_per_bottle_afn',
      title: t('packing.costPerItem', 'Cost per item'),
      width: '10.5rem',
      className: 'max-w-[10.5rem] whitespace-nowrap',
      render: (_value, record) => (
        <DualCurrencyCosts compact rate={record.usd_to_afn_rate ?? null} rows={[{ label: '', afn: record.cost_per_bottle_afn }]} />
      ),
    },
  ];

  const customFilters = [
    {
      key: 'storage_tank',
      label: t('packing.sourceTank'),
      width: 'sm:w-56',
      component: (
        <Autocomplete
          variant="filter"
          endpoint="storage-tanks"
          value={tankFilter}
          onChange={(value) => {
            setTankFilter(value?.toString() || '');
            setPage(1);
          }}
          placeholder={t('packing.filterByTank', 'Filter by tank')}
          getOptionLabel={(tank) => tank.name}
          getOptionValue={(tank) => tank.id.toString()}
        />
      ),
    },
    {
      key: 'product',
      label: t('packing.finishedProduct'),
      width: 'sm:w-56',
      component: (
        <Autocomplete
          variant="filter"
          endpoint="products"
          value={productFilter}
          onChange={(value) => {
            setProductFilter(value?.toString() || '');
            setPage(1);
          }}
          placeholder={t('packing.filterByProduct', 'Filter by product')}
          getOptionLabel={(product) => product.name}
          getOptionValue={(product) => product.id.toString()}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={data?.results || []}
        columns={columns}
        rowActions={rowActions}
        rowActionsAsMenu
        loading={isLoading}
        title={t('packing.title')}
        subtitle={`${t('packing.subtitle')} ${t('stock.runCostHint')}`}
        icon={<PackageCheck className="h-5 w-5" />}
        headerActions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate('/packing/add')}>
              <Plus className="h-4 w-4" />
              {t('packing.newPacking')}
            </Button>
          </div>
        }
        searchable
        searchPlaceholder={t('packing.searchPacking', 'Search packing runs...')}
        searchValue={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        customFilters={customFilters}
        customFilterValues={{
          storage_tank: tankFilter,
          product: productFilter,
        }}
        showClearFilters
        clearFiltersLabel={t('common.clearFilters')}
        onClearFilters={() => {
          setTankFilter('');
          setProductFilter('');
          setSearch('');
          setPage(1);
        }}
        pagination={{
          current: page,
          pageSize,
          total: data?.count || 0,
          onPageChange: setPage,
          showSizeChanger: true,
          pageSizeOptions: [10, 25, 50, 100],
          onPageSizeChange: (size) => {
            setPageSize(size);
            setPage(1);
          },
        }}
        emptyIcon={<PackageCheck className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('packing.noPackingRuns')}
        emptyDescription={
          search || tankFilter || productFilter
            ? t('common.noSearchResults')
            : t('packing.subtitle')
        }
        loadingText={t('common.loading')}
        maxHeight="75vh"
        stickyHeader
      />
      <ConfirmDialog />
    </div>
  );
};

export default PackingRunList;
