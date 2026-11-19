import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertOctagon, ArrowLeft, Edit } from 'lucide-react';
import useFetchObjects from '@/api/useFetchObjects';
import { CurrencyAmount } from '@/components/display/CurrencyAmount';
import { ListDate } from '@/components/display/ListDate';
import { TankLeakDialog } from '@/components/storage-tanks/TankLeakDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermissions } from '@/contexts/PermissionContext';
import type { DamagedMaterialRecord } from '@/types/damaged';
import type { StorageTankLeak } from '@/types/storageTankLeak';

export default function DamagedMaterialDetails() {
  const { t } = useLanguage();
  const { canEdit } = usePermissions();
  const { id } = useParams<{ id: string }>();
  const [leakOpen, setLeakOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useFetchObjects<DamagedMaterialRecord>({
    queryKey: ['damaged-material', id],
    endpoint: `damaged-materials/${id}`,
    enabled: !!id,
    options: { staleTime: 0 },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Button variant="ghost" asChild>
          <Link to="/damaged"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t('damaged.title', 'Damaged')}</Link>
        </Button>
        <Card>
          <CardContent className="space-y-3 p-6">
            <p>{t('damaged.notFound', 'Damaged record not found')}</p>
            <Button variant="outline" onClick={() => refetch()}>{t('common.retry', 'Retry')}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isTankLeak = data.source === 'tank_leak';
  const canEditRecord = canEdit('damaged') && data.source !== 'stock_bottle';
  const editingLeak: StorageTankLeak | null =
    isTankLeak && data.tank_leak_id && data.storage_tank_id
      ? {
          id: data.tank_leak_id,
          storage_tank: data.storage_tank_id,
          storage_tank_name: data.storage_tank_name || undefined,
          damaged_record: Number(data.id),
          damaged_number: data.damaged_number,
          quantity_kg: data.tank_leak_quantity_kg ?? data.items?.[0]?.quantity_pieces ?? '',
          total_cost_afn: data.total_cost_afn,
          notes: data.notes || '',
          recorded_at: data.record_date,
        }
      : null;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/damaged" className="inline-flex items-center gap-2 hover:text-foreground">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {t('damaged.title', 'Damaged')}
        </Link>
        <span>/</span>
        <span>{data.damaged_number}</span>
      </nav>

      <div className="flex flex-col justify-between gap-4 border-b pb-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <AlertOctagon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{data.damaged_number}</h1>
            <p className="text-sm text-muted-foreground">
              <ListDate value={data.record_date} />
              {isTankLeak && data.storage_tank_name ? (
                <span className="ms-2">· {data.storage_tank_name}</span>
              ) : null}
            </p>
          </div>
        </div>
        {canEditRecord && (
          isTankLeak && editingLeak ? (
            <Button variant="outline" type="button" onClick={() => setLeakOpen(true)}>
              <Edit className="h-4 w-4" />
              {t('rawMaterialProcesses.editTankLeak', 'Edit leaked amount')}
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link to={`/damaged/${id}/edit`}>
                <Edit className="h-4 w-4" />
                {t('common.edit')}
              </Link>
            </Button>
          )
        )}
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">{t('damaged.items', 'Items')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b text-start">
                <th className="px-2 py-2 font-medium">{t('damaged.type', 'Type')}</th>
                <th className="px-2 py-2 font-medium">{t('damaged.material', 'Material')}</th>
                <th className="px-2 py-2 font-medium text-end">{t('damaged.quantity', 'Quantity')}</th>
                <th className="px-2 py-2 font-medium text-end">{t('damaged.unitPrice', 'Unit price')}</th>
                <th className="px-2 py-2 font-medium text-end">{t('damaged.lineTotal', 'Total')}</th>
              </tr>
            </thead>
            <tbody>
              {(data.items || []).map((item) => (
                <tr key={`${item.component_type}-${item.raw_material || item.product || item.id}`} className="border-b last:border-0">
                  <td className="px-2 py-2.5 capitalize">{t(`damaged.${item.component_type}`, item.component_type)}</td>
                  <td className="px-2 py-2.5">
                    {item.raw_material_name || item.product_name || data.storage_tank_name || '—'}
                  </td>
                  <td className="px-2 py-2.5 text-end tabular-nums">
                    {item.quantity_pieces}{' '}
                    {item.unit === 'kg' || item.component_type === 'liquid'
                      ? t('damaged.kg', 'kg')
                      : t('damaged.piece', 'pcs')}
                  </td>
                  <td className="px-2 py-2.5 text-end">
                    <CurrencyAmount amount={item.unit_price_afn} showCode />
                  </td>
                  <td className="px-2 py-2.5 text-end">
                    <CurrencyAmount amount={item.total_cost_afn} showCode className="font-semibold" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="px-2 py-3 text-end font-medium">
                  {t('damaged.totalCost', 'Total cost')}
                </td>
                <td className="px-2 py-3 text-end">
                  <CurrencyAmount amount={data.total_cost_afn} showCode className="font-semibold text-primary" />
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {data.notes && (
        <Card className="shadow-none">
          <CardHeader><CardTitle className="text-base">{t('damaged.notes', 'Notes')}</CardTitle></CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{data.notes}</p>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        {isTankLeak
          ? t(
            'damaged.tankLeakEditHint',
            'Editing this leaked amount updates Damaged materials and restores or reduces the storage tank stock.',
          )
          : t(
            'damaged.noStockImpactHint',
            'Saving here only records damaged packaging. It does not change raw-material or finished stock quantities.',
          )}
      </p>

      {editingLeak && data.storage_tank_id != null && (
        <TankLeakDialog
          tankId={data.storage_tank_id}
          tankName={data.storage_tank_name || undefined}
          availableKg={data.tank_available_kg ?? undefined}
          open={leakOpen}
          onOpenChange={(next) => {
            setLeakOpen(next);
            if (!next) refetch();
          }}
          editing={editingLeak}
        />
      )}
    </div>
  );
}
