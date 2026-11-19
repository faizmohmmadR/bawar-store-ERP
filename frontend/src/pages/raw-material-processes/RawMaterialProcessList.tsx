import { DualCurrencyCosts } from '@/components/display/DualCurrencyCosts';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightLeft, Edit, Eye, Factory, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DataTable, { FilterOption, TableAction, TableColumn } from '@/components/ui/data-table';
import { ListDate } from '@/components/display/ListDate';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import type { RawMaterialProcess } from '@/types/raw-material-process';
import ChangeProductionStatusDialog from '@/components/raw-material-processes/ChangeProductionStatusDialog';

const STATUS_OPTIONS = [
  { value: 'in_process', labelKey: 'statusInProcess' },
  { value: 'completed', labelKey: 'statusCompleted' },
  { value: 'moved_to_storage', labelKey: 'statusMovedToStorage' },
] as const;

const RawMaterialProcessList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [statusProcess, setStatusProcess] = useState<RawMaterialProcess | null>(null);

  const { data, isLoading } = useFetchObjects<{
    results: RawMaterialProcess[];
    count: number;
  }>({
    queryKey: [
      'raw-material-processes',
      String(page),
      String(pageSize),
      search,
      statusFilter,
    ],
    endpoint: 'raw-material-processes',
    params: {
      page,
      page_size: pageSize,
      search,
      ...(statusFilter !== 'all' && { status: statusFilter }),
    },
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['raw-material-processes'],
    endpoint: 'raw-material-processes',
    additionalQueryKeys: [
      ['raw-material-process'],
      ['raw-material-stocks'],
      ['raw-material-process-available-stock'],
      ['storage-tanks'],
    ],
  });


  const statusLabel = (value: string) => {
    if (value === 'in_process') return t('rawMaterialProcesses.statusInProcess');
    if (value === 'completed') return t('rawMaterialProcesses.statusCompleted');
    if (value === 'moved_to_storage') return t('rawMaterialProcesses.statusMovedToStorage');
    return value;
  };

  const columns: TableColumn<RawMaterialProcess>[] = [
    {
      key: 'process_number',
      title: t('rawMaterialProcesses.processNumber'),
      width: '7.5rem',
      className: 'whitespace-nowrap',
      render: (value) => <span className="font-mono font-medium">{value}</span>,
    },
    {
      key: 'product_name',
      title: t('rawMaterialProcesses.productionName'),
      width: '10rem',
      className: 'max-w-[10rem]',
      render: (value) => <span className="block truncate font-medium" title={value || '—'}>{value || '—'}</span>,
    },
    {
      key: 'status',
      title: t('rawMaterialProcesses.processStatus'),
      width: '6.5rem',
      className: 'max-w-[6.5rem]',
      render: (value) => {
        const label = statusLabel(String(value));
        return <Badge variant="outline" className="max-w-full truncate" title={label}>{label}</Badge>;
      },
    },
    {
      key: 'process_date',
      title: t('rawMaterialProcesses.processDate'),
      width: '7rem',
      className: 'whitespace-nowrap',
      render: (value) => <ListDate value={value} />,
    },
    {
      key: 'total_input_quantity_kg',
      title: t('rawMaterialProcesses.totalMixtureWeight'),
      width: '10rem',
      className: 'max-w-[10rem]',
      render: (value, row) => (
        <div className="space-y-1 text-sm">
          <bdi dir="ltr" className="font-medium">{Number(value || 0).toLocaleString()} kg</bdi>
          <p className="text-xs leading-snug text-muted-foreground">
            {t('rawMaterialProcesses.materialsWeight')}: <bdi dir="ltr">{Number(row.materials_quantity_kg || 0).toLocaleString()} kg</bdi>
            <br />
            {t('rawMaterialProcesses.water')}: <bdi dir="ltr">{Number(row.water_quantity_kg || 0).toLocaleString()} kg</bdi>
          </p>
        </div>
      ),
    },
    {
      key: 'total_cost_afn',
      title: t('rawMaterialProcesses.totalCost'),
      width: '10.5rem',
      className: 'max-w-[10.5rem] whitespace-nowrap',
      render: (_value, record) => (
        <DualCurrencyCosts compact rate={record.usd_to_afn_rate ?? null} rows={[{ label: '', afn: record.total_cost_afn }]} />
      ),
    },
    {
      key: 'cost_per_kg_afn',
      title: t('rawMaterialProcesses.costPerKilogram'),
      width: '10.5rem',
      className: 'max-w-[10.5rem] whitespace-nowrap',
      render: (_value, record) => (
        <DualCurrencyCosts compact rate={record.usd_to_afn_rate ?? null} rows={[{ label: '', afn: record.cost_per_kg_afn }]} />
      ),
    },
  ];

  const rowActions: TableAction<RawMaterialProcess>[] = [
    {
      key: 'view',
      label: t('common.view'),
      icon: <Eye className="h-4 w-4" />,
      onClick: (process) => navigate(`/raw-material-processes/${process.id}`),
      tooltip: t('common.view'),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: (process) => navigate(`/raw-material-processes/${process.id}/edit`),
      tooltip: t('common.edit'),
    },
    {
      key: 'change-status',
      label: t('rawMaterialProcesses.changeProcessStatus'),
      icon: <ArrowRightLeft className="h-4 w-4" />,
      onClick: (process) => setStatusProcess(process),
      tooltip: t('rawMaterialProcesses.changeProcessStatus'),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (process) =>
        handleDelete(process.id, `${process.process_number} - ${process.product_name}`),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('common.delete'),
    },
  ];

  const filters: FilterOption[] = [
    {
      key: 'status',
      label: t('rawMaterialProcesses.processStatus'),
      placeholder: t('rawMaterialProcesses.filterByStatus', 'Filter by status'),
      width: 'sm:w-48',
      options: STATUS_OPTIONS.map((option) => ({
        value: option.value,
        label: t(`rawMaterialProcesses.${option.labelKey}`),
      })),
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={data?.results || []}
        columns={columns}
        loading={isLoading}
        title={t('rawMaterialProcesses.title')}
        subtitle={`${t('rawMaterialProcesses.subtitle')} ${t('stock.runCostHint')}`}
        icon={<Factory className="h-5 w-5" />}
        headerActions={
          <Button onClick={() => navigate('/raw-material-processes/add')}>
            <Plus className="h-4 w-4" />
            {t('rawMaterialProcesses.addProcess')}
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
        filterValues={{ status: statusFilter }}
        onFilterChange={(key, value) => {
          if (key === 'status') setStatusFilter(value);
          setPage(1);
        }}
        showClearFilters
        clearFiltersLabel={t('common.clearFilters')}
        onClearFilters={() => {
          setStatusFilter('all');
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
        emptyIcon={<Factory className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('rawMaterialProcesses.noProcesses')}
        emptyDescription={
          search || statusFilter !== 'all'
            ? t('common.noSearchResults')
            : t('rawMaterialProcesses.subtitle')
        }
        loadingText={t('rawMaterialProcesses.loading')}
        maxHeight="75vh"
        stickyHeader
      />
      <ConfirmDialog />
      <ChangeProductionStatusDialog
        open={Boolean(statusProcess)}
        process={statusProcess}
        onOpenChange={(open) => {
          if (!open) setStatusProcess(null);
        }}
      />
    </div>
  );
};

export default RawMaterialProcessList;
