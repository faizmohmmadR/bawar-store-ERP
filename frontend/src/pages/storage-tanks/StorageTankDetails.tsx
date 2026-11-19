import { DualCurrencyCosts } from '@/components/display/DualCurrencyCosts';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Droplets, Edit, Pencil, Trash2, Warehouse } from 'lucide-react';
import { ReloadIcon } from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ListDate } from '@/components/display/ListDate';
import { CurrencyAmount } from '@/components/display/CurrencyAmount';
import { TankLeakDialog } from '@/components/storage-tanks/TankLeakDialog';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { useLanguage } from '@/contexts/LanguageContext';
import type { StorageTank } from '@/types/storage-tank';
import type { StorageTankLeak } from '@/types/storageTankLeak';

const StorageTankDetails = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const [leakOpen, setLeakOpen] = useState(false);
    const [editingLeak, setEditingLeak] = useState<StorageTankLeak | null>(null);

    const { data: tank, isLoading } = useFetchObjects<StorageTank>({
        queryKey: ['storage-tank', id],
        endpoint: `storage-tanks/${id}`,
        enabled: Boolean(id),
    });

    const leaksQuery = useFetchObjects<{ results: StorageTankLeak[]; count: number }>({
        queryKey: ['storage-tank-leaks', id],
        endpoint: 'storage-tank-leaks',
        params: { storage_tank: id, page_size: 100 },
        enabled: Boolean(id),
        options: { staleTime: 0 },
    });

    const { handleDelete, ConfirmDialog } = useDelete({
        queryKey: ['storage-tank-leaks'],
        endpoint: 'storage-tank-leaks',
        additionalQueryKeys: [
            ['storage-tanks'],
            ['storage-tank', id],
            ['damaged-materials'],
        ],
    });

    const amount = (value: string | number) =>
        Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 4 });

    const leaks = leaksQuery.data?.results || [];

    if (isLoading) {
        return <div className="flex justify-center py-8"><ReloadIcon className="h-8 w-8 animate-spin" /></div>;
    }

    if (!tank) {
        return (
            <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
                <p className="text-muted-foreground">{t('rawMaterialProcesses.storageTankNotFound')}</p>
                <Button variant="outline" onClick={() => navigate('/storage-tanks')}>
                    <ArrowLeft className="me-2 h-4 w-4" />{t('common.back')}
                </Button>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
            <header className="flex flex-wrap items-center gap-3 border-b pb-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/storage-tanks')}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-2xl font-semibold">{tank.name}</h1>
                    <p className="text-sm text-muted-foreground">{t('rawMaterialProcesses.storageTanksTitle')}</p>
                </div>
                <Button
                    variant="outline"
                    onClick={() => {
                        setEditingLeak(null);
                        setLeakOpen(true);
                    }}
                >
                    <Droplets className="me-2 h-4 w-4 text-destructive" />
                    {t('rawMaterialProcesses.recordTankLeak', 'Record leak')}
                </Button>
                <Button variant="outline" onClick={() => navigate(`/storage-tanks/${tank.id}/edit`)}>
                    <Edit className="me-2 h-4 w-4" />{t('rawMaterialProcesses.editStorageTank')}
                </Button>
            </header>
            <DualCurrencyCosts basis="current" rate={tank.usd_to_afn_rate ?? null} rows={[
              { label: t('rawMaterialProcesses.costPerKilogram'), afn: tank.liquid_cost_per_kg_afn },
            ]} />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Warehouse className="h-4 w-4" />
                        {t('rawMaterialProcesses.storageTanksTitle')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                        <p className="text-sm text-muted-foreground">{t('rawMaterialProcesses.storageTankName')}</p>
                        <p className="font-semibold">{tank.name}</p>
                    </div>

                    <div>
                        <p className="text-sm text-muted-foreground">{t('rawMaterialProcesses.capacityKg', 'Capacity (kg)')}</p>
                        <p className="font-semibold tabular-nums">{amount(tank.capacity_kg)} kg</p>
                    </div>

                    <div>
                        <p className="text-sm text-muted-foreground">{t('rawMaterialProcesses.currentKg', 'Stored (kg)')}</p>
                        <p className="font-semibold tabular-nums">{amount(tank.current_kg)} kg</p>
                    </div>

                    <div>
                        <p className="text-sm text-muted-foreground">{t('rawMaterialProcesses.availableKg', 'Available (kg)')}</p>
                        <p className="font-semibold tabular-nums">{amount(tank.available_kg)} kg</p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle>{t('rawMaterialProcesses.tankLeaks', 'Leaked liquid')}</CardTitle>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                            setEditingLeak(null);
                            setLeakOpen(true);
                        }}
                    >
                        <Droplets className="me-2 h-4 w-4" />
                        {t('rawMaterialProcesses.recordTankLeak', 'Record leak')}
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('common.date', 'Date')}</TableHead>
                                    <TableHead className="text-right">{t('rawMaterialProcesses.leakedKg', 'Leaked (kg)')}</TableHead>
                                    <TableHead className="text-right">{t('common.cost', 'Cost')}</TableHead>
                                    <TableHead>{t('rawMaterialProcesses.damagedNumber', 'Damaged #')}</TableHead>
                                    <TableHead>{t('common.notes')}</TableHead>
                                    <TableHead className="w-24">{t('common.actions')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {leaks.length ? leaks.map((leak) => (
                                    <TableRow key={leak.id}>
                                        <TableCell><ListDate value={leak.recorded_at} /></TableCell>
                                        <TableCell className="text-right tabular-nums font-medium text-destructive">
                                            {amount(leak.quantity_kg)} kg
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <CurrencyAmount amount={leak.total_cost_afn} showCode className="tabular-nums" />
                                        </TableCell>
                                        <TableCell className="font-mono text-sm">{leak.damaged_number || '—'}</TableCell>
                                        <TableCell className="max-w-[14rem] truncate text-muted-foreground" title={leak.notes || undefined}>
                                            {leak.notes || '—'}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-0.5">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    title={t('common.edit')}
                                                    onClick={() => {
                                                        setEditingLeak(leak);
                                                        setLeakOpen(true);
                                                    }}
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive"
                                                    title={t('common.delete')}
                                                    onClick={() => handleDelete(leak.id, `${amount(leak.quantity_kg)} kg`)}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-muted-foreground">
                                            {t('rawMaterialProcesses.noTankLeaks', 'No leaked liquid recorded for this tank.')}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>{t('rawMaterialProcesses.storageTankTransfers')}</CardTitle></CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader><TableRow>
                                <TableHead>{t('rawMaterialProcesses.processNumber')}</TableHead>
                                <TableHead>{t('rawMaterialProcesses.productionName')}</TableHead>
                                <TableHead>{t('rawMaterialProcesses.processDate')}</TableHead>
                                <TableHead className="text-right">{t('rawMaterialProcesses.transferQuantity')}</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                                {tank.production_transfers?.length ? tank.production_transfers.map((transfer) => (
                                    <TableRow key={transfer.id}>
                                        <TableCell className="font-mono">{transfer.process_number}</TableCell>
                                        <TableCell className="font-medium">{transfer.production_name}</TableCell>
                                        <TableCell><ListDate value={transfer.process_date} /></TableCell>
                                        <TableCell className="text-right tabular-nums">{amount(transfer.quantity_kg)} kg</TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-muted-foreground">{t('rawMaterialProcesses.noStorageTransfers')}</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <TankLeakDialog
                tankId={tank.id}
                tankName={tank.name}
                availableKg={tank.current_kg}
                open={leakOpen}
                onOpenChange={(next) => {
                    setLeakOpen(next);
                    if (!next) setEditingLeak(null);
                }}
                editing={editingLeak}
            />
            <ConfirmDialog />
        </div>
    );
};

export default StorageTankDetails;
