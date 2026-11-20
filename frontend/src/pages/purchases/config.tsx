import { useMemo } from 'react';
import { type CrudConfig } from '@/pages/shared/CrudPages';
import { useLanguage } from '@/contexts/LanguageContext';
import { ListDate } from '@/components/display/ListDate';
import { Badge } from '@/components/ui/badge';

const STATUS_OPTIONS = [
  { value: 'draft', labelKey: 'Draft' },
  { value: 'pending', labelKey: 'Pending' },
  { value: 'received', labelKey: 'Received' },
  { value: 'cancelled', labelKey: 'Cancelled' },
];

export function usePurchaseConfig(): CrudConfig {
  const { t } = useLanguage();
  return useMemo(() => {
    const statusLabel = (value?: string) =>
      STATUS_OPTIONS.find((o) => o.value === value)?.labelKey || value || '—';

    const config: CrudConfig = {
      endpoint: 'purchases',
      queryKey: 'purchases',
      basePath: '/purchases',
      title: t('core.navigation.purchases', 'Purchases'),
      singular: t('core.navigation.purchases', 'Purchase'),
      subtitle: t('purchases.manage', 'Vendor product purchases'),
      searchPlaceholder: t('purchases.search', 'Search purchases…'),
      emptyTitle: t('purchases.noFound', 'No purchases found'),
      emptyDescription: t('purchases.addFirst', 'Create a purchase to record stock received from vendors.'),
      display: (row) => row.invoice_number || row.bill_number || `#${row.id}`,
      fields: [
        {
          name: 'vendor',
          label: t('vendors.vendor', 'Vendor'),
          type: 'autocomplete',
          endpoint: 'vendors',
          required: true,
        },
        {
          name: 'warehouse',
          label: t('purchases.warehouse', 'Warehouse'),
          type: 'autocomplete',
          endpoint: 'warehouses',
          required: true,
        },
        {
          name: 'purchase_date',
          label: t('purchases.purchaseDate', 'Purchase date'),
          type: 'datetime-local',
          required: true,
        },
        {
          name: 'status',
          label: t('purchases.status', 'Status'),
          type: 'select',
          required: true,
          defaultValue: 'draft',
          options: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.labelKey })),
        },
        {
          name: 'currency',
          label: t('common.currency', 'Currency'),
          type: 'currency',
          required: true,
        },
        {
          name: 'invoice_number',
          label: t('purchases.invoiceNumber', 'Invoice #'),
          readOnly: true,
          editOnly: true,
        },
        {
          name: 'bill_number',
          label: t('purchases.billNumber', 'Bill #'),
        },
        {
          name: 'notes',
          label: t('common.notes', 'Notes'),
          type: 'textarea',
        },
      ],
      columns: [
        {
          key: 'invoice_number',
          title: t('purchases.invoiceNumber', 'Invoice #'),
          width: '8rem',
          className: 'whitespace-nowrap font-mono text-sm',
          render: (value) => value || '—',
        },
        {
          key: 'vendor_details',
          title: t('vendors.vendor', 'Vendor'),
          width: '10rem',
          className: 'max-w-[10rem]',
          render: (value) => (
            <span className="block truncate" title={value?.name || '—'}>
              {value?.name || '—'}
            </span>
          ),
        },
        {
          key: 'warehouse_details',
          title: t('purchases.warehouse', 'Warehouse'),
          width: '8rem',
          className: 'max-w-[8rem]',
          render: (value) => (
            <span className="block truncate" title={value?.name || '—'}>
              {value?.name || '—'}
            </span>
          ),
        },
        {
          key: 'purchase_date',
          title: t('purchases.purchaseDate', 'Date'),
          width: '7rem',
          className: 'whitespace-nowrap',
          render: (value) => (value ? <ListDate value={value} /> : '—'),
        },
        {
          key: 'status',
          title: t('purchases.status', 'Status'),
          width: '6rem',
          render: (value) => <Badge variant="outline">{statusLabel(value)}</Badge>,
        },
        {
          key: 'total_amount',
          title: t('purchases.total', 'Total'),
          width: '7rem',
          className: 'tabular-nums whitespace-nowrap',
          render: (value, row) => `${value ?? 0} ${row.currency_details?.code || ''}`,
        },
      ],
    };
    return config;
  }, [t]);
}