import { useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Calendar } from 'lucide-react';
import { DatePickerInput } from '@/components/ui/date-picker-input';
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
import useAdd from '@/api/useAdd';
import { LeaveFormData } from '@/types/attendance';
import { formMessages, requiredString } from '@/lib/formSchemas';

interface AddLeaveRequestProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const defaultValues = {
  employee: '',
  start_date: '',
  end_date: '',
  reason: '',
  status: 'pending' as const,
};

const AddLeaveRequest = ({ isOpen, onClose, onSuccess }: AddLeaveRequestProps) => {
  const { t } = useLanguage();
  const messages = useMemo(() => formMessages(t), [t]);

  const schema = useMemo(
    () =>
      z
        .object({
          employee: requiredString(t('attendance.validation.employee')),
          start_date: requiredString(t('attendance.validation.date')),
          end_date: requiredString(t('attendance.validation.date')),
          reason: z.string().optional(),
          status: z.enum(['pending', 'approved', 'rejected']).optional(),
        })
        .superRefine((data, ctx) => {
          if (data.start_date && data.end_date && data.start_date > data.end_date) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'End date must be after start date',
              path: ['end_date'],
            });
          }
        }),
    [messages.required, t],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const { handleAdd, loading, isSuccess } = useAdd<LeaveFormData>({
    queryKey: 'employee-leaves',
    customSuccessMessage: t('attendance.addSuccess'),
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

  const onSubmit = (data: z.infer<typeof schema>) => {
    handleAdd(data);
  };

  const handleClose = () => {
    form.reset(defaultValues);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t('attendance.addLeaveRequest')}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="employee"
                render={() => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>{t('attendance.employee')} *</FormLabel>
                    <p className="text-sm text-muted-foreground mb-2">
                      Employee selection temporarily disabled - needs API integration
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('attendance.startDate')} *</FormLabel>
                    <DatePickerInput value={field.value || ''} onChange={field.onChange} />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('attendance.endDate')} *</FormLabel>
                    <DatePickerInput value={field.value || ''} onChange={field.onChange} />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('attendance.reason')}</FormLabel>
                  <FormControl>
                    <Textarea placeholder={t('attendance.notesPlaceholder')} rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="pt-4 border-t">
              <FormActions
                mode="create"
                showSaveAndCreateNew
                onIntent={(intent) => {
                  submitIntent.current = intent;
                }}
                onCancel={handleClose}
                loading={loading}
                submitLabel={t('attendance.addLeaveRequest')}
                loadingLabel={t('common.adding')}
              />
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AddLeaveRequest;
