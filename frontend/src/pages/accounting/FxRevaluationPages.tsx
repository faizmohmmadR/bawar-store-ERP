import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { CrudDetails, CrudForm, CrudList, type CrudConfig } from '@/pages/shared/CrudPages';
import { useLanguage } from '@/contexts/LanguageContext';
import { ListDate } from '@/components/display/ListDate';

function useFxRevaluationConfig() {
  const { t } = useLanguage();
  return useMemo(() => {
    const statusLabel = (value: string) => {
      if (value === 'draft') return t('fxRevaluation.statusDraft');
      if (value === 'reversed') return t('fxRevaluation.statusReversed');
      return t('fxRevaluation.statusPosted');
    };

    const config: CrudConfig = {
      endpoint: 'fx-revaluations',
      queryKey: 'fx-revaluations',
      basePath: '/accounting/fx-revaluations',
      title: t('fxRevaluation.title'),
      singular: t('fxRevaluation.singular'),
      subtitle: t('fxRevaluation.manage'),
      searchPlaceholder: t('fxRevaluation.search'),
      emptyTitle: t('fxRevaluation.noFound'),
      emptyDescription: t('fxRevaluation.addFirst'),
      display: (row) =>
        row.as_of_date
          ? `${t('fxRevaluation.asOf')} ${row.as_of_date}`
          : t('fxRevaluation.singular'),
      fields: [
        { name: 'as_of_date', label: t('fxRevaluation.asOf'), type: 'date', required: true },
        { name: 'notes', label: t('fxRevaluation.notes'), type: 'textarea' },
        {
          name: 'status',
          label: t('fxRevaluation.status'),
          type: 'select',
          options: [
            { value: 'posted', label: t('fxRevaluation.statusPosted') },
            { value: 'draft', label: t('fxRevaluation.statusDraft') },
            { value: 'reversed', label: t('fxRevaluation.statusReversed') },
          ],
        },
      ],
      columns: [
        {
          key: 'as_of_date',
          title: t('fxRevaluation.asOf'),
          render: (value) => (value ? <ListDate value={value} /> : '—'),
        },
        {
          key: 'total_gain',
          title: t('fxRevaluation.totalGain'),
          render: (value) => Number(value || 0).toFixed(2),
        },
        {
          key: 'total_loss',
          title: t('fxRevaluation.totalLoss'),
          render: (value) => Number(value || 0).toFixed(2),
        },
        {
          key: 'status',
          title: t('fxRevaluation.status'),
          render: (value) => (
            <Badge variant={value === 'posted' ? 'default' : 'secondary'}>{statusLabel(value)}</Badge>
          ),
        },
      ],
    };
    return config;
  }, [t]);
}

export const FxRevaluationList = () => <CrudList config={useFxRevaluationConfig()} />;
export const AddFxRevaluation = () => <CrudForm config={useFxRevaluationConfig()} />;
export const EditFxRevaluation = () => <CrudForm config={useFxRevaluationConfig()} edit />;
export const FxRevaluationDetails = () => <CrudDetails config={useFxRevaluationConfig()} />;
