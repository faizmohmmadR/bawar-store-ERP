import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { notifySuccess } from '@/lib/notify';
import { Eye, EyeOff } from 'lucide-react';
import api from '@/api/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { emailString, requiredString } from '@/lib/formSchemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string | number;
  employeeName?: string;
  employeeEmail?: string | null;
  onCreated?: (employee: any) => void;
};

export function CreateEmployeeAccountDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  employeeEmail,
  onCreated,
}: Props) {
  const { t } = useLanguage();
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const schema = useMemo(
    () =>
      z
        .object({
          account_email: emailString(t('user.emailRequired'), t('user.emailInvalid')),
          account_password: requiredString(t('user.passwordRequired')).min(6, t('user.passwordMinLength')),
          account_password_confirm: requiredString(t('user.confirmPasswordRequired')),
        })
        .refine((data) => data.account_password === data.account_password_confirm, {
          message: t('user.passwordsDoNotMatch'),
          path: ['account_password_confirm'],
        }),
    [t],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      account_email: '',
      account_password: '',
      account_password_confirm: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      account_email: employeeEmail || '',
      account_password: '',
      account_password_confirm: '',
    });
  }, [employeeEmail, employeeName, form, open]);

  const handleClose = (next: boolean) => {
    if (saving) return;
    if (!next) {
      form.reset();
      setShowPassword(false);
    }
    onOpenChange(next);
  };

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setSaving(true);
    try {
      const { data: employee } = await api.post(`/employees/${employeeId}/create-account/`, {
        account_email: data.account_email,
        account_password: data.account_password,
      });
      notifySuccess(t('employees.accountCreated'), {
        title: t('common.success') || 'Success',
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
      onCreated?.(employee);
      handleClose(false);
    } catch (error: any) {
      const payload = error?.response?.data;
      if (payload && typeof payload === 'object') {
        const messages = Object.entries(payload).map(([key, value]) => {
          const text = Array.isArray(value) ? value.join(', ') : String(value);
          return `${key}: ${text}`;
        });
        toast.error(messages.join('. ') || t('employees.accountCreateFailed'));
      } else {
        toast.error(t('employees.accountCreateFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('employees.createAccount')}</DialogTitle>
          <DialogDescription>
            {t('employees.createAccountHelp')}{' '}
            {t(
              'employees.createAccountPermissionsHelp',
              'The login starts with no ERP section access. After creating the account, open Users → Permissions and grant the sections they need.',
            )}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
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
              control={form.control}
              name="account_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('employees.accountPassword')} *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input type={showPassword ? 'text' : 'password'} autoComplete="new-password" {...field} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute end-1 top-1/2 h-8 w-8 -translate-y-1/2"
                        onClick={() => setShowPassword((prev) => !prev)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="account_password_confirm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('employees.confirmPassword')} *</FormLabel>
                  <FormControl>
                    <Input type={showPassword ? 'text' : 'password'} autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={saving}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? t('common.saving') : t('employees.createAccount')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
