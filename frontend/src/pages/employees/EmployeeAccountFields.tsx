import { useEffect, useMemo } from 'react';
import type { Control, UseFormWatch, UseFormSetValue } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormPageFields } from '@/components/forms/FormPage';
import { useLanguage } from '@/contexts/LanguageContext';

type AccountFormShape = {
  create_account?: boolean;
  account_email?: string;
  account_password?: string;
  account_password_confirm?: string;
  full_name?: string;
  email?: string;
};

type Props = {
  control: Control<any>;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
};

export function EmployeeAccountFields({ control, watch, setValue }: Props) {
  const { t } = useLanguage();
  const createAccount = watch('create_account');
  const email = watch('email');

  useEffect(() => {
    if (!createAccount) return;
    const current = watch('account_email');
    if (!current && email) setValue('account_email', email);
  }, [createAccount, email, setValue, watch]);

  const schemaHint = useMemo(
    () =>
      `${t('employees.createAccountHelp')} ${t(
        'employees.createAccountPermissionsHelp',
        'The login starts with no ERP section access. After creating the account, open Users → Permissions and grant the sections they need.',
      )}`,
    [t],
  );

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{t('employees.loginAccount')}</h3>
      <FormField
        control={control}
        name="create_account"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <label className="flex h-10 cursor-pointer items-center justify-between gap-3 rounded-md border border-input bg-background px-3">
                <span className="text-sm font-medium">{t('employees.createAccount')}</span>
                <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
              </label>
            </FormControl>
            <FormDescription>{schemaHint}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {createAccount ? (
        <FormPageFields>
          <FormField
            control={control}
            name="account_email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('employees.accountEmail')} *</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="account_password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('employees.accountPassword')} *</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="account_password_confirm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('employees.confirmPassword')} *</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormPageFields>
      ) : null}
    </div>
  );
}

export type { AccountFormShape };
