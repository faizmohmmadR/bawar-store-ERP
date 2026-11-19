import { useMemo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BookOpen } from 'lucide-react';
import { Form } from '@/components/ui/form';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage } from '@/components/forms/FormPage';
import { useLanguage } from '@/contexts/LanguageContext';
import useAdd from '@/api/useAdd';
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';
import JournalEntryForm, {
  createJournalEntrySchema,
  defaultJournalEntryValues,
  journalEntryToPayload,
} from './JournalEntryForm';

const AddJournalEntry = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [currencyId, setCurrencyId] = useState('1');

  const schema = useMemo(() => createJournalEntrySchema(t), [t]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: defaultJournalEntryValues(),
  });

  const { handleAdd, loading, isSuccess } = useAdd({
    queryKey: ['journal-entries'],
    endpoint: 'journal-entries/',
  });

  const onReset = useCallback(() => {
    form.reset();
    setCurrencyId('1');
  }, [form]);

  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess,
    listPath: '/journal-entries',
    onReset,
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    handleAdd(journalEntryToPayload(data, currencyId));
  };

  return (
    <FormPage
      title={t('accounts.addJournalEntry')}
      icon={<BookOpen />}
      backTo="/journal-entries"
      maxWidth="5xl"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <JournalEntryForm
            control={form.control}
            currencyId={currencyId}
            onCurrencyChange={setCurrencyId}
          />
          <FormActions
            mode="create"
            showSaveAndCreateNew={showSaveAndCreateNew}
            onIntent={onIntent}
            onCancel={() => navigate('/journal-entries')}
            loading={loading}
            submitLabel={t('accounts.createJournalEntry')}
            loadingLabel={t('common.adding')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default AddJournalEntry;
