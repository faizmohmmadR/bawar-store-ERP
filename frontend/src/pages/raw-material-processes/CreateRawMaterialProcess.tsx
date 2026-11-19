import { DualCurrencyAmount, useCostReportingRate } from '@/components/display/DualCurrencyCosts';
import { productionMassSummary, productionIngredientAvailability } from '@/lib/productionInput';
import { convertMass } from '@/lib/massUnits';
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Factory, Plus, Trash2 } from 'lucide-react';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { notifySuccess } from '@/lib/notify';
import api from '@/api/client';
import useFetchObjects from '@/api/useFetchObjects';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Autocomplete } from '@/components/ui/autocomplete';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { useLanguage } from '@/contexts/LanguageContext';
import type {
    RawMaterialProcess,
    RawMaterialProcessMaterialOption,
    RawMaterialProcessStatus,
} from '@/types/raw-material-process';
import type { StorageTank } from '@/types/storage-tank';

type IngredientDraft = {
    id: string;
    raw_material: string;
    quantity: string;
    piece_count: string;
    quantity_unit: string;
};

type StorageTransferDraft = {
    storage_tank: string;
    quantity_kg: string;
};

let ingredientRowSequence = 0;

const nextIngredientId = () => `ingredient-${++ingredientRowSequence}`;

const blankIngredient = (): IngredientDraft => ({
    id: nextIngredientId(),
    raw_material: '',
    quantity: '',
    piece_count: '0',
    quantity_unit: 'kg',
});

const blankStorageTransfer = (): StorageTransferDraft => ({
    storage_tank: '',
    quantity_kg: '',
});

const CreateRawMaterialProcess = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const editing = Boolean(id);
    const queryClient = useQueryClient();
    const [productName, setProductName] = useState('');
    const [processDate, setProcessDate] = useState(new Date().toISOString().slice(0, 10));
    const [status, setStatus] = useState<RawMaterialProcessStatus>('in_process');
    const [outputKilograms, setOutputKilograms] = useState('');
    const [outputFromInputs, setOutputFromInputs] = useState(true);
    const [waterQuantity, setWaterQuantity] = useState('');
    const [extraExpense, setExtraExpense] = useState('0');
    const [notes, setNotes] = useState('');
    const [ingredients, setIngredients] = useState<IngredientDraft[]>([blankIngredient()]);
    const [storageTransfers, setStorageTransfers] = useState<StorageTransferDraft[]>([blankStorageTransfer()]);
    const [saving, setSaving] = useState(false);
    const [ingredientErrors, setIngredientErrors] = useState<Record<string, string>>({});

    const { data: existingProcess, isLoading: processLoading } = useFetchObjects<RawMaterialProcess>({
        queryKey: ['raw-material-process', id],
        endpoint: `raw-material-processes/${id}`,
        enabled: editing,
    });
    const { rate: usdRate } = useCostReportingRate(
        existingProcess ? existingProcess.usd_to_afn_rate ?? null : undefined,
        processDate,
    );
    const { data: stockData, isLoading: stockLoading } = useFetchObjects<{
        results: RawMaterialProcessMaterialOption[];
    }>({
        queryKey: ['raw-material-process-available-stock', id || 'new'],
        endpoint: 'raw-material-processes/available-materials',
        params: { page_size: 1000, ...(id ? { process_id: id } : {}) },
    });
    const { data: storageData, isLoading: storageLoading } = useFetchObjects<{
        results: StorageTank[];
    }>({
        queryKey: ['storage-tanks'],
        endpoint: 'storage-tanks',
        params: { page_size: 1000 },
    });
    const availableStock = stockData?.results || [];
    const storageTanks = storageData?.results || [];
    const massSummary = productionMassSummary(ingredients, waterQuantity, availableStock);
    const effectiveOutputKg = outputFromInputs ? massSummary.total : Number(outputKilograms) || 0;
    const ingredientAvailability = ingredients.map(item => productionIngredientAvailability(item, availableStock));
    const hasIngredientShortage = ingredientAvailability.some(row => row.insufficient || row.insufficientPieces || (outputFromInputs && row.invalidMassUnit));
    const consumableStock = availableStock.filter(
        (stock) => Number(stock.available_quantity) > 0,
    );
    const tankAvailableForProduction = (tank: StorageTank) => (
        Number(tank.available_kg) + (existingProcess?.storage_transfers
            .filter((transfer) => transfer.storage_tank === tank.id).reduce((total, transfer) => total + Number(transfer.quantity_kg), 0) || 0)
    );
    useEffect(() => {
        if (!existingProcess) return;
        setProductName(existingProcess.product_name);
        setProcessDate(existingProcess.process_date.slice(0, 10));
        setStatus(existingProcess.status);
        setOutputKilograms(existingProcess.output_quantity_kg);
        setOutputFromInputs(existingProcess.output_from_inputs ?? false);
        setWaterQuantity(existingProcess.water_quantity_kg);
        setExtraExpense(existingProcess.extra_expense);
        setNotes(existingProcess.notes || '');
        setIngredients([
            blankIngredient(),
            ...existingProcess.items.map((item) => ({
                id: nextIngredientId(),
                raw_material: String(item.raw_material),
                quantity: item.quantity,
                piece_count: String(item.piece_count),
                quantity_unit: item.raw_material_details.unit,
            })),
        ]);
        const existingTransfers = existingProcess.storage_transfers;
        const kgTotal = existingTransfers.reduce(
            (total, transfer) => total + Number(transfer.quantity_kg),
            0,
        );
        setStorageTransfers([{
            storage_tank: existingTransfers.length === 1
                ? String(existingTransfers[0].storage_tank)
                : '',
            quantity_kg: kgTotal > 0 ? String(kgTotal) : '',
        }]);
    }, [existingProcess]);

    const updateIngredient = (index: number, patch: Partial<IngredientDraft>) => {
        setIngredientErrors(current => { const next = { ...current }; delete next[ingredients[index].id]; return next; });
        setIngredients((current) => current.map((item, itemIndex) =>
            itemIndex === index ? { ...item, ...patch } : item,
        ));
    };

    const changeStatus = (value: RawMaterialProcessStatus) => {
        setStatus(value);
        if (value !== 'moved_to_storage') {
            setStorageTransfers([blankStorageTransfer()]);
        } else {
            setStorageTransfers((current) => current.length ? current : [blankStorageTransfer()]);
        }
    };

    const updateStorageTank = (index: number, tankId: string) => {
        const tank = storageTanks.find((entry) => String(entry.id) === tankId);
        const quantity = tank ? String(Math.max(0, Math.min(tankAvailableForProduction(tank), effectiveOutputKg))) : '';
        setStorageTransfers((current) => current.map((row, rowIndex) => rowIndex === index
            ? { storage_tank: tankId, quantity_kg: quantity } : row));
    };

    const materialCostEstimate = ingredients.reduce((total, ingredient) => {
        let quantity = Number(ingredient.quantity);
        if (!ingredient.raw_material || quantity <= 0) return total;
        const stock = availableStock.find(
            (entry) => String(entry.raw_material) === ingredient.raw_material,
        );
        const stockUnit = stock?.raw_material_details?.unit;
        if (stockUnit === 'kg' && ingredient.quantity_unit === 'g') quantity /= 1000;
        if (stockUnit === 'g' && ingredient.quantity_unit === 'kg') quantity *= 1000;
        total += quantity * Number(stock?.stock_unit_cost_afn || 0);
        return total;
    }, 0);
    const totalCostEstimate = materialCostEstimate + (Number(extraExpense) || 0);
    const costPerKilogramEstimate = effectiveOutputKg > 0
        ? totalCostEstimate / effectiveOutputKg
        : 0;

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const selectedIngredients = ingredients.filter((item) => item.raw_material);
        if (!productName.trim() || effectiveOutputKg <= 0 || waterQuantity === '' || selectedIngredients.length === 0) {
            toast.error(t('rawMaterialProcesses.validationRequired'));
            return;
        }
        if (new Set(selectedIngredients.map((item) => item.raw_material)).size !== selectedIngredients.length) {
            toast.error(t('rawMaterialProcesses.duplicateIngredient', 'A raw material can only be added once per production run.'));
            return;
        }
        if (selectedIngredients.some((item) => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)) {
            toast.error(t('rawMaterialProcesses.noIngredients'));
            return;
        }
        const unavailableRows = selectedIngredients.filter((item) => !availableStock.some((stock) => String(stock.raw_material) === item.raw_material));
        if (!stockLoading && unavailableRows.length > 0) {
            const message = t('rawMaterialProcesses.materialUnavailable');
            setIngredientErrors(Object.fromEntries(unavailableRows.map((item) => [item.id, message])));
            toast.error(message);
            return;
        }
        if (hasIngredientShortage) {
            toast.error(t('rawMaterialProcesses.insufficientIngredient'));
            return;
        }
        const selectedTransfers = status === 'moved_to_storage'
            ? storageTransfers.filter((transfer) => transfer.storage_tank)
            : [];
        if (status === 'moved_to_storage' && selectedTransfers.length === 0) {
            toast.error(t('rawMaterialProcesses.storageTransferRequired'));
            return;
        }
        if (selectedTransfers.some((transfer) => !(Number(transfer.quantity_kg) > 0)) ||
            selectedTransfers.reduce((total, transfer) => total + Number(transfer.quantity_kg), 0) > effectiveOutputKg) {
            toast.error(t('rawMaterialProcesses.storageTransferExceedsOutput'));
            return;
        }

        setIngredientErrors({});
        setSaving(true);
        try {
            const payload = {
                product_name: productName.trim(),
                product: null,
                process_date: `${processDate}T12:00:00`,
                status,
                output_quantity_kg: String(effectiveOutputKg),
                output_from_inputs: outputFromInputs,
                water_quantity_kg: waterQuantity,
                extra_expense: extraExpense || '0',
                expense_currency: 1,
                notes,
                items: selectedIngredients.map((item) => ({
                    raw_material: Number(item.raw_material),
                    quantity: item.quantity,
                    quantity_unit: item.quantity_unit,
                    piece_count: Number(item.piece_count) || 0,
                })),
                storage_transfers: selectedTransfers.map((transfer) => ({
                    storage_tank: Number(transfer.storage_tank), quantity_kg: transfer.quantity_kg,
                })),
            };
            const { data: process } = editing
                ? await api.put<RawMaterialProcess>(`/raw-material-processes/${id}/`, payload)
                : await api.post<RawMaterialProcess>('/raw-material-processes/', payload);
            queryClient.invalidateQueries({ queryKey: ['raw-material-processes'] });
            queryClient.invalidateQueries({ queryKey: ['raw-material-process-available-stock'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard_operational'] });
            queryClient.invalidateQueries({ queryKey: ['financial_operational'] });
            queryClient.invalidateQueries({ queryKey: ['raw-material-stocks'] });
            queryClient.invalidateQueries({ queryKey: ['storage-tanks'] });
            queryClient.invalidateQueries({ queryKey: ['raw-material-process', id] });
            notifySuccess(
                editing
                    ? t('rawMaterialProcesses.processUpdated')
                    : t('rawMaterialProcesses.processCreated'),
                {
                    title: t('common.success'),
                    dismissLabel: t('common.dismiss') || 'Dismiss',
                },
            );
            navigate(`/raw-material-processes/${process.id}`);
        } catch (error: unknown) {
            const payload = isAxiosError(error) ? error.response?.data : undefined;
            const flattenErrors = (value: unknown): string => value && typeof value === 'object' ? Object.values(value).map(flattenErrors).join(' ') : String(value || '');
            if (payload?.items && typeof payload.items === 'object' && !Array.isArray(payload.items)) {
                const rowErrors: Record<string, string> = {};
                Object.entries(payload.items).forEach(([index, value]) => { const row = selectedIngredients[Number(index)]; if (row) rowErrors[row.id] = flattenErrors(value); });
                setIngredientErrors(rowErrors);
                queryClient.invalidateQueries({ queryKey: ['raw-material-process-available-stock'] });
            }
            const message = payload && typeof payload === 'object'
                ? flattenErrors(payload)
                : editing
                    ? t('rawMaterialProcesses.processUpdateFailed')
                    : t('rawMaterialProcesses.processCreateFailed');
            toast.error(t('common.error'), { description: message });
        } finally {
            setSaving(false);
        }
    };

    if (editing && processLoading) {
        return <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>;
    }

    return (
        <div className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
            <header className="flex items-center gap-3 border-b pb-4">
                <Button type="button" variant="ghost" size="icon" onClick={() => navigate('/raw-material-processes')}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-xl font-semibold">{editing ? t('rawMaterialProcesses.editProcess') : t('rawMaterialProcesses.addProcess')}</h1>
                    <p className="text-sm text-muted-foreground">{t('rawMaterialProcesses.subtitle')}</p>
                </div>
            </header>

            <form onSubmit={submit} className="space-y-5">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Factory className="h-4 w-4" />
                            {t('rawMaterialProcesses.processDetails')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)_minmax(180px,1fr)]">
                        <div className="space-y-2">
                            <Label htmlFor="product-name">{t('rawMaterialProcesses.productionName')} *</Label>
                            <Input
                                id="product-name"
                                value={productName}
                                onChange={(event) => setProductName(event.target.value)}
                                placeholder={t('rawMaterialProcesses.productionNamePlaceholder', 'e.g. Rose water batch')}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="process-date">{t('rawMaterialProcesses.processDate')} *</Label>
                            <DatePickerInput
                                value={processDate}
                                onChange={setProcessDate}
                                placeholder="dd/mm/yyyy"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="process-status">{t('rawMaterialProcesses.processStatus')}</Label>
                            <Select value={status} onValueChange={(value: RawMaterialProcessStatus) => changeStatus(value)}>
                                <SelectTrigger id="process-status"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="in_process">{t('rawMaterialProcesses.statusInProcess')}</SelectItem>
                                    <SelectItem value="completed">{t('rawMaterialProcesses.statusCompleted')}</SelectItem>
                                    <SelectItem value="moved_to_storage">{t('rawMaterialProcesses.statusMovedToStorage')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-3">
                        <CardTitle className="text-base">{t('rawMaterialProcesses.ingredients')}</CardTitle>
                        <Button type="button" variant="outline" size="sm" onClick={() => setIngredients((current) => [current[0], blankIngredient(), ...current.slice(1)])}>
                            <Plus className="h-4 w-4" />
                            {t('rawMaterialProcesses.addIngredient')}
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {stockLoading ? (
                            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
                        ) : consumableStock.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('rawMaterialProcesses.noStock')}</p>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                {t(
                                    'rawMaterialProcesses.cartonPlasticOptionalHint',
                                    'Chemistry and carton plastic can be selected. Carton plastic is optional — enter kg and piece count when used.',
                                )}
                            </p>
                        )}
                        <div className="overflow-x-auto">
                            <div className="min-w-[820px] space-y-1">
                                <div className="grid grid-cols-[36px_minmax(420px,4fr)_minmax(210px,1.4fr)_minmax(150px,0.8fr)_40px] items-center gap-3 border-b bg-muted/20 px-3 py-2.5 text-xs font-semibold text-muted-foreground">
                                    <span className="text-center">#</span>
                                    <span className="whitespace-nowrap">{t('rawMaterialProcesses.selectMaterial')}</span>
                                    <span className="whitespace-nowrap">{t('rawMaterialProcesses.quantityToUse')}</span>
                                    <span className="whitespace-nowrap">{t('rawMaterialProcesses.pieceCountToUse')}</span>
                                    <span aria-label={t('common.actions')} />
                                </div>
                                <div className="grid grid-cols-[36px_minmax(420px,4fr)_minmax(210px,1.4fr)_minmax(150px,0.8fr)_40px] items-center gap-3 border-b px-3 py-3">
                                    <span className="text-center text-xs text-muted-foreground">—</span>
                                    <div className="min-w-0">
                                        <Label htmlFor="water-material" className="sr-only">{t('rawMaterialProcesses.selectMaterial')}</Label>
                                        <Input id="water-material" disabled placeholder={`${t('rawMaterialProcesses.waterNotInventory')} (kg)`} />
                                    </div>
                                    <div className="min-w-0">
                                        <Label htmlFor="water-kg" className="sr-only">{t('rawMaterialProcesses.quantityToUse')} (kg)</Label>
                                        <div className="relative" dir="ltr">
                                            <Input id="water-kg" type="number" min="0" step="0.0001" className="pr-12" value={waterQuantity} onChange={(event) => {
                                                const nextWaterQuantity = event.target.value;
                                                setWaterQuantity(nextWaterQuantity);
                                                setOutputKilograms(nextWaterQuantity);
                                            }} required placeholder="0" />
                                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">kg</span>
                                        </div>
                                    </div>
                                    <div className="min-w-0">
                                        <Label htmlFor="water-packages" className="sr-only">{t('rawMaterialProcesses.pieceCountToUse')}</Label>
                                        <Input id="water-packages" disabled placeholder={t('rawMaterialProcesses.notApplicable')} />
                                    </div>
                                    <div className="flex justify-center">
                                        <Button type="button" variant="ghost" size="icon" aria-label={t('common.delete')} disabled>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                                {ingredients.map((ingredient, index) => {
                                    const stock = availableStock.find((entry) => String(entry.raw_material) === ingredient.raw_material);
                                    const selectedMaterial = consumableStock.find((entry) => String(entry.raw_material) === ingredient.raw_material) || stock || null;
                                    const unit = selectedMaterial?.raw_material_details?.unit || stock?.raw_material_details?.unit || 'kg';
                                    const availability = ingredientAvailability[index];
                                    const serverError = ingredientErrors[ingredient.id];
                                    return (
                                        <div key={ingredient.id} className="grid grid-cols-[36px_minmax(420px,4fr)_minmax(210px,1.4fr)_minmax(150px,0.8fr)_40px] items-center gap-x-3 gap-y-1.5 border-b px-3 py-3 last:border-0 hover:bg-muted/20">
                                            <span className="flex h-10 items-center justify-center text-xs font-semibold tabular-nums text-muted-foreground">
                                                {ingredients.length - index}
                                            </span>
                                            <div className="min-w-0">
                                                <Label className="sr-only">{t('rawMaterialProcesses.selectMaterial')} *</Label>
                                                <Autocomplete
                                                    value={ingredient.raw_material ? Number(ingredient.raw_material) : ''}
                                                    onChange={(value) => {
                                                        setIngredients((current) => {
                                                            const rowIndex = current.findIndex((item) => item.id === ingredient.id);
                                                            if (rowIndex < 0) return current;
                                                            const selectedMaterial = value ? String(value) : '';
                                                            const updated = current.map((item, itemIndex) => itemIndex === rowIndex
                                                                ? {
                                                                    ...item,
                                                                    raw_material: selectedMaterial,
                                                                    quantity: '',
                                                                    quantity_unit: consumableStock.find((entry) => String(entry.raw_material) === selectedMaterial)?.raw_material_details.unit || 'kg',
                                                                    piece_count: '0',
                                                                }
                                                                : item,
                                                            );
                                                            const materialChanged = current[rowIndex].raw_material !== selectedMaterial;
                                                            if (!selectedMaterial || !materialChanged) return updated;

                                                            const selected = updated[rowIndex];
                                                            if (!current[rowIndex].raw_material && rowIndex === 0) {
                                                                return [
                                                                    blankIngredient(),
                                                                    selected,
                                                                    ...updated.filter((item) => item.id !== ingredient.id),
                                                                ];
                                                            }
                                                            if (rowIndex > 1) {
                                                                return [
                                                                    updated[0],
                                                                    selected,
                                                                    ...updated.filter((item) => item.id !== ingredient.id && item.id !== updated[0].id),
                                                                ];
                                                            }
                                                            return updated;
                                                        });
                                                    }}
                                                    options={consumableStock.filter((option) =>
                                                        !ingredients.some((item, itemIndex) =>
                                                            itemIndex !== index && item.raw_material === String(option.raw_material),
                                                        ),
                                                    )}
                                                    placeholder={t('rawMaterialProcesses.selectMaterial')}
                                                    getOptionLabel={(option) => {
                                                        const availableQty = Number(option.available_quantity || 0);
                                                        const availablePieces = Number(option.available_piece_count || 0);
                                                        const materialName = option.raw_material_details?.name || option.raw_material_name || 'Unknown';
                                                        const labelUnit = option.raw_material_details?.unit || 'kg';
                                                        const materialType = option.raw_material_details?.material_type;
                                                        const typeSuffix = materialType === 'carton_plastic'
                                                            ? ` · ${t('rawMaterials.typeCartonPlastic')}`
                                                            : materialType === 'chemistry'
                                                                ? ` · ${t('rawMaterials.typeChemistry')}`
                                                                : materialType === 'boiler'
                                                                    ? ` · ${t('rawMaterials.typeBoiler')}`
                                                                    : '';
                                                        const avgPrice = Number(option.stock_unit_cost_afn || 0);
                                                        const priceSuffix = avgPrice > 0 ? ` · ${t('stock.weightedAverageUnitCost')}: ؋${avgPrice.toLocaleString(undefined, { maximumFractionDigits: 6 })}/${labelUnit}` : '';
                                                        const pieceSuffix = labelUnit === 'kg' ? `, ${availablePieces.toLocaleString()} pcs` : '';
                                                        return `${materialName}${typeSuffix} — ${availableQty.toLocaleString()} ${labelUnit}${pieceSuffix}${priceSuffix}`;
                                                    }}
                                                    getOptionValue={(option) => String(option.raw_material)}
                                                    className="h-auto min-h-10 w-full text-start [&>span]:whitespace-normal [&>span]:break-words"
                                                />
                                            </div>

                                            <div className="min-w-0">
                                                <Label htmlFor={`quantity-${index}`} className="sr-only">{t('rawMaterialProcesses.quantityToUse')} ({unit}) *</Label>
                                                <div className="relative" dir="ltr">
                                                    <Input id={`quantity-${index}`} type="number"
                                                        min={unit === 'g' ? (ingredient.quantity_unit === 'kg' ? '0.0000001' : '0.0001') : (ingredient.quantity_unit === 'g' ? '0.1' : '0.0001')}
                                                        step="any"
                                                        disabled={!ingredient.raw_material} value={ingredient.quantity} onChange={(event) => updateIngredient(index, { quantity: event.target.value })}
                                                        aria-invalid={Boolean(serverError) || availability.insufficient || (outputFromInputs && availability.invalidMassUnit)} aria-describedby={`ingredient-stock-${index}`}
                                                        className={`pr-16 ${availability.insufficient ? 'border-destructive' : ''}`} required={Boolean(ingredient.raw_material)} placeholder="0" />
                                                    {(unit === 'kg' || unit === 'g') ? <Select disabled={!ingredient.raw_material} value={ingredient.quantity_unit} onValueChange={(value) => updateIngredient(index, {
                                                        quantity_unit: value,
                                                        quantity: ingredient.quantity ? convertMass(ingredient.quantity, ingredient.quantity_unit as 'kg' | 'g', value as 'kg' | 'g') : '',
                                                    })}>
                                                        <SelectTrigger aria-label={t('rawMaterials.unit')} className="absolute right-0 top-0 h-10 w-16 rounded-l-none border-y-0 border-r-0 bg-transparent px-2 shadow-none focus:ring-inset"><SelectValue /></SelectTrigger>
                                                        <SelectContent><SelectItem value="kg">kg</SelectItem><SelectItem value="g">gr</SelectItem></SelectContent>
                                                    </Select> : <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{unit}</span>}
                                                </div>

                                            </div>
                                            {unit === 'kg' ? (
                                                <div className="min-w-0">
                                                    <Label htmlFor={`pieces-${index}`} className="sr-only">{t('rawMaterialProcesses.pieceCountToUse')}</Label>
                                                    <Input id={`pieces-${index}`} type="number" min="0" step="1" disabled={!ingredient.raw_material} value={ingredient.piece_count} onChange={(event) => updateIngredient(index, { piece_count: event.target.value })} placeholder="0" />

                                                </div>
                                            ) : <div className="flex h-10 items-center justify-center text-sm text-muted-foreground">—</div>}
                                            <div className="flex items-center justify-center">
                                                <Button type="button" variant="ghost" size="icon" aria-label={t('common.delete')} onClick={() => setIngredients((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={ingredients.length === 1}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            {ingredient.raw_material && !stockLoading && (serverError || availability.insufficient || (outputFromInputs && availability.invalidMassUnit)) && <p id={`ingredient-stock-${index}`} role={availability.insufficient ? 'alert' : undefined} className={`col-start-3 row-start-2 min-w-0 text-xs leading-relaxed ${serverError || availability.insufficient || (outputFromInputs && availability.invalidMassUnit) ? 'text-destructive' : 'text-muted-foreground'}`}>
                                                    {serverError || (outputFromInputs && availability.invalidMassUnit ? t('rawMaterialProcesses.massUnitRequired') : <>{availability.insufficient ? t('rawMaterialProcesses.insufficientIngredient') : t('rawMaterialProcesses.availableIngredient')}: <bdi dir="ltr">{availability.available.toLocaleString(undefined, { maximumFractionDigits: 4 })} {availability.unit}</bdi></>)}
                                                </p>}
                                            {availability.insufficientPieces && <p role="alert" className="col-start-4 row-start-2 min-w-0 text-xs text-destructive">{t('rawMaterialProcesses.insufficientPackages')}: {availability.availablePieces}</p>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {status === 'moved_to_storage' && <Card>
                    <CardHeader>
                        <CardTitle className="text-base">{t('rawMaterialProcesses.transferToStorage')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {storageLoading ? (
                            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
                        ) : storageTanks.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('rawMaterialProcesses.noStorageTankCapacity')}</p>
                        ) : null}
                        {storageTransfers.map((transfer, index) => {
                            const currentTank = storageTanks.find((tank) => String(tank.id) === transfer.storage_tank);
                            const tankOptions = storageTanks.filter((tank) =>
                                tankAvailableForProduction(tank) - storageTransfers
                                    .filter((row, rowIndex) => rowIndex !== index && row.storage_tank === String(tank.id))
                                    .reduce((total, row) => total + (Number(row.quantity_kg) || 0), 0) > 0
                                || String(tank.id) === transfer.storage_tank,
                            );
                            return (
                                <div key={index} className="grid gap-3 border-b pb-4 last:border-0 sm:grid-cols-[minmax(220px,2fr)_minmax(180px,1fr)] sm:items-end">
                                    <div className="flex min-w-0 flex-col gap-2">
                                        <Label className="block text-sm font-medium">{t('rawMaterialProcesses.selectStorageTank')}</Label>
                                        <Autocomplete
                                            options={tankOptions}
                                            value={transfer.storage_tank ? Number(transfer.storage_tank) : ''}
                                            onChange={(value) => updateStorageTank(index, value ? String(value) : '')}
                                            placeholder={t('rawMaterialProcesses.selectStorageTank')}
                                            getOptionLabel={(option) => {
                                                const tank = option as StorageTank;
                                                return `${tank.name} · ${tankAvailableForProduction(tank).toLocaleString()} / ${Number(tank.capacity_kg).toLocaleString()} kg ${t('rawMaterialProcesses.availableKg', 'Available (kg)').toLowerCase()}`;
                                            }}
                                            getOptionValue={(tank) => String(tank.id)}
                                            className="h-10 w-full"
                                            initialLabel={currentTank ? `${currentTank.name} · ${tankAvailableForProduction(currentTank).toLocaleString()} / ${Number(currentTank.capacity_kg).toLocaleString()} kg` : undefined}
                                        />
                                    </div>

                                    <div className="space-y-2 min-w-0 sm:col-start-2">
                                        <Label htmlFor={`storage-transfer-kg-${index}`}>{t('rawMaterialProcesses.transferKg')} (kg)</Label>
                                        <Input
                                            id={`storage-transfer-kg-${index}`}
                                            type="number"
                                            min="0.0001"
                                            step="0.0001"
                                            max={effectiveOutputKg || undefined}
                                            value={transfer.quantity_kg}
                                            onChange={(event) => setStorageTransfers((current) => current.map((row, rowIndex) =>
                                                rowIndex === index
                                                    ? { ...row, quantity_kg: event.target.value }
                                                    : row,
                                            ))}
                                            required={Boolean(transfer.storage_tank)}
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>}

                <div className="grid gap-5">
                    <Card>
                        <CardHeader><CardTitle className="text-base">{t('rawMaterialProcesses.extraExpense')}</CardTitle></CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-[minmax(180px,1fr)_minmax(0,2fr)]">
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="extra-expense">
                                    {t('rawMaterialProcesses.extraExpense')}
                                </Label>
                                <Input
                                    id="extra-expense"
                                    type="number"
                                    min="0"
                                    step="0.0001"
                                    value={extraExpense}
                                    onChange={(event) => setExtraExpense(event.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="process-notes">{t('rawMaterialProcesses.notes')}</Label>
                                <Textarea id="process-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle className="text-base">{t('rawMaterialProcesses.summary')}</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                            <div className="grid items-start gap-4 md:grid-cols-2">
                                <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-sm">
                                    <div className="flex justify-between gap-3"><span>{t('rawMaterialProcesses.chemistryWeight')}</span><bdi dir="ltr">{massSummary.chemistry.toLocaleString()} kg</bdi></div>
                                    {massSummary.other > 0 && <div className="flex justify-between gap-3"><span>{t('rawMaterialProcesses.otherMaterialWeight')}</span><bdi dir="ltr">{massSummary.other.toLocaleString()} kg</bdi></div>}
                                    <div className="flex justify-between gap-3"><span>{t('rawMaterialProcesses.materialsWeight')}</span><bdi dir="ltr">{massSummary.materials.toLocaleString()} kg</bdi></div>
                                    <div className="flex justify-between gap-3"><span>{t('rawMaterialProcesses.water')}</span><bdi dir="ltr">{massSummary.water.toLocaleString()} kg</bdi></div>
                                    <div className="flex justify-between gap-3 border-t pt-2 font-semibold"><span>{t('rawMaterialProcesses.totalMixtureWeight')}</span><bdi dir="ltr">{massSummary.total.toLocaleString()} kg</bdi></div>
                                </div>
                                <div className="space-y-3 rounded-lg border p-3 text-sm">

                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">{t('rawMaterialProcesses.materialCost')}</span>
                                        <DualCurrencyAmount afn={materialCostEstimate} rate={usdRate} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">{t('rawMaterialProcesses.extraExpense')}</span>
                                        <DualCurrencyAmount afn={(Number(extraExpense) || 0)} rate={usdRate} />
                                    </div>
                                    <div className="flex items-center justify-between border-t pt-3">
                                        <span className="font-medium">{t('rawMaterialProcesses.totalCost')}</span>
                                        <DualCurrencyAmount afn={totalCostEstimate} rate={usdRate} />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">{t('rawMaterialProcesses.costPerKg', 'Cost per kg')}</span>
                                        <DualCurrencyAmount afn={costPerKilogramEstimate} rate={usdRate} />
                                    </div>

                                </div>
                            </div>
                            <p className="text-xs leading-relaxed text-muted-foreground">{t(outputFromInputs ? 'rawMaterialProcesses.mixtureCostHint' : 'rawMaterialProcesses.legacyYieldHint')}</p>
                            {hasIngredientShortage && <p role="alert" className="text-sm text-destructive">{t('rawMaterialProcesses.insufficientIngredient')}</p>}
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                                <div className="flex flex-wrap items-center gap-3">
                                    <Label htmlFor="output-kg">{t('rawMaterialProcesses.outputKg', 'Produced kilograms')} *</Label>
                                    {!outputFromInputs && <Button type="button" size="sm" variant="outline" onClick={() => setOutputFromInputs(true)}>{t('rawMaterialProcesses.useMixtureTotal')}</Button>}
                                    <Input
                                        id="output-kg"
                                        className="max-w-40 text-right tabular-nums"
                                        type="number"
                                        min="0.0001"
                                        step="0.0001"
                                        readOnly={outputFromInputs} value={outputFromInputs ? String(massSummary.total) : outputKilograms}
                                        onChange={(event) => setOutputKilograms(event.target.value)}
                                        required
                                    />
                                </div>

                                <Button type="submit" className="w-full sm:w-auto sm:min-w-48" disabled={saving || stockLoading || hasIngredientShortage || (editing && processLoading)}>
                                    {saving
                                        ? editing ? t('rawMaterialProcesses.updating') : t('rawMaterialProcesses.creating')
                                        : editing ? t('rawMaterialProcesses.saveChanges') : t('rawMaterialProcesses.addProcess')}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </form>
        </div>
    );
};

export default CreateRawMaterialProcess;
