import { DualCurrencyAmount } from '@/components/display/DualCurrencyCosts';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Droplets, Edit, Eye, Plus, Trash2, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DataTable, { FilterOption, TableAction, TableColumn } from '@/components/ui/data-table';
import { TankLeakDialog } from '@/components/storage-tanks/TankLeakDialog';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import type { StorageTank } from '@/types/storage-tank';

const StorageTankList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [fillStatus, setFillStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [leakTank, setLeakTank] = useState<StorageTank | null>(null);

  const { data, isLoading } = useFetchObjects<{
    results: StorageTank[];
    count: number;
  }>({
    queryKey: ['storage-tanks', String(page), String(pageSize), search, fillStatus],
    endpoint: 'storage-tanks',
    params: {
      page,
      page_size: pageSize,
      search,
      ...(fillStatus !== 'all' && { fill_status: fillStatus }),
    },
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['storage-tanks'],
    endpoint: 'storage-tanks',
    additionalQueryKeys: [['storage-tank']],
  });

  const amount = (value: string | number) =>
    Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 4 });

  const columns: TableColumn<StorageTank>[] = [
    {
      key: 'name',
      title: t('rawMaterialProcesses.storageTankName'),
      width: '11rem',
      className: 'max-w-[11rem]',
      render: (value) => <span className="block truncate font-medium" title={value || '—'}>{value || '—'}</span>,
    },
    {
      key: 'capacity_kg',
      title: t('rawMaterialProcesses.capacityKg'),
      width: '6.5rem',
      className: 'whitespace-nowrap',
      render: (value) => <span className="tabular-nums">{amount(value)} kg</span>,
    },
    {
      key: 'current_kg',
      title: t('rawMaterialProcesses.currentKg'),
      width: '6.5rem',
      className: 'whitespace-nowrap',
      render: (value) => <span className="tabular-nums">{amount(value)} kg</span>,
    },
    {
      key: 'liquid_cost_per_kg_afn',
      title: t('rawMaterialProcesses.costPerKilogram'),
      width: '10.5rem',
      className: 'max-w-[10.5rem] whitespace-nowrap',
      render: (_value, tank) => (
        Number(tank.current_kg) > 0
          ? <DualCurrencyAmount afn={tank.liquid_cost_per_kg_afn} rate={tank.usd_to_afn_rate} />
          : <span className="text-muted-foreground">—</span>
      ),
    },
    {
      key: 'available_kg',
      title: t('rawMaterialProcesses.availableKg'),
      width: '6.5rem',
      className: 'whitespace-nowrap',
      render: (value) => (
        <span className="font-semibold tabular-nums">{amount(value)} kg</span>
      ),
    },
  ];

  const rowActions: TableAction<StorageTank>[] = [
    {
      key: 'view',
      label: t('common.view'),
      icon: <Eye className="h-4 w-4" />,
      onClick: (tank) => navigate(`/storage-tanks/${tank.id}`),
      tooltip: t('common.view'),
    },
    {
      key: 'leak',
      label: t('rawMaterialProcesses.recordTankLeak', 'Record leak'),
      icon: <Droplets className="h-4 w-4" />,
      onClick: (tank) => setLeakTank(tank),
      show: (tank) => Number(tank.current_kg) > 0,
      tooltip: t('rawMaterialProcesses.recordTankLeak', 'Record leak'),
    },
    {
      key: 'edit',
      label: t('rawMaterialProcesses.editStorageTank'),
      icon: <Edit className="h-4 w-4" />,
      onClick: (tank) => navigate(`/storage-tanks/${tank.id}/edit`),
      tooltip: t('rawMaterialProcesses.editStorageTank'),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (tank) => handleDelete(tank.id, tank.name),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('common.delete'),
    },
  ];

  const filters: FilterOption[] = [
    {
      key: 'fill_status',
      label: t('rawMaterialProcesses.fillStatus', 'Fill status'),
      placeholder: t('rawMaterialProcesses.filterByFillStatus', 'Filter by fill status'),
      width: 'sm:w-44',
      options: [
        {
          value: 'empty',
          label: t('rawMaterialProcesses.fillEmpty', 'Empty'),
        },
        {
          value: 'has_liquid',
          label: t('rawMaterialProcesses.fillHasLiquid', 'Has liquid'),
        },
        {
          value: 'full',
          label: t('rawMaterialProcesses.fillFull', 'Full'),
        },
      ],
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={data?.results || []}
        columns={columns}
        loading={isLoading}
        title={t('rawMaterialProcesses.storageTanksTitle')}
        subtitle={t('rawMaterialProcesses.storageTanksSubtitle')}
        icon={<Warehouse className="h-5 w-5" />}
        headerActions={
          <Button onClick={() => navigate('/storage-tanks/add')}>
            <Plus className="h-4 w-4" />
            {t('rawMaterialProcesses.addStorageTank')}
          </Button>
        }
        searchable
        searchPlaceholder={t('common.search')}
        searchValue={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        filters={filters}
        filterValues={{ fill_status: fillStatus }}
        onFilterChange={(key, value) => {
          if (key === 'fill_status') setFillStatus(value);
          setPage(1);
        }}
        showClearFilters
        clearFiltersLabel={t('common.clearFilters')}
        onClearFilters={() => {
          setFillStatus('all');
          setSearch('');
          setPage(1);
        }}
        rowActions={rowActions}
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
        emptyIcon={<Warehouse className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('rawMaterialProcesses.noStorageTanks')}
        emptyDescription={
          search || fillStatus !== 'all'
            ? t('common.noSearchResults')
            : t('rawMaterialProcesses.storageTanksSubtitle')
        }
        loadingText={t('common.loading')}
        maxHeight="75vh"
        stickyHeader
      />
      <ConfirmDialog />
      {leakTank && (
        <TankLeakDialog
          tankId={leakTank.id}
          tankName={leakTank.name}
          availableKg={leakTank.current_kg}
          open={Boolean(leakTank)}
          onOpenChange={(open) => {
            if (!open) setLeakTank(null);
          }}
        />
      )}
    </div>
  );
};

export default StorageTankList;
