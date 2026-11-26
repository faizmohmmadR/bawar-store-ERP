import { useEffect, useRef } from 'react';
import { UseFormReturn, useWatch } from 'react-hook-form';
import type { ProductFormValues } from '@/lib/productFormSchemas';

type UomOption = { value: string; label: string };

/**
 * Keep the base packaging row aligned with product barcode + base UOM:
 * - Product barcode → base unit barcode
 * - Base UOM name → base unit name (Piece, Gram, …)
 *
 * Does not overwrite a base barcode/name the user already customized
 * away from the last auto-synced value.
 */
export function useSyncProductBasePackaging(
  form: UseFormReturn<ProductFormValues>,
  uomOptions: UomOption[],
) {
  const barcode = useWatch({ control: form.control, name: 'barcode' }) ?? '';
  const baseUom = useWatch({ control: form.control, name: 'base_uom' }) ?? '';

  const lastSyncedBarcode = useRef<string | null>(null);
  const lastSyncedUomName = useRef<string | null>(null);

  useEffect(() => {
    const packagings = form.getValues('packagings') || [];
    const baseIndex = packagings.findIndex((row) => row.is_base);
    if (baseIndex < 0) return;

    const baseRow = packagings[baseIndex];
    const nextBarcode = (barcode || '').trim();
    const currentBaseBarcode = (baseRow.barcode || '').trim();
    const canWriteBarcode =
      !currentBaseBarcode
      || currentBaseBarcode === (lastSyncedBarcode.current || '').trim()
      || currentBaseBarcode === nextBarcode;

    if (canWriteBarcode && currentBaseBarcode !== nextBarcode) {
      form.setValue(`packagings.${baseIndex}.barcode`, nextBarcode, {
        shouldDirty: true,
      });
    }
    if (canWriteBarcode || currentBaseBarcode === nextBarcode) {
      lastSyncedBarcode.current = nextBarcode;
    }

    const uomLabel = uomOptions.find((o) => o.value === String(baseUom))?.label || '';
    const unitName = uomLabel.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!unitName) return;

    const currentName = (baseRow.name || '').trim();
    const canWriteName =
      !currentName
      || currentName === 'Base'
      || currentName === (lastSyncedUomName.current || '')
      || currentName === unitName;

    if (canWriteName && currentName !== unitName) {
      form.setValue(`packagings.${baseIndex}.name`, unitName, { shouldDirty: true });
    }
    if (canWriteName || currentName === unitName) {
      lastSyncedUomName.current = unitName;
    }
  }, [barcode, baseUom, form, uomOptions]);
}
