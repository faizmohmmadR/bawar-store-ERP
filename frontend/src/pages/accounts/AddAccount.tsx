import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useLanguage } from '@/contexts/LanguageContext';
import useAdd from '@/api/useAdd';
import { toCurrencyFkId } from '@/lib/currencies';

const schema = z.object({
  account_number: z.string().min(1, 'Required'),
  name: z.string().optional(),
  currency: z.string().min(1, 'Required'),
  notes: z.string().optional(),
});

const AddAccount = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { account_number: '', name: '', currency: '', notes: '' },
  });

  const { handleAdd, loading, isSuccess } = useAdd({ queryKey: 'accounts', endpoint: 'accounts' });

  useEffect(() => { if (isSuccess) navigate('/accounts'); }, [isSuccess, navigate]);

  const onSubmit = (data: any) => {
    handleAdd({
      account_number: data.account_number,
      name: data.name || '',
      currency: toCurrencyFkId(data.currency),
      notes: data.notes || '',
    });
  };

  return (
    <FormPage
      title={t('accounts.addAccount')}
      description={t('accounts.createAccount')}
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
                <><ReloadIcon className="animate-spin" />{t('accounts.creating')}</>
              ) : t('accounts.createAccount')}
            </Button>
          </div>
        </form>
      </Form>
    </FormPage>
  );
};

export default AddAccount;
