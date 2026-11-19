import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BookOpen } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Form } from '@/components/ui/form';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage } from '@/components/forms/FormPage';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useUpdate from '@/api/useUpdate';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';
import JournalEntryForm, {
  createJournalEntrySchema,
  defaultJournalEntryValues,
  entryToFormValues,
  inferJournalCurrencyId,
  journalEntryToPayload,
} from './JournalEntryForm';

const EditJournalEntry = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams();
  const [currencyId, setCurrencyId] = useState('1');

  const schema = useMemo(() => createJournalEntrySchema(t), [t]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: defaultJournalEntryValues(),
  });

  const { data: entry, isLoading } = useFetchObjects({
    queryKey: ['journal-entry', id],
    endpoint: `journal-entries/${id}/`,
    enabled: !!id,
  });

  const { handleUpdate, loading, isSuccess } = useUpdate({
    queryKey: ['journal-entries', 'journal-entry'],
    endpoint: 'journal-entries',
  });

  useEffect(() => {
    if (entry) {
      form.reset(entryToFormValues(entry));
      setCurrencyId(inferJournalCurrencyId(entry));
    }
  }, [entry, form]);

  useRedirectOnSuccess(isSuccess, '/journal-entries');

  const onSubmit = (data: z.infer<typeof schema>) => {
    handleUpdate(id!, journalEntryToPayload(data, currencyId));
  };

  if (isLoading || !entry) {
    return <div className="flex items-center justify-center h-64">{t('common.loading')}</div>;
  }

  return (
    <FormPage
      title={t('accounts.editJournalEntry')}
      icon={<BookOpen />}
      backTo="/journal-entries"
      maxWidth="5xl"
    >
      {entry?.is_auto && (
        <Alert className="mb-4">
          <AlertDescription>{t('accounts.autoJournalEditWarning')}</AlertDescription>
        </Alert>
      )}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <JournalEntryForm
            control={form.control}
            currencyId={currencyId}
            onCurrencyChange={setCurrencyId}
          />
          <FormActions
            onCancel={() => navigate('/journal-entries')}
            loading={loading}
            submitLabel={t('accounts.updateJournalEntry')}
            loadingLabel={t('common.saving')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default EditJournalEntry;
