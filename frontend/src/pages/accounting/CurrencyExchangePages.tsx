import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { CrudDetails, CrudForm, CrudList, type CrudConfig } from '@/pages/shared/CrudPages';
import { useLanguage } from '@/contexts/LanguageContext';
import { ListDate } from '@/components/display/ListDate';

function useCurrencyExchangeConfig() {
  const { t } = useLanguage();
  return useMemo(() => {
    const methodLabel = (value: string) => {
      if (value === 'bank') return t('currencyExchange.methodBank');
      if (value === 'sarafi') return t('currencyExchange.methodSarafi');
      return t('currencyExchange.methodCash');
    };
    const statusLabel = (value: string) => {
      if (value === 'draft') return t('currencyExchange.statusDraft');
      if (value === 'reversed') return t('currencyExchange.statusReversed');
      return t('currencyExchange.statusPosted');
    };

    const config: CrudConfig = {
      endpoint: 'currency-exchanges',
      queryKey: 'currency-exchanges',
      basePath: '/accounting/currency-exchanges',
      title: t('currencyExchange.title'),
      singular: t('currencyExchange.singular'),
      subtitle: t('currencyExchange.manage'),
      searchPlaceholder: t('currencyExchange.search'),
      emptyTitle: t('currencyExchange.noFound'),
      emptyDescription: t('currencyExchange.addFirst'),
      display: (row) =>
        row.reference_number
        || `${row.from_amount} ${row.from_currency_details?.code || ''} → ${row.to_amount} ${row.to_currency_details?.code || ''}`,
      fields: [
        { name: 'from_currency', label: t('currencyExchange.fromCurrency'), type: 'currency', required: true },
        { name: 'from_amount', label: t('currencyExchange.fromAmount'), type: 'number', required: true },
        {
          name: 'from_method',
          label: t('currencyExchange.fromMethod'),
          type: 'select',
          required: true,
          defaultValue: 'cash',
          options: [
            { value: 'cash', label: t('currencyExchange.methodCash') },
            { value: 'bank', label: t('currencyExchange.methodBank') },
            { value: 'sarafi', label: t('currencyExchange.methodSarafi') },
          ],
        },
        { name: 'to_currency', label: t('currencyExchange.toCurrency'), type: 'currency', required: true },
        { name: 'to_amount', label: t('currencyExchange.toAmount'), type: 'number', required: true },
        {
          name: 'to_method',
          label: t('currencyExchange.toMethod'),
          type: 'select',
          required: true,
          defaultValue: 'cash',
          options: [
            { value: 'cash', label: t('currencyExchange.methodCash') },
            { value: 'bank', label: t('currencyExchange.methodBank') },
            { value: 'sarafi', label: t('currencyExchange.methodSarafi') },
          ],
        },
        { name: 'rate', label: t('currencyExchange.rate'), type: 'number' },
        { name: 'exchange_date', label: t('currencyExchange.exchangeDate'), type: 'datetime-local', required: true },
        { name: 'reference_number', label: t('currencyExchange.reference') },
        { name: 'notes', label: t('currencyExchange.notes'), type: 'textarea' },
        {
          name: 'status',
          label: t('currencyExchange.status'),
          type: 'select',
          options: [
            { value: 'posted', label: t('currencyExchange.statusPosted') },
            { value: 'draft', label: t('currencyExchange.statusDraft') },
            { value: 'reversed', label: t('currencyExchange.statusReversed') },
          ],
        },
      ],
      columns: [
        {
          key: 'from_amount',
          title: t('currencyExchange.fromAmount'),
          render: (value, row) => `${value} ${row.from_currency_details?.code || ''}`,
        },
        {
          key: 'to_amount',
          title: t('currencyExchange.toAmount'),
          render: (value, row) => `${value} ${row.to_currency_details?.code || ''}`,
        },
        { key: 'rate', title: t('currencyExchange.rate'), render: (value) => value || '—' },
        {
          key: 'from_method',
          title: t('currencyExchange.fromMethod'),
          render: (value) => <Badge variant="outline">{methodLabel(value)}</Badge>,
        },
        {
          key: 'status',
          title: t('currencyExchange.status'),
          render: (value) => <Badge variant={value === 'posted' ? 'default' : 'secondary'}>{statusLabel(value)}</Badge>,
        },
        {
          key: 'exchange_date',
          title: t('currencyExchange.exchangeDate'),
          render: (value) => (value ? <ListDate value={value} /> : '—'),
        },
      ],
    };
    return config;
  }, [t]);
}

export const CurrencyExchangeList = () => <CrudList config={useCurrencyExchangeConfig()} />;
export const AddCurrencyExchange = () => <CrudForm config={useCurrencyExchangeConfig()} />;
export const EditCurrencyExchange = () => <CrudForm config={useCurrencyExchangeConfig()} edit />;
export const CurrencyExchangeDetails = () => <CrudDetails config={useCurrencyExchangeConfig()} />;
