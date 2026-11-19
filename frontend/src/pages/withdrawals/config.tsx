import { useMemo } from 'react';
import { type CrudConfig } from '@/pages/shared/CrudPages';
import { useLanguage } from '@/contexts/LanguageContext';
import { ListDate } from '@/components/display/ListDate';

export function useWithdrawalConfig(): CrudConfig {
  const { t } = useLanguage();
  return useMemo(() => {
    const config: CrudConfig = {
      endpoint: 'withdrawals',
      queryKey: 'withdrawals',
      basePath: '/withdrawals',
      title: t('withdrawals.title'),
      singular: t('withdrawals.singular'),
      subtitle: t('withdrawals.manage'),
      searchPlaceholder: t('withdrawals.search'),
      emptyTitle: t('withdrawals.noFound'),
      emptyDescription: t('withdrawals.addFirst'),
      display: (row) =>
        row.reference_number ||
        (row.gl_account_details
          ? `${row.gl_account_details.code} ${row.gl_account_details.name}`
          : null) ||
        row.payment_method_label ||
        t(`withdrawals.paymentMethods.${row.payment_method}`, row.payment_method),
      fields: [
        {
          name: 'gl_account',
          label: t('withdrawals.fromAccount'),
          type: 'autocomplete',
          endpoint: 'gl-accounts/',
          required: true,
        },
        { name: 'amount', label: t('withdrawals.amount'), type: 'number', required: true },
        { name: 'currency', label: t('withdrawals.currency'), type: 'currency', required: true },
        {
          name: 'withdrawal_date',
          label: t('withdrawals.withdrawalDate'),
          type: 'datetime-local',
          required: true,
        },
        { name: 'reference_number', label: t('withdrawals.referenceNumber') },
        { name: 'description', label: t('withdrawals.description'), type: 'textarea' },
      ],
      columns: [
        {
          key: 'gl_account_details',
          title: t('withdrawals.fromAccount'),
          width: '12rem',
          className: 'max-w-[12rem]',
          render: (value, row) => {
            const label = value
              ? `${value.code} ${value.name}${
                  value.currency_details?.code ? ` · ${value.currency_details.code}` : ''
                }`
              : row.payment_method_label || '—';
            return <span className="block truncate" title={label}>{label}</span>;
          },
        },
        {
          key: 'amount',
          title: t('withdrawals.amount'),
          width: '7rem',
          className: 'whitespace-nowrap tabular-nums',
          render: (value, row) => `${value} ${row.currency_details?.code || ''}`,
        },
        {
          key: 'currency_details',
          title: t('withdrawals.currency'),
          width: '5rem',
          className: 'whitespace-nowrap',
          render: (value) => value?.code || '—',
        },
        {
          key: 'withdrawal_date',
          title: t('withdrawals.date'),
          width: '7rem',
          className: 'whitespace-nowrap',
          render: (value) => (value ? <ListDate value={value} /> : '—'),
        },
        {
          key: 'reference_number',
          title: t('withdrawals.reference'),
          width: '8rem',
          className: 'max-w-[8rem]',
          render: (value) => <span className="block truncate" title={value || '—'}>{value || '—'}</span>,
        },
      ],
    };
    return config;
  }, [t]);
}
