import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Wallet } from 'lucide-react';
import { ReloadIcon } from '@radix-ui/react-icons';
import { CurrencySelect } from '@/components/forms/CurrencySelect';
import { FormPage, FormPageFields, FormPageSection } from '@/components/forms/FormPage';
import { toCurrencyFkId } from '@/lib/currencies';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useUpdate from '@/api/useUpdate';

const schema = z.object({
  account_number: z.string().min(1, 'Required'),
  name: z.string().optional(),
  currency: z.string().min(1, 'Required'),
  notes: z.string().optional(),
});

const EditAccount = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const id = location.pathname.split('/').filter(Boolean)[1] || null;

  const { data: accountData, isLoading } = useFetchObjects<any>({
    queryKey: ['accounts', id],
    endpoint: `accounts/${id}`,
    enabled: !!id,
  });

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { account_number: '', name: '', currency: '', notes: '' },
  });

  const { handleUpdate, loading, isSuccess } = useUpdate({ queryKey: ['accounts'] });

  useEffect(() => {
    if (accountData) {
      form.reset({
        account_number: accountData.account_number || '',
        name: accountData.name || '',
        currency: accountData.currency?.toString() || '',
        notes: accountData.notes || '',
      });
    }
  }, [accountData, form]);

  useEffect(() => { if (isSuccess) navigate('/accounts'); }, [isSuccess, navigate]);

  const onSubmit = (data: any) => {
    if (!id) return;
    handleUpdate(id, {
      account_number: data.account_number,
      name: data.name || '',
      currency: toCurrencyFkId(data.currency),
      notes: data.notes || '',
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ReloadIcon className="animate-spin h-8 w-8" />
      </div>
    );
  }

  return (
    <FormPage
      title={t('accounts.editAccount')}
      description={t('accounts.updateAccount')}
      icon={<Wallet />}
      backTo="/accounts"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormPageSection title={t('accounts.accountInformation')}>
            <FormPageFields>
              <FormField control={form.control} name="account_number" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('accounts.accountNumber')} *</FormLabel>
                  <FormControl>
                    <Input placeholder={t('accounts.accountNumberPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('accounts.name')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('accounts.namePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="currency" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('accounts.currency')} *</FormLabel>
                  <FormControl>
                    <CurrencySelect
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={t('accounts.selectCurrency')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </FormPageFields>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounts.notes')}</FormLabel>
                <FormControl>
                  <Textarea placeholder={t('accounts.notesPlaceholder')} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </FormPageSection>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate('/accounts')}>
              {t('accounts.cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <><ReloadIcon className="animate-spin" />{t('accounts.updating')}</>
              ) : t('accounts.updateAccount')}
            </Button>
          </div>
        </form>
      </Form>
    </FormPage>
  );
};

export default EditAccount;
