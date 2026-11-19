import { useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Clock, Fingerprint } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { AttendanceFormData } from '@/types/attendance';
import { formMessages, requiredString } from '@/lib/formSchemas';

interface AddAttendanceProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const defaultValues = {
  employee: '',
  date: new Date().toISOString().slice(0, 10),
  check_in_time: '',
  check_out_time: '',
  status: 'present' as const,
  device_id: '',
  employee_device_id: '',
  verification_type: 'fingerprint' as const,
  work_hours: 0,
  overtime_hours: 0,
  break_time: 1.0,
  notes: '',
};

const AddAttendance = ({ isOpen, onClose, onSuccess }: AddAttendanceProps) => {
  const { t } = useLanguage();
  const messages = useMemo(() => formMessages(t), [t]);

  const schema = useMemo(
    () =>
      z
        .object({
          employee: requiredString(t('attendance.validation.employee')),
          date: requiredString(t('attendance.validation.date')),
          check_in_time: z.string().optional(),
          check_out_time: z.string().optional(),
          status: z.enum(['present', 'absent', 'leave', 'holiday', 'late']),
          device_id: z.string().optional(),
          employee_device_id: z.string().optional(),
          verification_type: z.enum(['fingerprint', 'face', 'card', 'password', 'manual']),
          work_hours: z.coerce.number().optional(),
          overtime_hours: z.coerce.number().optional(),
          break_time: z.coerce.number().optional(),
          notes: z.string().optional(),
        })
        .superRefine((data, ctx) => {
          if (data.status === 'present' && !data.check_in_time) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('attendance.validation.checkInTime'),
              path: ['check_in_time'],
            });
          }
        }),
    [messages.required, t],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const { handleAdd, loading, isSuccess } = useAdd<AttendanceFormData>({
    queryKey: 'attendances',
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('attendance.addAttendance')}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="employee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('attendance.employee')} *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('attendance.selectEmployee')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="temp">Employee selection needs API integration</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('attendance.date')} *</FormLabel>
                    <DatePickerInput value={field.value || ''} onChange={field.onChange} />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('attendance.status')} *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="present">{t('attendance.status.present')}</SelectItem>
                        <SelectItem value="absent">{t('attendance.status.absent')}</SelectItem>
                        <SelectItem value="leave">{t('attendance.status.leave')}</SelectItem>
                        <SelectItem value="holiday">{t('attendance.status.holiday')}</SelectItem>
                        <SelectItem value="late">{t('attendance.status.late')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="check_in_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('attendance.checkInTime')}</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="check_out_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('attendance.checkOutTime')}</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="verification_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('attendance.verificationType')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="fingerprint">
                          <div className="flex items-center gap-2">
                            <Fingerprint className="h-4 w-4" />
                            {t('attendance.verification.fingerprint')}
                          </div>
                        </SelectItem>
                        <SelectItem value="face">{t('attendance.verification.face')}</SelectItem>
                        <SelectItem value="card">{t('attendance.verification.card')}</SelectItem>
                        <SelectItem value="password">{t('attendance.verification.password')}</SelectItem>
                        <SelectItem value="manual">{t('attendance.verification.manual')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="device_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('attendance.deviceId')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('attendance.deviceIdPlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="employee_device_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('attendance.employeeDeviceId')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('attendance.employeeDeviceIdPlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="break_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('attendance.breakTime')} (hours)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('attendance.notes')}</FormLabel>
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
                submitLabel={t('attendance.addAttendance')}
                loadingLabel={t('common.adding')}
              />
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AddAttendance;
