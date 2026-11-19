import { useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import useAdd from '@/api/useAdd';
import { formMessages, requiredString } from '@/lib/formSchemas';

interface AddLoanerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const defaultValues = {
  name: '',
  phone: '',
  email: '',
  address: '',
  is_active: true,
};

const AddLoaner = ({ isOpen, onClose, onSuccess }: AddLoanerProps) => {
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

  const { handleAdd, loading, isSuccess } = useAdd({
    queryKey: 'loaners',
    customSuccessMessage: t('loans.loanerAddSuccess'),
  });

  const submitIntent = useRef<'save' | 'save_and_new'>('save');

  useEffect(() => {
    if (!isSuccess) return;
    form.reset(defaultValues);
    onSuccess?.();
    if (submitIntent.current === 'save_and_new') {
      submitIntent.current = 'save';
      return;
    }
    onClose();
  }, [isSuccess, onSuccess, onClose, form]);

  useEffect(() => {
    if (!isOpen) {
      form.reset(defaultValues);
    }
  }, [isOpen, form]);

  const handleClose = () => {
    form.reset(defaultValues);
    onClose();
  };

  const onSubmit = (data: z.infer<typeof schema>) => {
    handleAdd(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('loans.addLoaner')}
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

            <div className="border-t pt-4">
              <FormActions
                mode="create"
                showSaveAndCreateNew
                onIntent={(intent) => {
                  submitIntent.current = intent;
                }}
                onCancel={handleClose}
                loading={loading}
                submitLabel={t('loans.addLoaner')}
                loadingLabel={t('common.adding')}
              />
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AddLoaner;
