import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertOctagon } from 'lucide-react';
import { toast } from 'sonner';
import useFetchObjects from '@/api/useFetchObjects';
import { CategoryMaterialPicker, PackingMaterialCategoryField } from '@/components/raw-materials/CategoryMaterialPicker';
import { FormActions, type FormSubmitIntent } from '@/components/forms/FormActions';
import { FormPage } from '@/components/forms/FormPage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';
import { formatPrice } from '@/lib/formatNumber';
import type { PackingComponentStockOption } from '@/types/packing';
import type { DamagedComponentType, DamagedMaterialItem, DamagedMaterialRecord } from '@/types/damaged';

const DAMAGED_COMPONENTS: DamagedComponentType[] = ['label', 'plastic', 'carton'];
const LABEL_MATERIAL_TYPES = ['label', 'label_double'] as const;
const TABLE_COLS = 'grid-cols-[110px_130px_minmax(540px,1fr)_96px_110px]';

const emptyMaterials = (): Record<DamagedComponentType, string> => ({
  label: '',
  plastic: '',
  carton: '',
});

const emptyQuantities = (): Record<DamagedComponentType, string> => ({
  label: '',
  plastic: '',
  carton: '',
});

function matchesComponent(option: PackingComponentStockOption, componentType: DamagedComponentType) {
  if (componentType === 'label') {
    return LABEL_MATERIAL_TYPES.includes(option.material_type as typeof LABEL_MATERIAL_TYPES[number]);
  }
  return option.material_type === componentType;
}

function optionFromRecordItem(item: DamagedMaterialItem): PackingComponentStockOption {
  return {
    raw_material: Number(item.raw_material),
    raw_material_name: item.raw_material_name || `#${item.raw_material}`,
    material_type: (item.material_type || item.component_type) as PackingComponentStockOption['material_type'],
    unit: 'piece',
    available_quantity: '0',
    unit_cost_afn: String(item.unit_price_afn || 0),
    purchase_lots: [],
  };
}

export type DamagedSubmitPayload = {
  record_date: string;
  notes: string;
  items: Array<{
    component_type: DamagedComponentType;
    raw_material: number;
    quantity_pieces: string;
    unit_price_afn?: string;
  }>;
};

type Props = {
  mode: 'create' | 'edit';
  title: string;
  loading?: boolean;
  initialRecord?: DamagedMaterialRecord | null;
  onSubmit: (payload: DamagedSubmitPayload) => void;
  onCancel: () => void;
  showSaveAndCreateNew?: boolean;
  onIntent?: (intent: FormSubmitIntent) => void;
  onResetReady?: (reset: () => void) => void;
};

export function DamagedMaterialForm({
  mode,
  title,
  loading = false,
  initialRecord,
  onSubmit,
  onCancel,
  showSaveAndCreateNew,
  onIntent,
  onResetReady,
}: Props) {
  const { t } = useLanguage();
  const initializedRef = useRef<string | number | null>(null);
  const [recordDate, setRecordDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [materials, setMaterials] = useState(emptyMaterials);
  const [quantities, setQuantities] = useState(emptyQuantities);
  const [categories, setCategories] = useState<Partial<Record<DamagedComponentType, string>>>({});

  const includeIds = useMemo(
    () => (initialRecord?.items || []).map((item) => String(item.raw_material)),
    [initialRecord],
  );

  const { data: componentData, isLoading: componentsLoading, isFetching: componentsFetching } = useFetchObjects<{
    results: PackingComponentStockOption[];
  }>({
    queryKey: ['damaged-available-materials', includeIds.join(',')],
    endpoint: 'damaged-materials/available-materials',
    params: includeIds.length ? { include: includeIds.join(',') } : undefined,
    options: { staleTime: 0 },
  });

  const availableComponents = componentData?.results || [];
  const componentOptionsLoading = componentsLoading || componentsFetching;

  const components = useMemo(() => {
    const byId = new Map(availableComponents.map((row) => [Number(row.raw_material), row]));
    for (const item of initialRecord?.items || []) {
      const id = Number(item.raw_material);
      if (!byId.has(id)) byId.set(id, optionFromRecordItem(item));
    }
    return Array.from(byId.values()).filter((row) =>
      DAMAGED_COMPONENTS.some((type) => matchesComponent(row, type)),
    );
  }, [availableComponents, initialRecord]);

  const resetForm = useCallback(() => {
    initializedRef.current = null;
    setRecordDate(new Date().toISOString().slice(0, 10));
    setNotes('');
    setMaterials(emptyMaterials());
    setQuantities(emptyQuantities());
    setCategories({});
  }, []);

  useEffect(() => {
    onResetReady?.(resetForm);
  }, [onResetReady, resetForm]);

  useEffect(() => {
    if (!initialRecord || initializedRef.current === initialRecord.id) return;
    initializedRef.current = initialRecord.id;
    setRecordDate((initialRecord.record_date || '').slice(0, 10));
    setNotes(initialRecord.notes || '');
    const nextMaterials = emptyMaterials();
    const nextQuantities = emptyQuantities();
    const nextCategories: Partial<Record<DamagedComponentType, string>> = {};
    for (const item of initialRecord.items || []) {
      if (!DAMAGED_COMPONENTS.includes(item.component_type)) continue;
      nextMaterials[item.component_type] = String(item.raw_material);
      nextQuantities[item.component_type] = String(item.quantity_pieces ?? '');
      const option = components.find((row) => Number(row.raw_material) === Number(item.raw_material));
      if (option) {
        nextCategories[item.component_type] = option.category == null ? 'uncategorized' : String(option.category);
      }
    }
    setMaterials(nextMaterials);
    setQuantities(nextQuantities);
    setCategories(nextCategories);
  }, [initialRecord, components]);

  const rows = DAMAGED_COMPONENTS.map((componentType) => {
    const stock = components.find((row) => String(row.raw_material) === materials[componentType]);
    const quantity = Number(quantities[componentType]) || 0;
    const unitCost = Number(stock?.unit_cost_afn || 0);
    const total = quantity * unitCost;
    return { componentType, stock, quantity, unitCost, total };
  });

  const totalCost = rows.reduce((sum, row) => sum + row.total, 0);

  const setMaterial = (componentType: DamagedComponentType, value: string) => {
    setMaterials((current) => ({ ...current, [componentType]: value }));
    setQuantities((current) => ({ ...current, [componentType]: value ? current[componentType] : '' }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!recordDate) {
      toast.error(t('damaged.dateRequired', 'Date is required'));
      return;
    }
    const filled = rows.filter((row) => row.stock || quantities[row.componentType]);
    if (filled.length === 0) {
      toast.error(t('damaged.atLeastOneRow', 'Fill at least one packaging row'));
      return;
    }
    for (const row of filled) {
      if (!row.stock || !(row.quantity > 0) || !Number.isInteger(row.quantity)) {
        toast.error(
          t('damaged.rowIncomplete', 'Select material and a whole piece quantity for each filled row'),
        );
        return;
      }
    }
    onSubmit({
      record_date: recordDate,
      notes: notes.trim(),
      items: filled.map((row) => ({
        component_type: row.componentType,
        raw_material: Number(materials[row.componentType]),
        quantity_pieces: String(row.quantity),
        unit_price_afn: String(row.unitCost),
      })),
    });
  };

  return (
    <FormPage title={title} icon={<AlertOctagon />} backTo="/damaged" maxWidth="screen">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="damaged-record-date">{t('damaged.recordDate', 'Date')} *</Label>
            <DatePickerInput id="damaged-record-date" value={recordDate} onChange={setRecordDate} />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertOctagon className="h-4 w-4" />
              {t('damaged.packagingMaterials', 'Damaged packaging materials')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {componentOptionsLoading ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : components.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('damaged.noAvailableMaterials', 'No label, plastic, or carton materials with stock were found.')}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t(
                  'damaged.tableHint',
                  'Choose category and material, then enter damaged quantity in pieces. Unit cost comes from raw-material stock.',
                )}
              </p>
            )}

            <div className="overflow-x-auto">
              <div className="min-w-[1160px]">
                <div className={`grid ${TABLE_COLS} gap-x-3 gap-y-2 border-b bg-muted/20 px-3 py-2.5 text-xs font-semibold text-muted-foreground`}>
                  <span>{t('packing.componentTypeShort', 'Type')}</span>
                  <span>{t('rawMaterials.category', 'Category')}</span>
                  <span>{t('packing.materialShort', 'Material')}</span>
                  <span>{t('damaged.quantity', 'Quantity')}</span>
                  <span className="text-right">{t('packing.costShort', 'Cost')}</span>
                </div>

                {rows.map(({ componentType, stock, quantity, total }) => {
                  const options = components.filter((option) => {
                    if (!matchesComponent(option, componentType)) return false;
                    return (
                      option.raw_material === Number(materials[componentType])
                      || !Object.entries(materials).some(
                        ([type, sid]) => type !== componentType && sid === String(option.raw_material),
                      )
                    );
                  });
                  const category = categories[componentType]
                    ?? (stock ? (stock.category == null ? 'uncategorized' : String(stock.category)) : 'all');

                  return (
                    <div
                      key={componentType}
                      className={`grid ${TABLE_COLS} items-center gap-x-3 gap-y-1.5 border-b px-3 py-3 last:border-0`}
                    >
                      <Label
                        htmlFor={`damaged-component-${componentType}`}
                        className="flex h-10 items-center overflow-hidden whitespace-nowrap text-xs sm:text-sm"
                      >
                        {t(`packing.component_${componentType}`, componentType)}
                      </Label>
                      <PackingMaterialCategoryField
                        id={`damaged-category-${componentType}`}
                        value={category}
                        options={options}
                        disabled={componentOptionsLoading}
                        onChange={(value) => {
                          setCategories((current) => ({ ...current, [componentType]: value }));
                          setMaterial(componentType, '');
                        }}
                      />
                      <div className="min-w-0">
                        <CategoryMaterialPicker
                          id={`damaged-component-${componentType}`}
                          value={materials[componentType]}
                          options={options}
                          category={category}
                          placeholder={t('packing.selectMaterial', 'Select material')}
                          disabled={componentOptionsLoading}
                          hideAvailable
                          fieldSuffix={`${t('damaged.unitFixed', 'Unit')}: ${t('damaged.piece', 'piece')}`}
                          onChange={(value) => setMaterial(componentType, value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Input
                          id={`damaged-quantity-${componentType}`}
                          type="number"
                          min="1"
                          step="1"
                          value={quantities[componentType]}
                          onChange={(event) =>
                            setQuantities((current) => ({
                              ...current,
                              [componentType]: event.target.value,
                            }))
                          }
                          disabled={!materials[componentType]}
                          placeholder="0"
                          aria-label={`${t('damaged.quantity', 'Quantity')} ${t(`packing.component_${componentType}`, componentType)}`}
                          aria-invalid={quantity > 0 && !Number.isInteger(quantity)}
                        />
                      </div>
                      <div className="flex min-h-10 items-center justify-end whitespace-nowrap text-sm font-semibold tabular-nums">
                        {stock && quantity > 0
                          ? `${resolveCurrencySymbol(1)}${formatPrice(total)}`
                          : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {t('damaged.totalCost', 'Total cost')}
              </span>
              <span className="font-semibold tabular-nums">
                {resolveCurrencySymbol(1)}{formatPrice(totalCost)}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <Label htmlFor="damaged-notes">{t('damaged.notes', 'Notes')}</Label>
          <Textarea
            id="damaged-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            placeholder={t('damaged.notesPlaceholder', 'Optional notes about the damage')}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {t(
            'damaged.noStockImpactHint',
            'Saving here only records damaged packaging. It does not change raw-material or finished stock quantities.',
          )}
        </p>

        <FormActions
          mode={mode}
          loading={loading || componentOptionsLoading}
          onCancel={onCancel}
          showSaveAndCreateNew={showSaveAndCreateNew}
          onIntent={onIntent}
          submitLabel={mode === 'edit' ? t('damaged.edit', 'Edit damaged') : t('damaged.add', 'Add damaged')}
        />
      </form>
    </FormPage>
  );
}
