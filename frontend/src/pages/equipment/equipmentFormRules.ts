export type EquipmentFormValues = {
  acquisition_type?: string;
  status?: string;
  payment_method?: string;
  accumulated_depreciation?: string | number;
  assigned_to?: string | number;
  is_active?: boolean;
  [key: string]: unknown;
};

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

export const equipmentFormDefaults = {
  acquisition_type: 'new_purchase',
  status: 'in_use',
  payment_method: 'cash',
  accumulated_depreciation: '0',
  quantity: '1',
  is_active: true,
  acquired_date: todayIsoDate(),
};

/** Whether a field should be shown based on How acquired + Status. */
export function equipmentFieldVisible(name: string, values: EquipmentFormValues): boolean {
  const acq = values.acquisition_type || equipmentFormDefaults.acquisition_type;
  const status = values.status || equipmentFormDefaults.status;

  switch (name) {
    case 'payment_method':
      return acq === 'new_purchase' || acq === 'expense';
    case 'accumulated_depreciation':
      return acq === 'opening';
    case 'assigned_to':
      return status === 'in_use';
    case 'condition':
      return status === 'under_repair' || status === 'in_use';
    default:
      return true;
  }
}

/** Whether a field should be read-only/disabled. */
export function equipmentFieldDisabled(name: string, values: EquipmentFormValues): boolean {
  const status = values.status || equipmentFormDefaults.status;
  if (name === 'is_active') return status === 'disposed';
  return false;
}

/** Value to reset when a field is hidden (not submitted). */
export function equipmentFieldClearValue(name: string): string | boolean {
  switch (name) {
    case 'payment_method':
      return '';
    case 'accumulated_depreciation':
      return '0';
    case 'assigned_to':
      return '';
    default:
      return '';
  }
}

/** Side effects when acquisition type or status changes. */
export function equipmentApplyStatusRules(
  values: EquipmentFormValues,
  setValue: (name: keyof EquipmentFormValues & string, value: unknown) => void,
) {
  if (values.status === 'disposed' && values.is_active !== false) {
    setValue('is_active', false);
  }

  if (values.status === 'in_storage' && values.assigned_to) {
    setValue('assigned_to', '');
  }

  const acq = values.acquisition_type || equipmentFormDefaults.acquisition_type;
  if (acq !== 'opening' && values.accumulated_depreciation && Number(values.accumulated_depreciation) !== 0) {
    setValue('accumulated_depreciation', '0');
  }

  if (acq === 'opening' && values.payment_method) {
    setValue('payment_method', '');
  }

  if ((acq === 'new_purchase' || acq === 'expense') && !values.payment_method) {
    setValue('payment_method', 'cash');
  }
}
