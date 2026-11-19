import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FileBarChart, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type CrudConfig, type CrudField } from '@/pages/shared/CrudPages';
import { useLanguage } from '@/contexts/LanguageContext';
import { ListDate } from '@/components/display/ListDate';
import { toCurrencyFilterOptions } from '@/lib/currencyChoices';
import { printEquipmentSerialLabel, printEquipmentSerialLabels } from '@/pages/equipment/printEquipmentLabel';
import {
  equipmentApplyStatusRules,
  equipmentFieldClearValue,
  equipmentFieldDisabled,
  equipmentFieldVisible,
} from '@/pages/equipment/equipmentFormRules';

const equipmentFieldRules = (name: string): Pick<CrudField, 'visibleWhen' | 'disabledWhen' | 'clearValue'> => ({
  visibleWhen: (values) => equipmentFieldVisible(name, values),
  disabledWhen: (values) => equipmentFieldDisabled(name, values),
  clearValue: equipmentFieldClearValue(name),
});

export function useEquipmentConfig(): CrudConfig {
  const { t } = useLanguage();
  const currencyFilterOptions = useMemo(() => toCurrencyFilterOptions(), []);
  const p = (key: string, fallback: string) => t(`equipment.placeholders.${key}`, fallback);
  const d = (key: string, fallback: string) => t(`equipment.descriptions.${key}`, fallback);

  return useMemo(() => {
    const statusOptions = [
      { value: 'in_use', label: t('equipment.statusInUse', 'In use') },
      { value: 'in_storage', label: t('equipment.statusInStorage', 'In storage') },
      { value: 'under_repair', label: t('equipment.statusUnderRepair', 'Under repair') },
      { value: 'disposed', label: t('equipment.statusDisposed', 'Disposed') },
    ];

    const categoryOptions = [
      { value: 'furniture', label: t('equipment.categories.furniture', 'Furniture') },
      { value: 'computers', label: t('equipment.categories.computers', 'Computers') },
      { value: 'peripherals', label: t('equipment.categories.peripherals', 'Peripherals') },
      { value: 'networking', label: t('equipment.categories.networking', 'Networking') },
      { value: 'electronics', label: t('equipment.categories.electronics', 'Electronics') },
      { value: 'communication', label: t('equipment.categories.communication', 'Communication') },
      { value: 'appliances', label: t('equipment.categories.appliances', 'Appliances') },
      { value: 'security', label: t('equipment.categories.security', 'Security') },
      { value: 'storage', label: t('equipment.categories.storage', 'Storage') },
      { value: 'lighting', label: t('equipment.categories.lighting', 'Lighting') },
      { value: 'vehicle', label: t('equipment.categories.vehicle', 'Vehicle') },
      { value: 'machine', label: t('equipment.categories.machine', 'Machine') },
      { value: 'other', label: t('equipment.categories.other', 'Other') },
    ];

    const acquisitionOptions = [
      {
        value: 'new_purchase',
        label: t('equipment.acquisitionNew', 'New purchase (asset)'),
        description: t(
          'equipment.acquisitionNewHint',
          'Records as a fixed asset and posts the payment.',
        ),
      },
      {
        value: 'opening',
        label: t('equipment.acquisitionOpening', 'Already owned'),
        description: t(
          'equipment.acquisitionOpeningHint',
          'Opening balance only — no cash payment.',
        ),
      },
      {
        value: 'expense',
        label: t('equipment.acquisitionExpense', 'Record as expense'),
        description: t(
          'equipment.acquisitionExpenseHint',
          'Small items that go to expenses, not fixed assets.',
        ),
      },
    ];

    const statusLabel = (value?: string) =>
      statusOptions.find((opt) => opt.value === value)?.label || value || '—';

    const categoryLabel = (value?: string) =>
      categoryOptions.find((opt) => opt.value === value)?.label || value || '—';

    const acquisitionLabel = (value?: string) =>
      acquisitionOptions.find((opt) => opt.value === value)?.label || value || '—';

    const printLabel = (row: any) => {
      printEquipmentSerialLabel({
        serial_number: row.serial_number,
        name: row.name,
      });
    };

    const printLabels = (rows: any[]) => {
      printEquipmentSerialLabels(
        rows.map((row) => ({
          serial_number: row.serial_number,
          name: row.name,
        })),
      );
    };

    return {
      endpoint: 'equipment',
      queryKey: 'equipment',
      basePath: '/equipment',
      title: t('equipment.title', 'Equipment'),
      singular: t('equipment.singular', 'Equipment'),
      syncFormWatchFields: ['acquisition_type', 'status'],
      syncFormValues: equipmentApplyStatusRules,
      formSections: [
        {
          id: 'identity',
          title: t('equipment.sections.identity', 'Item details'),
          description: t(
            'equipment.sections.identityHint',
            'What the equipment is — name and category.',
          ),
        },
        {
          id: 'acquisition',
          title: t('equipment.sections.acquisition', 'Acquisition & cost'),
          description: t(
            'equipment.sections.acquisitionHint',
            'How it was obtained, price, and accounting details.',
          ),
        },
        {
          id: 'status',
          title: t('equipment.sections.status', 'Status & location'),
          description: t(
            'equipment.sections.statusHint',
            'Where it is now and who uses it.',
          ),
        },
        {
          id: 'notes',
          title: t('equipment.sections.notes', 'Notes'),
        },
      ],
      searchPlaceholder: t('equipment.search', 'Search equipment...'),
      emptyTitle: t('equipment.noItems', 'No equipment yet'),
      emptyDescription: t(
        'equipment.addFirst',
        'Add chairs, computers, desks, and other branch equipment.',
      ),
      display: (row) => row.name,
      extraHeaderActions: (
        <Button variant="outline" asChild>
          <Link to="/equipment/report">
            <FileBarChart className="h-4 w-4" />
            {t('equipment.reportTitle', 'Report')}
          </Link>
        </Button>
      ),
      extraRowActions: [
        {
          key: 'print-serial',
          label: t('equipment.printSerial', 'Print serial'),
          icon: <Printer className="h-4 w-4" />,
          onClick: printLabel,
          show: (row) => Boolean(row.serial_number),
        },
      ],
      bulkActions: [
        {
          key: 'print-labels',
          label: t('equipment.printLabels', 'Print labels'),
          icon: <Printer className="h-4 w-4" />,
          onClick: printLabels,
        },
      ],
      filters: [
        {
          key: 'category',
          label: t('equipment.category', 'Category'),
          placeholder: t('equipment.filterByCategory', 'Filter by category'),
          options: categoryOptions,
        },
        {
          key: 'status',
          label: t('equipment.status', 'Status'),
          placeholder: t('equipment.filterByStatus', 'Filter by status'),
          options: statusOptions,
        },
        {
          key: 'acquisition_type',
          label: t('equipment.acquisitionType', 'How acquired'),
          placeholder: t('equipment.filterByAcquisition', 'Filter by type'),
          options: acquisitionOptions,
        },
        {
          key: 'is_active',
          label: t('equipment.activeStatus', 'Active'),
          placeholder: t('equipment.filterByActive', 'Filter by active'),
          options: [
            { value: 'true', label: t('equipment.active', 'Active') },
            { value: 'false', label: t('equipment.inactive', 'Inactive') },
          ],
        },
        {
          key: 'currency',
          label: t('equipment.currency', 'Currency'),
          placeholder: t('equipment.filterByCurrency', 'Filter by currency'),
          options: currencyFilterOptions,
        },
      ],
      fields: [
        {
          name: 'name',
          section: 'identity',
          label: t('equipment.name', 'Name'),
          required: true,
          placeholder: p('name', 'e.g. Dell Latitude laptop'),
        },
        {
          name: 'category',
          section: 'identity',
          label: t('equipment.category', 'Category'),
          type: 'select',
          required: true,
          options: categoryOptions,
          placeholder: p('category', 'Select category'),
        },
        {
          name: 'serial_number',
          section: 'identity',
          label: t('equipment.serialNumber', 'Serial number'),
          readOnly: true,
          editOnly: true,
          placeholder: p('serial', 'Auto-generated on save'),
        },
        {
          name: 'acquisition_type',
          section: 'acquisition',
          label: t('equipment.acquisitionType', 'How acquired'),
          type: 'select',
          defaultValue: 'new_purchase',
          options: acquisitionOptions,
          placeholder: p('acquisitionType', 'Select how acquired'),
        },
        {
          name: 'acquired_date',
          section: 'acquisition',
          label: t('equipment.acquiredDate', 'Date'),
          type: 'date',
          required: true,
          defaultValue: new Date().toISOString().slice(0, 10),
          placeholder: p('acquiredDate', 'Select date'),
        },
        {
          name: 'quantity',
          section: 'acquisition',
          label: t('equipment.quantity', 'Quantity'),
          type: 'number',
          required: true,
          defaultValue: '1',
          placeholder: p('quantity', 'Usually 1'),
        },
        {
          name: 'unit',
          section: 'acquisition',
          label: t('equipment.unit', 'Unit'),
          placeholder: p('unit', 'e.g. pcs, set'),
        },
        {
          name: 'unit_cost',
          section: 'acquisition',
          label: t('equipment.unitCost', 'Purchase price'),
          type: 'number',
          placeholder: p('unitCost', 'e.g. 25000 (price for one item)'),
        },
        {
          name: 'currency',
          section: 'acquisition',
          label: t('equipment.currency', 'Currency'),
          type: 'currency',
          required: true,
          placeholder: p('currency', 'AFN, USD, etc.'),
        },
        {
          name: 'payment_method',
          section: 'acquisition',
          label: t('equipment.paymentMethod', 'Paid from'),
          type: 'select',
          defaultValue: 'cash',
          options: [
            { value: 'cash', label: t('equipment.paymentCash', 'Cash') },
            { value: 'bank', label: t('equipment.paymentBank', 'Bank') },
            { value: 'sarafi', label: t('equipment.paymentSarafi', 'Sarafi') },
          ],
          placeholder: p('paymentMethod', 'Select payment source'),
          ...equipmentFieldRules('payment_method'),
        },
        {
          name: 'accumulated_depreciation',
          section: 'acquisition',
          label: t('equipment.accumulatedDepreciation', 'Already depreciated amount'),
          type: 'number',
          defaultValue: '0',
          placeholder: p('accumulatedDepreciation', 'e.g. 40000'),
          description: d(
            'accumulatedDepreciation',
            'For already owned items only. Enter 0 for new purchases. Must be less than the purchase price.',
          ),
          ...equipmentFieldRules('accumulated_depreciation'),
        },
        {
          name: 'status',
          section: 'status',
          label: t('equipment.status', 'Status'),
          type: 'select',
          defaultValue: 'in_use',
          options: statusOptions,
          placeholder: p('status', 'Select status'),
        },
        {
          name: 'location',
          section: 'status',
          label: t('equipment.location', 'Location'),
          placeholder: p('location', 'e.g. Main office, Room 2, Ghor'),
        },
        {
          name: 'condition',
          section: 'status',
          label: t('equipment.condition', 'Condition'),
          placeholder: p('condition', 'e.g. Good, Fair, Needs repair'),
          ...equipmentFieldRules('condition'),
        },
        {
          name: 'assigned_to',
          section: 'status',
          label: t('equipment.assignedTo', 'Assigned to'),
          type: 'autocomplete',
          endpoint: 'employees',
          getOptionLabel: (item) => item.full_name || item.name || `#${item.id}`,
          placeholder: p('assignedTo', 'Employee using this item (optional)'),
          ...equipmentFieldRules('assigned_to'),
        },
        {
          name: 'is_active',
          section: 'status',
          label: t('equipment.active', 'Active'),
          type: 'boolean',
          defaultValue: true,
          ...equipmentFieldRules('is_active'),
        },
        {
          name: 'notes',
          section: 'notes',
          label: t('equipment.notes', 'Notes'),
          type: 'textarea',
          placeholder: p('notes', 'Extra details or internal notes (optional)'),
        },
      ],
      columns: [
        {
          key: 'serial_number',
          title: t('equipment.serialNumber', 'Serial number'),
          width: '7.5rem',
          className: 'max-w-[7.5rem] whitespace-nowrap',
          render: (value) => (
            <span className="block truncate font-mono text-xs font-semibold tracking-wide" title={value || '—'}>{value || '—'}</span>
          ),
        },
        {
          key: 'name',
          title: t('equipment.name', 'Name'),
          width: '11rem',
          className: 'max-w-[11rem]',
          render: (value, row) => (
            <span className="inline-flex max-w-full flex-wrap items-center gap-2 font-medium">
              <span className="truncate" title={value || '—'}>{value}</span>
              {row.acquisition_type === 'opening' ? (
                <Badge variant="outline">{t('equipment.openingBalanceShort', 'Opening')}</Badge>
              ) : null}
              {row.acquisition_type === 'expense' ? (
                <Badge variant="secondary">{t('equipment.expenseShort', 'Expense')}</Badge>
              ) : null}
            </span>
          ),
        },
        {
          key: 'category',
          title: t('equipment.category', 'Category'),
          width: '7rem',
          className: 'max-w-[7rem]',
          render: (value) => {
            const label = categoryLabel(value);
            return <span className="block truncate" title={label}>{label}</span>;
          },
        },
        {
          key: 'quantity',
          title: t('equipment.quantity', 'Quantity'),
          width: '5.5rem',
          className: 'whitespace-nowrap',
          render: (value, row) => `${value} ${row.unit || ''}`.trim(),
        },
        {
          key: 'unit_cost',
          title: t('equipment.unitCost', 'Price'),
          width: '7rem',
          className: 'whitespace-nowrap',
          render: (value, row) =>
            `${Number(value || 0).toFixed(2)} ${row.currency_details?.code || ''}`.trim(),
        },
        {
          key: 'acquisition_type',
          title: t('equipment.acquisitionType', 'How acquired'),
          width: '7rem',
          className: 'max-w-[7rem]',
          render: (value) => {
            const label = acquisitionLabel(value);
            return <span className="block truncate" title={label}>{label}</span>;
          },
        },
        {
          key: 'status',
          title: t('equipment.status', 'Status'),
          width: '6rem',
          className: 'max-w-[6rem]',
          render: (value) => {
            const label = statusLabel(value);
            return <Badge variant="outline" className="max-w-full truncate" title={label}>{label}</Badge>;
          },
        },
        {
          key: 'assigned_to_details',
          title: t('equipment.assignedTo', 'Assigned to'),
          width: '8rem',
          className: 'max-w-[8rem]',
          render: (value) => {
            const name = value?.full_name || '—';
            return <span className="block truncate" title={name}>{name}</span>;
          },
        },
        {
          key: 'location',
          title: t('equipment.location', 'Location'),
          width: '8rem',
          className: 'max-w-[8rem]',
          render: (value) => <span className="block truncate" title={value || '—'}>{value || '—'}</span>,
        },
        {
          key: 'acquired_date',
          title: t('equipment.acquiredDate', 'Date'),
          width: '7rem',
          className: 'whitespace-nowrap',
          render: (value) => (value ? <ListDate value={value} /> : '—'),
        },
        {
          key: 'is_active',
          title: t('equipment.activeStatus', 'Active'),
          width: '5rem',
          className: 'max-w-[5rem]',
          render: (value) => (
            <Badge variant={value ? 'default' : 'secondary'}>
              {value ? t('equipment.active', 'Active') : t('equipment.inactive', 'Inactive')}
            </Badge>
          ),
        },
      ],
    };
  }, [currencyFilterOptions, t]);
}
