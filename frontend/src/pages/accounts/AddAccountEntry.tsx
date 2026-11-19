import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Receipt } from 'lucide-react';
import { Form } from '@/components/ui/form';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage } from '@/components/forms/FormPage';
import { useLanguage } from '@/contexts/LanguageContext';
import useAdd from '@/api/useAdd';
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';
import AccountEntryForm, {
  accountEntryJournalPayload,
  createAccountEntrySchema,
  defaultAccountEntryValues,
} from './AccountEntryForm';

const AddAccountEntry = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const schema = useMemo(() => createAccountEntrySchema(t), [t]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: defaultAccountEntryValues(),
  });

  const { handleAdd, loading, isSuccess } = useAdd({
    queryKey: ['account-entries'],
    endpoint: 'account-entries/journal_entry/',
  });

  const onReset = useCallback(() => {
    form.reset();
  }, [form]);

  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess,
    listPath: '/account-entries',
    onReset,
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    handleAdd(accountEntryJournalPayload(data));
  };

  return (
    <FormPage
      title={t('accounts.addAccountEntry', 'Add Account Entry')}
      icon={<Receipt />}
      backTo="/account-entries"
      maxWidth="6xl"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <AccountEntryForm control={form.control} />
          <FormActions
                mode="create"
                showSaveAndCreateNew={showSaveAndCreateNew}
                onIntent={onIntent}
            onCancel={() => navigate('/account-entries')}
            loading={loading}
            submitLabel={t('accounts.createEntry', 'Create Entry')}
            loadingLabel={t('common.adding')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default AddAccountEntry;
