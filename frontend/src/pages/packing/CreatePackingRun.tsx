import { StockProductQuantity } from '@/components/stock/StockProductQuantity';
import { StockProductPicker, StockProductModeButton, type StockProductChoice } from '@/components/stock/StockProductPicker';
import { packingFullUnitCosts } from '@/lib/packingStockCosts';
import { formatPrice } from '@/lib/formatNumber';
import { PackingCostSummary, PackingFullUnitCosts } from '@/components/packing/PackingCostSummary';
import { CategoryMaterialPicker, PackingMaterialCategoryField } from '@/components/raw-materials/CategoryMaterialPicker';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { notifySuccess } from '@/lib/notify';
import { PackageCheck } from 'lucide-react';
import api from '@/api/client';
import useFetchObjects from '@/api/useFetchObjects';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormPage } from '@/components/forms/FormPage';
import { FormActions } from '@/components/forms/FormActions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';
import { expectedPackingComponentQuantities } from '@/lib/packaging';
import type { PackingComponentType, PackingComponentStockOption, PackingRun, PackingTankOption, PackingReturn } from '@/types/packing';

const COMPONENTS: PackingComponentType[] = ['bottle', 'cap', 'cap_label', 'label', 'plastic', 'carton'];
const OPTIONAL_COMPONENTS = COMPONENTS;
const AUTO_QUANTITY_COMPONENTS: PackingComponentType[] = ['bottle', 'label', 'carton', 'cap', 'cap_label', 'plastic'];
const LABEL_MATERIAL_TYPES = ['label', 'label_double'] as const;
const PACKING_TABLE_COLS = 'grid-cols-[110px_130px_minmax(540px,1fr)_96px_110px]';

const emptyComponents = (): Record<PackingComponentType, string> => ({
    bottle: '', cap: '', cap_label: '', label: '', plastic: '', carton: '', carton_plastic: '',
});
const emptyQuantities = (): Record<PackingComponentType, string> => ({
    bottle: '', cap: '', cap_label: '', label: '', plastic: '', carton: '', carton_plastic: '',
});

const TankPackingForm = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const editing = Boolean(id);
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const [returnId, setReturnId] = useState(searchParams.get('returned') || '');
    const [returnCount, setReturnCount] = useState('');
    const [returnCartonId, setReturnCartonId] = useState('');
    const [returnCartonQuantity, setReturnCartonQuantity] = useState('');
    const [returnCartonCategory, setReturnCartonCategory] = useState('all');
    const [tankId, setTankId] = useState('');
    const [quantityKilograms, setQuantityKilograms] = useState('');
    const manualQuantities = useRef(new Set<PackingComponentType>());
    const [componentStocks, setComponentStocks] = useState(emptyComponents);
    const [componentCategories, setComponentCategories] = useState<Partial<Record<PackingComponentType, string>>>({});
    const [componentQuantities, setComponentQuantities] = useState(emptyQuantities);
    const [notes, setNotes] = useState('');
    const [outputProducts, setOutputProducts] = useState<Record<string, StockProductChoice>>({});
    const setOutputProduct = (kind: string, value: StockProductChoice) => setOutputProducts(current => ({ ...current, [kind]: value }));
    const [saving, setSaving] = useState(false);
    const [editInitialized, setEditInitialized] = useState(!editing);
    const skipNextAutoQtyRef = useRef(false);
    const initializedRunRef = useRef<number | null>(null);

    const { data: returnedData, isLoading: returnsLoading } = useFetchObjects<{ results: PackingReturn[] }>({
        queryKey: ['packing-available-returns', id || 'new'], endpoint: 'packing-runs/available-returns/',
        params: id ? { exclude_run: id } : {},
    });
    const selectedReturn = returnedData?.results.find(row => String(row.id) === returnId);
    const returnOnly = Boolean(returnId) && !tankId;
    const returnedCount = Number(returnCount) || 0;
    const { data: tankData, isLoading: tanksLoading } = useFetchObjects<{ results: PackingTankOption[] }>({
        queryKey: ['packing-available-tanks', id || 'new'],
        endpoint: 'packing-runs/available-tanks',
        params: id ? { exclude_run: id } : {},
        enabled: true,
    });
    const { data: componentData, isLoading: componentsLoading, isFetching: componentsFetching } = useFetchObjects<{ results: PackingComponentStockOption[] }>({
        queryKey: ['packing-available-components', id || 'new'],
        endpoint: 'packing-runs/available-components',
        params: id ? { exclude_run: id } : {},
        enabled: true,
        options: { staleTime: 0 },
    });
    const { data: existingRun, isLoading: runLoading } = useFetchObjects<PackingRun>({
        queryKey: ['packing-run', id],
        endpoint: `packing-runs/${id}`,
        enabled: editing,
    });

    const tanks = useMemo(() => {
        const rows = [...(tankData?.results || [])];
        if (existingRun?.storage_tank && !rows.some((tank) => tank.id === existingRun.storage_tank)) {
            const liters = Number(existingRun.quantity_liters) || 0;
            const kg = Number(existingRun.quantity_kg) || 0;
            rows.unshift({
                id: existingRun.storage_tank,
                name: existingRun.storage_tank_name || `#${existingRun.storage_tank}`,
                available_liters: existingRun.quantity_liters,
                available_kg: existingRun.quantity_kg,
                capacity_liters: existingRun.quantity_liters,
                liquid_cost_per_liter_afn: liters > 0 ? String(Number(existingRun.liquid_cost_afn) / liters) : '0',
                density_kg_per_liter: liters > 0 ? String(kg / liters) : '1',
                usd_to_afn_rate: existingRun.usd_to_afn_rate ?? null,
            });
        }
        return rows;
    }, [tankData, existingRun]);
    const components = useMemo(() => {
        const rows = [...(componentData?.results || [])];
        if (!existingRun) return rows;
        const materialType = (componentType: string): PackingComponentStockOption['material_type'] => (
            componentType === 'returned_carton' ? 'carton' : componentType as PackingComponentStockOption['material_type']
        );
        for (const component of existingRun.components) {
            if (!component.raw_material || rows.some((row) => row.raw_material === component.raw_material)) continue;
            rows.push({
                raw_material: component.raw_material,
                raw_material_name: component.product_name || `#${component.raw_material}`,
                material_type: materialType(component.component_type),
                unit: 'piece',
                available_quantity: String(component.quantity_pieces),
                unit_cost_afn: component.unit_cost_afn,
                purchase_lots: [],
            });
        }
        return rows;
    }, [componentData, existingRun]);
    const componentOptionsLoading = componentsLoading || componentsFetching;
    const selectedReturnCarton = components.find(row => String(row.raw_material) === returnCartonId);
    const returnCartonOptions = components.filter(row => row.material_type === 'carton');
    const selectedTank = tanks.find((tank) => String(tank.id) === tankId);
    const reportingRate = existingRun ? existingRun.usd_to_afn_rate ?? null : selectedTank?.usd_to_afn_rate ?? selectedReturn?.usd_to_afn_rate ?? null;
    const selectedBottleMaterial = tankId ? components.find((o) => String(o.raw_material) === componentStocks.bottle) : undefined;
    const selectedPlasticMaterial = components.find((o) => String(o.raw_material) === componentStocks.plastic);
    const selectedCartonMaterial = components.find((o) => String(o.raw_material) === componentStocks.carton);
    const selectedLabelMaterial = components.find((o) => String(o.raw_material) === componentStocks.label);
    const bottleIncludesCap = selectedBottleMaterial?.material_type === 'bottle_with_cap';
    const labelPiecesPerBottle = selectedLabelMaterial?.material_type === 'label_double' ? 2 : 1;
    const editReady = !editing || editInitialized;

    useEffect(() => {
        if (!bottleIncludesCap) return;
        setComponentStocks((c) => c.cap ? { ...c, cap: '' } : c);
        setComponentQuantities((c) => c.cap ? { ...c, cap: '' } : c);
    }, [bottleIncludesCap]);

    useEffect(() => {
        if (!editing) {
            initializedRunRef.current = null;
            setEditInitialized(true);
            return;
        }
        if (!existingRun || String(existingRun.id) !== String(id)) {
            setEditInitialized(false);
            return;
        }
        if (initializedRunRef.current === existingRun.id) {
            setEditInitialized(true);
            return;
        }
        initializedRunRef.current = existingRun.id;
        setComponentCategories({});
        setReturnCartonCategory('all');
        skipNextAutoQtyRef.current = true;
        setTankId(existingRun.storage_tank ? String(existingRun.storage_tank) : '');
        setReturnId(existingRun.packing_return ? String(existingRun.packing_return) : '');
        setReturnCount(existingRun.returned_bottle_count ? String(existingRun.returned_bottle_count) : '');
        setQuantityKilograms(existingRun.quantity_kg);
        manualQuantities.current = new Set(existingRun.components.filter(row => COMPONENTS.includes(row.component_type as PackingComponentType)).map(row => row.component_type as PackingComponentType));
        setNotes(existingRun.notes || '');
        const newBottleCount = existingRun.bottle_count - (existingRun.returned_bottle_count || 0);
        const fillCount = existingRun.storage_tank ? newBottleCount : existingRun.bottle_count;
        const bottleCapacityKg = fillCount > 0 ? Number(existingRun.quantity_kg) / fillCount : undefined;
        const choices: Record<string, StockProductChoice> = {};
        for (const output of existingRun.outputs || []) {
            if (output.component_type === 'returned_bottle') continue;
            const productId = output.product || (output.component_type === 'bottle' ? existingRun.product || undefined : undefined);
            if (!productId && !output.product_name) continue;
            choices[output.component_type] = {
                product: productId,
                label: output.product_name || existingRun.product_name,
                capacity_kg: output.component_type === 'bottle' ? bottleCapacityKg : undefined,
                capacity_liters: output.component_type === 'bottle' ? existingRun.bottle_volume_liters : undefined,
            };
        }
        // Legacy runs may only expose finished product on the run itself.
        if (!choices.bottle && existingRun.product) {
            choices.bottle = {
                product: existingRun.product,
                label: existingRun.product_name,
                capacity_kg: bottleCapacityKg,
                capacity_liters: existingRun.bottle_volume_liters,
            };
        }
        setOutputProducts(choices);
        const materials = emptyComponents();
        const quantities = emptyQuantities();
        const returnedCarton = existingRun.components.find(row => row.component_type === 'returned_carton')
            || (!existingRun.storage_tank ? existingRun.components.find(row => row.component_type === 'carton') : undefined);
        setReturnCartonId(returnedCarton?.raw_material ? String(returnedCarton.raw_material) : '');
        setReturnCartonQuantity(returnedCarton?.quantity_pieces || '');
        for (const component of existingRun.components) {
            if (existingRun.storage_tank && component.component_type !== 'returned_carton' && COMPONENTS.includes(component.component_type)) {
                materials[component.component_type] = String(component.raw_material || '');
                quantities[component.component_type] = String(component.quantity_pieces);
            }
        }
        setComponentStocks(materials);
        setComponentQuantities(quantities);
        setEditInitialized(true);
    }, [editing, id, existingRun]);

    const density = Number(selectedTank?.density_kg_per_liter) || 1;
    const quantityKg = tankId ? Number(quantityKilograms) || 0 : 0;
    const liters = quantityKg / density;
    const bottleCapacityKg = selectedBottleMaterial
        ? Number(selectedBottleMaterial.capacity_kg) || 0
        : Number(outputProducts.bottle?.capacity_kg) || 0;
    const bottleCapacityLiters = selectedBottleMaterial
        ? Number(selectedBottleMaterial.capacity_liters) || 0
        : Number(outputProducts.bottle?.capacity_liters) || 0;
    const bottleIsKg = !selectedBottleMaterial ? bottleCapacityKg > 0 : !bottleCapacityLiters && bottleCapacityKg > 0;
    const volume = bottleIsKg ? bottleCapacityKg / density : bottleCapacityLiters;

    const packingInput = {
        quantityLiters: liters,
        quantityKg: bottleIsKg ? quantityKg : undefined,
        bottleCapacityLiters: bottleIsKg ? undefined : volume,
        bottleCapacityKg: bottleIsKg ? bottleCapacityKg : undefined,
        plasticCapacityLiters: selectedPlasticMaterial?.capacity_liters,
        plasticCapacityKg: selectedPlasticMaterial?.capacity_kg,
        cartonBottleCapacityLiters: selectedCartonMaterial?.capacity_liters,
        cartonCapacityKg: selectedCartonMaterial?.capacity_kg,
        bottlesPerPlastic: selectedPlasticMaterial?.bottles_per_plastic,
        bottlesPerCarton: selectedCartonMaterial?.bottles_per_carton,
        includeCap: Boolean(componentStocks.cap) && !bottleIncludesCap,
        includeCapLabel: Boolean(componentStocks.cap_label),
        includeLabel: Boolean(componentStocks.label),
        labelPiecesPerBottle,
        includeCartonPlastic: false,
    };
    const packingMath = expectedPackingComponentQuantities(packingInput);
    const bottleCount = (tankId ? packingMath.bottleCount : 0) + returnedCount;
    const bottleOutputSelected = Boolean(outputProducts.bottle?.product || outputProducts.bottle?.product_name?.trim());
    const needsBottleSize = Boolean(selectedBottleMaterial) || bottleOutputSelected;
    const wholeBottleCount = (!tankId || (!needsBottleSize && !volume) || packingMath.wholeBottleCount) && Number.isInteger(returnedCount) && (bottleCount > 0 || Boolean(tankId && !needsBottleSize && !volume));
    const autoQuantities = { ...packingMath.quantities,
        bottle: tankId ? packingMath.quantities.bottle : 0,
        cap: tankId ? packingMath.quantities.cap : 0,
        cap_label: tankId ? packingMath.quantities.cap_label : 0,
        label: tankId ? packingMath.quantities.label : 0,
        carton: packingMath.quantities.carton,
        plastic: Number(selectedPlasticMaterial?.bottles_per_plastic) > 0 ? packingMath.quantities.plastic : 0,
        carton_plastic: 0,
    };

    useEffect(() => {
        if (skipNextAutoQtyRef.current) { skipNextAutoQtyRef.current = false; return; }
        setComponentQuantities((current) => {
            const next = { ...current };
            let changed = false;
            for (const componentType of AUTO_QUANTITY_COMPONENTS) {
                if (manualQuantities.current.has(componentType)) continue;
                if ((OPTIONAL_COMPONENTS.includes(componentType) && !componentStocks[componentType]) || !componentStocks[componentType]) {
                    if (next[componentType] !== '') { next[componentType] = ''; changed = true; }
                    continue;
                }
                const nextValue = autoQuantities[componentType] > 0 ? String(autoQuantities[componentType]) : '';
                if (next[componentType] !== nextValue) { next[componentType] = nextValue; changed = true; }
            }
            return changed ? next : current;
        });
    }, [liters, volume, componentStocks.bottle, componentStocks.cap, componentStocks.cap_label, componentStocks.label, componentStocks.plastic, componentStocks.carton, componentStocks.carton_plastic, selectedPlasticMaterial?.bottles_per_plastic, selectedCartonMaterial?.bottles_per_carton, autoQuantities.bottle, autoQuantities.cap, autoQuantities.cap_label, autoQuantities.label, autoQuantities.plastic, autoQuantities.carton, autoQuantities.carton_plastic]);

    const componentRows = useMemo(() => COMPONENTS.filter(() => Boolean(tankId)).map((componentType) => {
        const stock = components.find((o) => String(o.raw_material) === componentStocks[componentType]);
        const suggestedQuantity = autoQuantities[componentType] || 0;
        const quantity = Number(componentQuantities[componentType]) || 0;
        const unitCost = Number(stock?.unit_cost_afn || 0);
        const total = stock && quantity > 0 ? quantity * unitCost : 0;
        return { componentType, stock, quantity, suggestedQuantity, total };
    }), [components, componentStocks, componentQuantities, autoQuantities, tankId]);

    const liquidCost = selectedTank ? liters * Number(selectedTank.liquid_cost_per_liter_afn) : 0;
    const normalPackagingCost = componentRows.reduce((total, row) => total + row.total, 0);
    const returnCartonUsed = Number(returnCartonQuantity) || 0;
    const returnCartonUnitCost = Number(selectedReturnCarton?.unit_cost_afn || 0);
    const returnCartonCost = returnId ? returnCartonUsed * returnCartonUnitCost : 0;
    const packagingCost = normalPackagingCost + returnCartonCost;
    const returnedCost = returnedCount * Number(selectedReturn?.unit_cost_afn || 0);
    const totalCost = liquidCost + packagingCost + returnedCost;
    // separateReturn: tank + returned bottles each with their own carton row → two cost sections.
    // Combined: returned bottles folded into the same section as new bottles → one section.
    const separateReturn = Boolean(tankId) && Boolean(returnId) && (Boolean(returnCartonId) || !selectedBottleMaterial || Boolean(outputProducts.bottle?.product || outputProducts.bottle?.product_name));
    const newSectionBottles = tankId && packingMath.wholeBottleCount ? packingMath.bottleCount : 0;
    const fullCosts = separateReturn
      ? packingFullUnitCosts(liquidCost + normalPackagingCost, newSectionBottles, componentRows)
      : packingFullUnitCosts(
          liquidCost + normalPackagingCost + returnedCost + returnCartonCost,
          bottleCount,
          [
            ...componentRows,
            ...(returnCartonUsed > 0 ? [{ componentType: 'carton', quantity: returnCartonUsed }] : []),
          ],
        );
    const returnedFullCosts = packingFullUnitCosts(returnedCost + returnCartonCost, returnedCount, [{ componentType: 'carton', quantity: returnCartonUsed }]);
    const amount = (value: number | string, digits = 4) =>
        Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits });

    const setStock = (componentType: PackingComponentType, value: string) => {
        manualQuantities.current.delete(componentType);
        setComponentStocks((c) => ({ ...c, [componentType]: value }));
        setComponentQuantities((c) => ({ ...c, [componentType]: '' }));
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (tankId && needsBottleSize && !volume) {
            toast.error(t('packing.bottleSizeRequired', 'Choose a bottle material or an existing stock product with a bottle size.')); return;
        }
        if ((!tankId && !returnId) || (tankId && !quantityKilograms)) {
            toast.error(t('packing.completeRequiredFields')); return;
        }
        if (!wholeBottleCount) { toast.error(t('packing.invalidBottleCount')); return; }
        if (returnId && (!selectedReturn || !Number.isInteger(returnedCount) || returnedCount <= 0 || returnedCount > selectedReturn.remaining_bottle_count)) {
            toast.error(t('packing.invalidReturnedQuantity')); return;
        }
        if (returnId && (returnCartonId || returnCartonQuantity) && (!selectedReturnCarton || !Number.isInteger(returnCartonUsed) || returnCartonUsed <= 0)) {
            toast.error(t('packing.returnCartonRequired', 'Choose a carton and enter a positive whole carton quantity for returned bottles.')); return;
        }
        if (liters > Number(selectedTank?.available_liters || 0)) {
            toast.error(t('packing.notEnoughTankVolume')); return;
        }
        const submittedRows = componentRows.filter((row) =>
            (!returnOnly && !OPTIONAL_COMPONENTS.includes(row.componentType)) || Boolean(row.stock || componentQuantities[row.componentType]),
        );
        const incompleteOptional = componentRows.find((row) =>
            OPTIONAL_COMPONENTS.includes(row.componentType)
            && (row.stock || componentQuantities[row.componentType])
            && (!row.stock || !Number.isInteger(row.quantity) || row.quantity <= 0),
        );
        if (incompleteOptional) {
            toast.error(incompleteOptional.componentType === 'plastic'
                ? t('packing.selectOptionalPlasticFields', 'Choose plastic and enter the whole number of pieces used, or leave plastic blank.')
                : incompleteOptional.componentType === 'label'
                ? t('packing.selectOptionalLabelFields')
                : t('packing.selectOptionalCapFields'));
            return;
        }
        if (submittedRows.some((r) => !Number.isInteger(r.quantity) || r.quantity <= 0)) {
            toast.error(t('packing.wholePiecesOnly')); return;
        }
        const insufficient = submittedRows.find((r) => r.quantity > Number(r.stock?.available_quantity ?? 0));
        if (insufficient) {
            toast.error(t('packing.notEnoughPackagingStock', { name: insufficient.stock?.raw_material_name || '' })); return;
        }

        if (returnId && selectedReturnCarton) {
            const normalCartons = componentRows.filter(row => row.stock?.raw_material === selectedReturnCarton.raw_material).reduce((sum, row) => sum + row.quantity, 0);
            if (returnCartonUsed + normalCartons > Number(selectedReturnCarton.available_quantity)) {
                toast.error(t('packing.notEnoughPackagingStock', { name: selectedReturnCarton.raw_material_name })); return;
            }
        }

        const outputKinds = ['bottle', ...(!returnOnly && componentStocks.carton ? ['carton'] : []), ...(!returnOnly && componentStocks.plastic ? ['plastic'] : []), ...(returnCartonId ? [returnOnly ? 'carton' : 'returned_carton'] : [])];
        const selectedOutputs = [...new Set(outputKinds)]
            .filter(kind => outputProducts[kind]?.product || outputProducts[kind]?.product_name?.trim())
            .map(component_type => ({
                component_type,
                product: outputProducts[component_type]?.product,
                product_name: outputProducts[component_type]?.product_name?.trim(),
            }));
        if (selectedOutputs.length === 0) {
            toast.error(t('packing.stockOutputRequired', 'Choose or add at least one stock product (bottle, carton, or plastic).'));
            return;
        }
        setSaving(true);
        try {
            const payload = {
                output_products: selectedOutputs,
                storage_tank: tankId ? Number(tankId) : undefined,
                quantity_kg: tankId ? quantityKilograms : undefined,
                packing_return: returnId ? Number(returnId) : null,
                returned_bottle_count: returnedCount,
                returned_carton: !returnOnly && returnId && returnCartonId ? Number(returnCartonId) : undefined,
                returned_carton_quantity: !returnOnly && returnId ? returnCartonUsed : 0,
                bottle_count: returnOnly ? returnedCount : undefined,
                bottle_volume_liters: volume > 0 ? String(volume) : null,
                notes,
                components: returnOnly ? (returnCartonId ? [{ component_type: 'carton', raw_material: Number(returnCartonId), quantity_pieces: returnCartonUsed }] : []) : submittedRows.map(({ componentType }) => ({
                    component_type: componentType,
                    raw_material: Number(componentStocks[componentType]),
                    quantity_pieces: Number(componentQuantities[componentType] || autoQuantities[componentType] || 0),
                })),
            };
            const { data: run } = editing
                ? await api.put<PackingRun>(`/packing-runs/${id}/`, payload)
                : await api.post<PackingRun>('/packing-runs/', payload);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['packing-runs'] }),
                queryClient.invalidateQueries({ queryKey: ['packing-available-returns'] }),
                queryClient.invalidateQueries({ queryKey: ['returned-for-packing'] }),
                queryClient.invalidateQueries({ queryKey: ['packing-returns'] }),
                queryClient.invalidateQueries({ queryKey: ['stocks'] }),
                queryClient.invalidateQueries({ queryKey: ['stock'] }),
                queryClient.invalidateQueries({ queryKey: ['products'] }),
                queryClient.invalidateQueries({ queryKey: ['packing-available-tanks'] }),
                queryClient.invalidateQueries({ queryKey: ['packing-available-components'] }),
                queryClient.invalidateQueries({ queryKey: ['storage-tanks'] }),
                queryClient.invalidateQueries({ queryKey: ['raw-material-stocks'] }),
                queryClient.invalidateQueries({ queryKey: ['packing-run', id] }),
            ]);
            notifySuccess(
                editing ? t('packing.packingUpdated', { number: run.packing_number }) : t('packing.packingCreated', { number: run.packing_number }),
                { title: t('common.success'), dismissLabel: t('common.dismiss') || 'Dismiss' },
            );
            navigate(editing ? `/packing/${run.id}` : '/packing');
        } catch (error: unknown) {
            const responseData = isAxiosError(error) ? error.response?.data : undefined;
            const message = responseData && typeof responseData === 'object'
                ? Object.values(responseData).flatMap((v) => Array.isArray(v) ? v : [v]).join(' ')
                : t('packing.packingFailed');
            toast.error(String(message));
        } finally {
            setSaving(false);
        }
    };

    return (
        <FormPage
            title={editing ? t('packing.editPacking') : t('packing.newPacking')}
            description={t('packing.subtitle')}
            icon={<PackageCheck />}
            backTo={editing && id ? `/packing/${id}` : '/packing'}
            maxWidth="screen"
        >
            {!editReady || (editing && runLoading) ? (
                <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : <form key={editing ? `edit-${id}-${editInitialized}` : 'create'} onSubmit={submit} className="space-y-6">
                <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="packing-tank">{t('packing.sourceTank')}</Label>
                        <Select value={tankId || 'none'} onValueChange={value => setTankId(value === 'none' ? '' : value)}>
                            <SelectTrigger id="packing-tank"><SelectValue placeholder={t('packing.selectSourceTank')} /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">{t('common.none', 'None')}</SelectItem>
                                {tanks.map((tank) => (
                                    <SelectItem key={tank.id} value={String(tank.id)}>
                                        {tank.name} · {amount(tank.available_kg)} kg
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {selectedTank && <p className="text-xs text-muted-foreground">{t('packing.availableKg', 'Available (kg)')}: {amount(selectedTank.available_kg)} kg</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="packing-kilograms">{t('packing.kgToPack', 'Quantity to pack (kg)')}{tankId && ' *'}</Label>
                        <Input
                            id="packing-kilograms"
                            type="number" min="0.0001" step="0.0001"
                            max={selectedTank?.available_kg}
                            value={quantityKilograms}
                            onChange={(e) => setQuantityKilograms(e.target.value)}
                            placeholder="100" required={!!tankId} disabled={!tankId}
                        />
                        <p className="text-xs text-muted-foreground">
                            {t('packing.bottleCount')}: {tankId && packingMath.wholeBottleCount ? amount(packingMath.bottleCount, 0) : '—'}
                            {volume > 0 ? ` · ${amount(volume * density)} kg/${t('packing.component_bottle').toLowerCase()}` : ''}
                        </p>
                    </div>
                </div>




                {tankId && <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <PackageCheck className="h-4 w-4" />
                            {t('packing.packagingMaterials')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {componentOptionsLoading ? (
                            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
                        ) : components.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('packing.noAvailableMaterials')}</p>
                        ) : (
                            <p className="text-xs text-muted-foreground">{t('packing.capacityAutoQuantityHint')}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{t('packing.optionalStockOutputs')}</p>
                        <div className="overflow-x-auto">
                            <div className="min-w-[1160px]">
                                <div className={`grid ${PACKING_TABLE_COLS} gap-x-3 gap-y-2 border-b bg-muted/20 px-3 py-2.5 text-xs font-semibold text-muted-foreground`}>
                                    <span>{t('packing.componentTypeShort')}</span>
                                    <span>{t('rawMaterials.category')}</span>
                                    <span>{t('packing.materialShort')}</span>
                                    <span>{t('packing.quantityUsedShort')}</span>
                                    <span className="text-right">{t('packing.costShort')}</span>
                                </div>
                                {componentRows.map(({ componentType, stock, quantity, suggestedQuantity, total }) => {
                                    const capIncludedInBottle = componentType === 'cap' && bottleIncludesCap;
                                    const options = components.filter((option) => {
                                        const typeMatches = componentType === 'bottle'
                                            ? ['bottle', 'bottle_with_cap'].includes(option.material_type)
                                            : componentType === 'label'
                                                ? LABEL_MATERIAL_TYPES.includes(option.material_type as typeof LABEL_MATERIAL_TYPES[number])
                                                : option.material_type === componentType;
                                        return typeMatches && (
                                            option.raw_material === Number(componentStocks[componentType])
                                            || !Object.entries(componentStocks).some(([type, sid]) => type !== componentType && sid === String(option.raw_material))
                                        );
                                    });
                                    const category = componentCategories[componentType] ?? (stock ? (stock.category == null ? 'uncategorized' : String(stock.category)) : 'all');
                                    return (
                                        <div key={componentType} className={`grid ${PACKING_TABLE_COLS} items-center gap-x-3 gap-y-1.5 border-b px-3 py-3 last:border-0`}>
                                            <Label htmlFor={`packing-component-${componentType}`} className="flex h-10 items-center overflow-hidden whitespace-nowrap text-xs sm:text-sm">
                                                {t(`packing.component_${componentType}`)}

                                            </Label>
                                            <PackingMaterialCategoryField
                                                id={`packing-category-${componentType}`}
                                                value={category}
                                                options={options}
                                                disabled={capIncludedInBottle || componentOptionsLoading}
                                                onChange={(value) => {
                                                    setComponentCategories(current => ({ ...current, [componentType]: value }));
                                                    setStock(componentType, '');
                                                }}
                                            />
                                            <div className="min-w-0 space-y-1">
                                                <CategoryMaterialPicker
                                                    id={`packing-component-${componentType}`}
                                                    value={componentStocks[componentType]}
                                                    options={options}
                                                    category={category}
                                                    placeholder={t('packing.selectMaterial')}
                                                    disabled={capIncludedInBottle || componentOptionsLoading}
                                                    clearable={OPTIONAL_COMPONENTS.includes(componentType) && !capIncludedInBottle}
                                                    onChange={(value) => setStock(componentType, value)}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Input
                                                    id={`packing-quantity-${componentType}`}
                                                    type="number" min="1" step="1"
                                                    max={stock?.available_quantity}
                                                    value={componentQuantities[componentType]}
                                                    onChange={(e) => { manualQuantities.current.add(componentType); setComponentQuantities((c) => ({ ...c, [componentType]: e.target.value })); }}
                                                    disabled={capIncludedInBottle || !componentStocks[componentType]}
                                                    placeholder={suggestedQuantity > 0 ? String(suggestedQuantity) : '0'}
                                                    aria-label={`${t('packing.quantityUsed')} ${t(`packing.component_${componentType}`)}`}
                                                    aria-invalid={quantity > 0 && !Number.isInteger(quantity)}
                                                    title={quantity > 0 && !Number.isInteger(quantity) ? t('packing.wholePiecesOnly') : suggestedQuantity > 0 ? t('packing.suggestedQuantity', { count: amount(suggestedQuantity, 0) }) : undefined}
                                                />
                                            </div>

                                            <div className="flex min-h-10 items-center justify-end whitespace-nowrap text-sm font-semibold tabular-nums">
                                                {stock && quantity > 0 ? `${resolveCurrencySymbol(1)}${formatPrice(total)}` : '—'}
                                            </div>
                                            {['bottle', 'carton', 'plastic'].includes(componentType) && <div className={`col-span-5 grid ${PACKING_TABLE_COLS} items-center gap-x-3 border-t border-dashed pt-3 mt-1`} role="group" aria-labelledby={`packing-stock-label-${componentType}`}>
                                                <span id={`packing-stock-label-${componentType}`} className="flex h-10 items-center text-xs leading-tight sm:text-sm" title={`${t(`packing.component_${componentType}`)} · ${t('stock.outputStockProduct')}`}>
                                                    {t('stock.outputStockProduct', 'Save in stock')}
                                                </span>
                                                <StockProductModeButton className="h-10 w-full min-w-0 px-2 text-xs" value={outputProducts[componentType] || {}} onChange={value => setOutputProduct(componentType, value)} disabled={componentType !== 'bottle' && !stock} />
                                                <div className="min-w-0">
                                                    <StockProductPicker
                                                        key={`output-${componentType}`}
                                                        hideModeButton
                                                        kind={componentType}
                                                        value={outputProducts[componentType] || {}}
                                                        onChange={value => setOutputProduct(componentType, value)}
                                                        disabled={componentType !== 'bottle' && !stock}
                                                    />
                                                </div>
                                                <StockProductQuantity choice={componentType === 'bottle' || stock ? outputProducts[componentType] || {} : {}} />
                                                <span aria-hidden="true" />
                                            </div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </CardContent>
                </Card>}

                <Card>
                    <CardHeader><CardTitle className="text-base">{t('stock.returnedForPacking')}</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="packing-return-source">{t('packing.returnedBottle', 'Returned bottle item')}</Label>
                                <Select value={returnId || 'none'} onValueChange={value => { setReturnId(value === 'none' ? '' : value); setReturnCount(''); setReturnCartonQuantity(''); }}>
                                    <SelectTrigger id="packing-return-source"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">{t('common.none', 'None')}</SelectItem>
                                        {returnedData?.results.map(row => <SelectItem key={row.id} value={String(row.id)}>{row.product_name} · {row.remaining_bottle_count} {t('stock.bottleUnits')}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="packing-return-count">{t('packing.returnedCount')}</Label>
                                <Input id="packing-return-count" type="number" min="1" step="1" max={selectedReturn?.remaining_bottle_count} value={returnCount} required={!!returnId} disabled={!returnId} onChange={event => {
                                    setReturnCount(event.target.value);
                                    const capacity = Number(selectedReturnCarton?.bottles_per_carton || 0);
                                    if (capacity > 0) setReturnCartonQuantity(Number(event.target.value) > 0 ? String(Math.ceil(Number(event.target.value) / capacity)) : '');
                                }} />
                                {selectedReturn && <p className="text-xs text-muted-foreground">{t('stock.remainingReturned')}: {selectedReturn.remaining_bottle_count}</p>}
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[140px_minmax(280px,1fr)_140px_180px]">
                            <div className="space-y-2">
                                <Label htmlFor="return-carton-category">{t('rawMaterials.category')}</Label>
                                <PackingMaterialCategoryField id="return-carton-category" value={returnCartonCategory} options={returnCartonOptions} disabled={!returnId || componentOptionsLoading} onChange={value => { setReturnCartonCategory(value); setReturnCartonId(''); setReturnCartonQuantity(''); }} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="return-carton">{t('packing.component_carton')}</Label>
                                <CategoryMaterialPicker id="return-carton" clearable value={returnCartonId} options={returnCartonOptions} category={returnCartonCategory} placeholder={t('packing.selectMaterial')} disabled={!returnId || componentOptionsLoading} onChange={value => {
                                    setReturnCartonId(value);
                                    const material = returnCartonOptions.find(row => String(row.raw_material) === value);
                                    const capacity = Number(material?.bottles_per_carton || 0);
                                    setReturnCartonQuantity(capacity > 0 && returnedCount > 0 ? String(Math.ceil(returnedCount / capacity)) : '');
                                }} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="return-carton-quantity">{t('packing.returnCartonQuantity', 'Carton quantity')}</Label>
                                <Input id="return-carton-quantity" type="number" min="1" step="1" max={selectedReturnCarton?.available_quantity} value={returnCartonQuantity} required={!!returnCartonId} disabled={!returnId || !returnCartonId} onChange={event => setReturnCartonQuantity(event.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>{t('packing.returnCartonCost', 'Carton cost')}</Label>
                                <p className="flex h-10 items-center font-semibold tabular-nums">{formatPrice(returnCartonCost)} AFN</p>
                                <p className="text-xs text-muted-foreground">{t('packing.costPerCarton')}: {formatPrice(returnCartonUnitCost)} AFN</p>
                            </div>
                        </div>
                        {returnOnly && <div className="space-y-2"><Label>{t('packing.component_bottle')} · {t('stock.outputStockProduct', 'Save in stock')}</Label><StockProductPicker key="return-bottle-output" kind="bottle" value={outputProducts.bottle || {}} onChange={value => setOutputProduct('bottle', value)} /></div>}
                        {returnCartonId && <div className="space-y-2"><Label>{t('packing.component_carton')} · {t('stock.outputStockProduct', 'Save in stock')}</Label><StockProductPicker key={returnOnly ? 'return-carton-output' : 'returned-carton-output'} kind="carton" value={outputProducts[returnOnly ? 'carton' : 'returned_carton'] || {}} onChange={value => setOutputProduct(returnOnly ? 'carton' : 'returned_carton', value)} /></div>}
                        {returnId && <div className="grid gap-3 rounded border bg-muted/20 p-3 text-sm sm:grid-cols-2">
                            <p>{t('packing.returnedBottleCost')}: <bdi>{formatPrice(returnedCost)} AFN</bdi></p>
                            <p className="font-semibold">{t('packing.returnSectionTotal', 'Returned packing total')}: <bdi>{formatPrice(returnedCost + returnCartonCost)} AFN</bdi></p>
                        </div>}
                    </CardContent>
                </Card>

                <PackingCostSummary
                    rate={reportingRate}
                    liquidCost={liquidCost}
                    packagingCost={packagingCost}
                    returnedCost={returnId ? returnedCost : undefined}
                    totalCost={totalCost}
                />
                {tankId && <PackingFullUnitCosts
                    title={separateReturn ? t('packing.newFullUnitCosts', 'New packing — full unit costs') : undefined}
                    rate={reportingRate}
                    costs={fullCosts}
                />}
                {(separateReturn || returnOnly) && <PackingFullUnitCosts
                    title={t('packing.returnedFullUnitCosts', 'Returned packing — full unit costs')}
                    rate={reportingRate}
                    costs={returnedFullCosts}
                />}
                <div className="space-y-2">
                    <Label htmlFor="packing-notes">{t('packing.notes')}</Label>
                    <Textarea id="packing-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                </div>
                <FormActions
                    mode={editing ? 'edit' : 'create'}
                    onCancel={() => navigate(editing && id ? `/packing/${id}` : '/packing')}
                    loading={saving || tanksLoading || componentsLoading || runLoading || returnsLoading}
                    submitLabel={editing ? t('packing.updatePacking') : t('packing.savePacking')}
                    loadingLabel={editing ? t('packing.updatingPacking') : t('packing.savingPacking')}
                />
            </form>}
        </FormPage>
    );
};

export default TankPackingForm;
