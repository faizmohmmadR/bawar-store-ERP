import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, Eye, Pencil, Trash2 } from 'lucide-react';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { DamageBottlesDialog } from '@/components/stock/DamageBottlesDialog';
import { CurrencyAmount } from '@/components/display/CurrencyAmount';
import { ListDate } from '@/components/display/ListDate';
import { Button } from '@/components/ui/button';
import DataTable, { type TableAction, type TableColumn } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import type { StockBottleDamage } from '@/types/stockBottleDamage';

export default function BottleDamageHistory() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<StockBottleDamage | null>(null);

  const { data, isLoading } = useFetchObjects<{ results: StockBottleDamage[]; count: number }>({
    queryKey: ['stock-bottle-damages', String(page), String(pageSize), search],
    endpoint: 'stock-bottle-damages/',
    params: { page, page_size: pageSize, search },
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['stock-bottle-damages'],
    endpoint: 'stock-bottle-damages',
    additionalQueryKeys: [['stocks'], ['stock'], ['storage-tanks'], ['damaged-materials']],
  });

  const rows = data?.results || [];

  const columns: TableColumn<StockBottleDamage>[] = [
    {
      key: 'recorded_at',
      title: t('stock.date', 'Date'),
      render: (value) => <ListDate value={value} />,
    },
    {
      key: 'product_name',
      title: t('stock.product'),
      render: (value) => <span className="font-medium">{value}</span>,
    },
    {
      key: 'bottle_count',
      title: t('stock.damagedBottleCount', 'Damaged bottles'),
      render: (value) => (
        <span className="tabular-nums">
          {Number(value).toLocaleString()} {t('stock.bottleUnits', 'bottles')}
        </span>
      ),
    },
    {
      key: 'total_liquid_kg',
      title: t('stock.totalLiquid', 'Total liquid'),
      render: (value) => <span className="tabular-nums">{Number(value).toLocaleString()} kg</span>,
    },
    {
      key: 'remaining_liquid_kg',
      title: t('stock.remainingLiquidShort', 'Remaining'),
      render: (value, row) => (
        <div className="space-y-0.5 text-sm">
          <p className="tabular-nums">{Number(value).toLocaleString()} kg</p>
          <p className="text-xs text-muted-foreground">{row.storage_tank_name || '—'}</p>
        </div>
      ),
    },
    {
      key: 'damaged_liquid_kg',
      title: t('stock.damagedLiquid', 'Damaged liquid'),
      render: (value, row) => (
        <div className="space-y-0.5 text-sm">
          <p className="tabular-nums font-medium text-destructive">
            {Number(value).toLocaleString()} kg
          </p>
          {row.damaged_number && (
            <p className="font-mono text-xs text-muted-foreground">{row.damaged_number}</p>
          )}
        </div>
      ),
    },
    {
      key: 'damaged_liquid_cost_afn',
      title: t('stock.damagedCost', 'Damaged cost'),
      render: (value) => <CurrencyAmount amount={value} showCode className="tabular-nums" />,
    },
    {
      key: 'notes',
      title: t('stock.notes', 'Notes'),
      render: (value) => (
        <span className="line-clamp-2 max-w-[12rem] text-sm text-muted-foreground">
          {value || '—'}
        </span>
      ),
    },
  ];

  const actions: TableAction<StockBottleDamage>[] = [
    {
      key: 'view_stock',
      label: t('stock.viewStock', 'View stock'),
      icon: <Eye className="h-4 w-4" />,
      onClick: (row) => navigate(`/stock/${row.stock}`),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Pencil className="h-4 w-4" />,
      onClick: setEditing,
    },
    {
      key: 'delete',
      label: t('stock.reverseDamage', 'Reverse'),
      icon: <Trash2 className="h-4 w-4" />,
      className: 'text-red-600 hover:text-red-700',
      onClick: (row) => handleDelete(row.id, `${row.product_name} · ${row.bottle_count}`),
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={rows}
        columns={columns}
        loading={isLoading}
        title={t('stock.bottleDamageHistory', 'Bottle damages')}
        subtitle={t(
          'stock.bottleDamageHistoryHint',
          'History of damaged bottles: remaining liquid returned to storage, spilled liquid recorded in Damaged.',
        )}
        icon={<AlertOctagon className="h-5 w-5" />}
        headerActions={
          <Button variant="outline" onClick={() => navigate('/stock')}>
            {t('stock.allStockItems')}
          </Button>
        }
        searchable
        searchValue={search}
        searchPlaceholder={t('common.search')}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        rowActions={actions}
        rowActionsAsMenu
        pagination={{
          current: page,
          pageSize,
          total: data?.count || 0,
          onPageChange: setPage,
          showSizeChanger: true,
          pageSizeOptions: [10, 25, 50],
          onPageSizeChange: (size) => {
            setPageSize(size);
            setPage(1);
          },
        }}
        emptyIcon={<AlertOctagon className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('stock.noBottleDamages', 'No bottle damages yet')}
        emptyDescription={t(
          'stock.noBottleDamagesHint',
          'Use Damage bottles from the stock actions menu to record broken bottles.',
        )}
        stickyHeader
        maxHeight="75vh"
      />

      {editing && (
        <DamageBottlesDialog
          key={`edit-damage-${editing.id}`}
          stockId={editing.stock}
          editing={editing}
          open
          onOpenChange={(open) => {
            if (!open) {
              setEditing(null);
              queryClient.invalidateQueries({ queryKey: ['stock-bottle-damages'] });
            }
          }}
          showTrigger={false}
        />
      )}
      <ConfirmDialog />
    </div>
  );
}
