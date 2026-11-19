import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertOctagon, Edit, Eye, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import DataTable, { TableAction, TableColumn } from '@/components/ui/data-table';
import { CurrencyAmount } from '@/components/display/CurrencyAmount';
import { ListDate } from '@/components/display/ListDate';
import { TankLeakDialog } from '@/components/storage-tanks/TankLeakDialog';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { useLanguage } from '@/contexts/LanguageContext';
import { listBadgeClass } from '@/lib/listTableFormat';
import type { DamagedMaterialItem, DamagedMaterialRecord } from '@/types/damaged';
import type { StorageTankLeak } from '@/types/storageTankLeak';

function ItemStack({
  items,
  render,
  align = 'start',
}: {
  items: DamagedMaterialItem[];
  render: (item: DamagedMaterialItem) => ReactNode;
  align?: 'start' | 'end';
}) {
  if (!items.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className={`flex flex-col gap-1.5 ${align === 'end' ? 'items-end' : 'items-start'}`}>
      {items.map((item) => (
        <div
          key={`${item.component_type}-${item.raw_material || item.product || item.id}`}
          className="flex min-h-7 items-center text-sm"
        >
          {render(item)}
        </div>
      ))}
    </div>
  );
}

const DamagedMaterialList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [leakOpen, setLeakOpen] = useState(false);
  const [editingLeak, setEditingLeak] = useState<StorageTankLeak | null>(null);
  const [leakTankId, setLeakTankId] = useState<number | null>(null);
  const [leakTankName, setLeakTankName] = useState<string | undefined>();
  const [leakAvailableKg, setLeakAvailableKg] = useState<string | number | undefined>();

  const { data, isLoading } = useFetchObjects<{
    results: DamagedMaterialRecord[];
    count: number;
  }>({
    queryKey: ['damaged-materials', currentPage.toString(), pageSize.toString(), searchTerm],
    endpoint: 'damaged-materials/',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
    },
  });

  const { handleDelete: deleteManual, ConfirmDialog: ManualConfirm } = useDelete({
    queryKey: ['damaged-materials'],
    endpoint: 'damaged-materials',
  });
  const { handleDelete: deleteLeak, ConfirmDialog: LeakConfirm } = useDelete({
    queryKey: ['damaged-materials'],
    endpoint: 'storage-tank-leaks',
    additionalQueryKeys: [['storage-tanks'], ['storage-tank-leaks']],
  });

  const rows = data?.results || [];
  const totalItems = data?.count || 0;

  const openLeakEdit = (record: DamagedMaterialRecord) => {
    if (!record.tank_leak_id || !record.storage_tank_id) return;
    setEditingLeak({
      id: record.tank_leak_id,
      storage_tank: record.storage_tank_id,
      storage_tank_name: record.storage_tank_name || undefined,
      damaged_record: Number(record.id),
      damaged_number: record.damaged_number,
      quantity_kg: record.tank_leak_quantity_kg ?? record.items?.[0]?.quantity_pieces ?? '',
      total_cost_afn: record.total_cost_afn,
      notes: record.notes || '',
      recorded_at: record.record_date,
    });
    setLeakTankId(record.storage_tank_id);
    setLeakTankName(record.storage_tank_name || undefined);
    setLeakAvailableKg(record.tank_available_kg ?? undefined);
    setLeakOpen(true);
  };

  const columns: TableColumn[] = [
    {
      key: 'damaged_number',
      title: t('damaged.number', 'Number'),
      className: 'whitespace-nowrap',
      render: (value) => <span className="font-mono font-semibold tabular-nums">{value}</span>,
    },
    {
      key: 'record_date',
      title: t('damaged.recordDate', 'Date'),
      className: 'whitespace-nowrap',
      render: (value) => <ListDate value={value} />,
    },
    {
      key: 'source',
      title: t('damaged.source', 'Source'),
      className: 'whitespace-nowrap',
      render: (value) => (
        <Badge variant="outline" className={listBadgeClass}>
          {value === 'tank_leak'
            ? t('damaged.sourceTankLeak', 'Tank leak')
            : value === 'stock_bottle'
              ? t('damaged.sourceStockBottle', 'Stock bottle')
              : t('damaged.sourceManual', 'Manual')}
        </Badge>
      ),
    },
    {
      key: 'type',
      title: t('damaged.type', 'Type'),
      render: (_value, record) => (
        <ItemStack
          items={record.items || []}
          render={(item) => (
            <Badge variant="outline" className={listBadgeClass}>
              {t(`damaged.${item.component_type}`, item.component_type)}
            </Badge>
          )}
        />
      ),
    },
    {
      key: 'material',
      title: t('damaged.material', 'Material'),
      width: '11rem',
      className: 'max-w-[11rem]',
      render: (_value, record) => (
        <ItemStack
          items={record.items || []}
          render={(item) => {
            const name = item.raw_material_name
              || item.product_name
              || (record.source === 'tank_leak' ? record.storage_tank_name : null)
              || '—';
            return <span className="block truncate font-medium leading-tight" title={name}>{name}</span>;
          }}
        />
      ),
    },
    {
      key: 'quantity',
      title: t('damaged.quantity', 'Quantity'),
      width: '6rem',
      className: 'whitespace-nowrap',
      render: (_value, record) => (
        <ItemStack
          items={record.items || []}
          render={(item) => (
            <span className="tabular-nums">
              <span className="font-semibold">{Number(item.quantity_pieces || 0).toLocaleString()}</span>
              <span className="ms-1 text-xs text-muted-foreground">
                {item.unit === 'kg' || item.component_type === 'liquid'
                  ? t('damaged.kg', 'kg')
                  : t('damaged.piece', 'pcs')}
              </span>
            </span>
          )}
        />
      ),
    },
    {
      key: 'unit_price',
      title: t('damaged.unitPrice', 'Unit price'),
      width: '7rem',
      className: 'whitespace-nowrap',
      render: (_value, record) => (
        <ItemStack
          items={record.items || []}
          render={(item) => (
            <CurrencyAmount
              amount={item.unit_price_afn}
              showCode
              className="tabular-nums text-sm"
            />
          )}
        />
      ),
    },
    {
      key: 'line_total',
      title: t('damaged.lineTotal', 'Line total'),
      width: '7rem',
      className: 'whitespace-nowrap',
      render: (_value, record) => (
        <ItemStack
          items={record.items || []}
          render={(item) => (
            <CurrencyAmount
              amount={item.total_cost_afn}
              showCode
              className="font-medium tabular-nums text-sm"
            />
          )}
        />
      ),
    },
    {
      key: 'total_cost_afn',
      title: t('damaged.totalCost', 'Total cost'),
      className: 'whitespace-nowrap',
      render: (value) => (
        <CurrencyAmount amount={value} showCode className="font-semibold text-primary tabular-nums" />
      ),
    },
  ];

  const rowActions: TableAction[] = [
    {
      key: 'view',
      label: t('common.view'),
      icon: <Eye className="h-4 w-4" />,
      onClick: (record) => navigate(`/damaged/${record.id}`),
      tooltip: t('common.view'),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: (record) => {
        if (record.source === 'tank_leak') {
          openLeakEdit(record as DamagedMaterialRecord);
          return;
        }
        navigate(`/damaged/${record.id}/edit`);
      },
      tooltip: t('common.edit'),
      show: (record) => record.source !== 'stock_bottle',
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => {
        if (record.source === 'tank_leak' && record.tank_leak_id) {
          deleteLeak(record.tank_leak_id, record.damaged_number);
          return;
        }
        deleteManual(record.id, record.damaged_number);
      },
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('common.delete'),
      show: (record) => record.source !== 'stock_bottle',
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        tableClassName="min-w-0 [&_td]:whitespace-normal [&_th]:whitespace-nowrap"
        data={rows}
        columns={columns}
        loading={isLoading}
        title={t('damaged.title', 'Damaged')}
        subtitle={t(
          'damaged.subtitle',
          'Record damaged labels, plastics, and cartons without changing stock.',
        )}
        icon={<AlertOctagon className="h-5 w-5" />}
        headerActions={
          <Button size="sm" onClick={() => navigate('/damaged/add')}>
            <Plus className="h-4 w-4" />
            {t('damaged.add', 'Add damaged')}
          </Button>
        }
        searchable
        searchPlaceholder={t('damaged.search', 'Search by number or material...')}
        searchValue={searchTerm}
        onSearch={(value) => {
          setSearchTerm(value);
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
        emptyIcon={<AlertOctagon className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('damaged.empty', 'No damaged records')}
        emptyDescription={t('damaged.emptyHint', 'Add damaged packaging materials here.')}
        loadingText={t('common.loading')}
        stickyHeader
        maxHeight="75vh"
      />
      {leakTankId != null && (
        <TankLeakDialog
          tankId={leakTankId}
          tankName={leakTankName}
          availableKg={leakAvailableKg}
          open={leakOpen}
          onOpenChange={(next) => {
            setLeakOpen(next);
            if (!next) {
              setEditingLeak(null);
              setLeakTankId(null);
            }
          }}
          editing={editingLeak}
        />
      )}
      <ManualConfirm />
      <LeakConfirm />
    </div>
  );
};

export default DamagedMaterialList;
