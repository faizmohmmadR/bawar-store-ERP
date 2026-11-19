import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormActions } from '@/components/forms/FormActions';
import { useLanguage } from '@/contexts/LanguageContext';
import { Users } from 'lucide-react';
import useUpdate from '@/api/useUpdate';
import { formMessages, requiredString } from '@/lib/formSchemas';

interface Loaner {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  is_active?: boolean;
}

interface EditLoanerProps {
  isOpen: boolean;
  onClose: () => void;
  loaner: Loaner | null;
  onSuccess?: () => void;
}

const defaultValues = {
  name: '',
  phone: '',
  email: '',
  address: '',
  is_active: true,
};

const EditLoaner = ({ isOpen, onClose, loaner, onSuccess }: EditLoanerProps) => {
  const { t } = useLanguage();
  const messages = useMemo(() => formMessages(t), [t]);

  const schema = useMemo(
    () =>
      z.object({
        name: requiredString(t('loans.validation.loanerName')),
        phone: z.string().optional(),
        email: z.string().optional(),
        address: z.string().optional(),
        is_active: z.boolean(),
      }),
    [messages.required, t],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const { handleUpdate, loading, isSuccess } = useUpdate({
    queryKey: ['loaners'],
  });

  useEffect(() => {
    if (loaner && isOpen) {
      form.reset({
        name: loaner.name || '',
        phone: loaner.phone || '',
        email: loaner.email || '',
        address: loaner.address || '',
        is_active: loaner.is_active ?? true,
      });
    } else if (!isOpen) {
      form.reset(defaultValues);
    }
  }, [loaner, isOpen, form]);

  useEffect(() => {
    if (isSuccess) {
      form.reset(defaultValues);
      onSuccess?.();
      onClose();
    }
  }, [isSuccess, onSuccess, onClose, form]);

  const handleClose = () => {
    form.reset(defaultValues);
    onClose();
  };

  const onSubmit = (data: z.infer<typeof schema>) => {
    if (!loaner) return;
    handleUpdate(loaner.id, data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('loans.editLoaner')}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('loans.loanerName')} *</FormLabel>
                  <FormControl>
                    <Input placeholder={t('loans.enterLoanerName')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('loans.loanerPhone')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('loans.enterPhone')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('loans.loanerEmail')}</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder={t('loans.enterEmail')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('loans.loanerAddress')}</FormLabel>
                  <FormControl>
                    <Textarea placeholder={t('loans.enterAddress')} rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">{t('common.active')}</FormLabel>
                </FormItem>
              )}
            />

            <div className="border-t pt-4">
              <FormActions
                onCancel={handleClose}
                loading={loading}
                submitLabel={t('common.update')}
                loadingLabel={t('common.updating')}
              />
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default EditLoaner;
