import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/api/client';
import useFetchObjects from '@/api/useFetchObjects';
import { formatApiError, notifyError, notifySuccess } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import type { RawMaterialProcess, RawMaterialProcessStatus } from '@/types/raw-material-process';
import type { StorageTank } from '@/types/storage-tank';

type Props = { open: boolean; process: RawMaterialProcess | null; onOpenChange: (open: boolean) => void };
const statusKey = (status: RawMaterialProcessStatus) => ({ in_process: 'statusInProcess', completed: 'statusCompleted', moved_to_storage: 'statusMovedToStorage' })[status];

export default function ChangeProductionStatusDialog({ open, process, onOpenChange }: Props) {
    const { t } = useLanguage();
    const queryClient = useQueryClient();
    const dialogRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<RawMaterialProcessStatus>('in_process');
    const [tankId, setTankId] = useState('');
    const [tankPickerOpen, setTankPickerOpen] = useState(false);
    const [quantity, setQuantity] = useState('');
    const [saving, setSaving] = useState(false);
    const { data: details, isLoading } = useFetchObjects<RawMaterialProcess>({
        queryKey: ['raw-material-process-status-dialog', String(process?.id || '')],
        endpoint: `raw-material-processes/${process?.id}`, enabled: open && Boolean(process),
    });
    const { data: tankData, isLoading: tanksLoading } = useFetchObjects<StorageTank[]>({
        queryKey: ['storage-tanks', 'status-dialog', 'all'], endpoint: 'storage-tanks', enabled: open,
    });
    useEffect(() => {
        if (!open || !process) return;
        setStatus(process.status); setTankId(''); setQuantity(''); setTankPickerOpen(false);
    }, [open, process]);
    useEffect(() => {
        if (!open || details?.id !== process?.id || !details) return;
        setStatus(details.status);
        const transfer = details.storage_transfers[0];
        setTankId(transfer ? String(transfer.storage_tank) : '');
        setQuantity(transfer?.quantity_kg || '');
    }, [details, open, process?.id]);
    const available = (tank: StorageTank) => Number(tank.available_kg) + (details?.storage_transfers
        .filter((row) => row.storage_tank === tank.id).reduce((total, row) => total + Number(row.quantity_kg), 0) || 0);
    const tankOptions = (tankData || []).filter((tank) => available(tank) > 0 || String(tank.id) === tankId);
    const selectedTank = tankOptions.find(tank => String(tank.id) === tankId);
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!process) return;
        if (status === 'moved_to_storage' && (!tankId || !(Number(quantity) > 0) || Number(quantity) > Number(process.output_quantity_kg))) {
            notifyError(t('rawMaterialProcesses.storageTransferExceedsOutput')); return;
        }
        setSaving(true);
        try {
            await api.patch(`/raw-material-processes/${process.id}/status/`, {
                status, storage_transfers: status === 'moved_to_storage' ? [{ storage_tank: Number(tankId), quantity_kg: quantity }] : [],
            });
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['raw-material-processes'] }),
                queryClient.invalidateQueries({ queryKey: ['raw-material-process'] }),
                queryClient.invalidateQueries({ queryKey: ['raw-material-process-status-dialog'] }),
                queryClient.invalidateQueries({ queryKey: ['storage-tanks'] }),
            ]);
            notifySuccess(t('rawMaterialProcesses.statusUpdated')); onOpenChange(false);
        } catch (error) { notifyError(formatApiError(error)); }
        finally { setSaving(false); }
    };
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent ref={dialogRef}>
        <DialogHeader><DialogTitle>{t('rawMaterialProcesses.processStatus')}</DialogTitle>
            <DialogDescription>{process?.product_name} · {process?.output_quantity_kg} kg</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2"><Label>{t('rawMaterialProcesses.processStatus')}</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as RawMaterialProcessStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                    {(['in_process', 'completed', 'moved_to_storage'] as const).map((value) => <SelectItem key={value} value={value}>{t(`rawMaterialProcesses.${statusKey(value)}`)}</SelectItem>)}
                </SelectContent></Select></div>
            {status === 'moved_to_storage' && <>
                <div className="space-y-2"><Label>{t('rawMaterialProcesses.selectStorageTank')}</Label>
                    <Popover open={tankPickerOpen} onOpenChange={setTankPickerOpen}>
                        <PopoverTrigger asChild>
                            <Button type="button" variant="outline" role="combobox" aria-expanded={tankPickerOpen} aria-label={t('rawMaterialProcesses.selectStorageTank')} disabled={tanksLoading} className="h-10 w-full justify-between gap-2 font-normal">
                                <span className="min-w-0 truncate">{selectedTank ? <>{selectedTank.name} · <bdi dir="ltr">{available(selectedTank).toLocaleString()} kg</bdi></> : t('rawMaterialProcesses.selectStorageTank')}</span>
                                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent container={dialogRef.current} align="start" side="bottom" sideOffset={4} collisionPadding={12} className="w-[var(--radix-popover-trigger-width)] max-h-[min(20rem,var(--radix-popover-content-available-height))] overflow-hidden p-0">
                            <Command className="h-auto min-h-0">
                                <CommandInput placeholder={t('common.search')} />
                                <CommandList className="max-h-[min(16rem,calc(var(--radix-popover-content-available-height)-3.25rem))] min-h-0 overflow-y-auto overscroll-contain touch-pan-y">
                                    <CommandEmpty>{t('common.noDataFound')}</CommandEmpty>
                                    <CommandGroup>
                                        {tankOptions.map(tank => <CommandItem key={tank.id} value={`${tank.id} ${tank.name}`} onSelect={() => {
                                            setTankId(String(tank.id));
                                            setQuantity(String(Math.max(0, Math.min(available(tank), Number(process?.output_quantity_kg) || 0))));
                                            setTankPickerOpen(false);
                                        }} className="items-start gap-2 py-2">
                                            <Check className={`mt-0.5 h-4 w-4 shrink-0 ${String(tank.id) === tankId ? 'opacity-100' : 'opacity-0'}`} />
                                            <span className="min-w-0 flex-1 whitespace-normal break-words text-start">{tank.name}</span>
                                            <bdi dir="ltr" className="shrink-0 text-xs text-muted-foreground">{available(tank).toLocaleString()} kg</bdi>
                                        </CommandItem>)}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover></div>
                <div className="space-y-2"><Label htmlFor="status-transfer-kg">{t('rawMaterialProcesses.transferKg')} (kg)</Label>
                    <Input id="status-transfer-kg" type="number" min="0.0001" step="0.0001" max={process?.output_quantity_kg} value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></div>
            </>}
            <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t('common.cancel')}</Button>
                <Button type="submit" disabled={saving || isLoading || tanksLoading}>{t(saving ? 'common.saving' : 'common.save')}</Button></DialogFooter>
        </form>
    </DialogContent></Dialog>;
}
