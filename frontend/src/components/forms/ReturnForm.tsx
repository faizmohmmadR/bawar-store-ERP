import React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';

interface ReturnFormData {
  returnNumber: string;
  salesInvoice: string;
  returnDate: string;
  status: 'requested' | 'approved' | 'received' | 'refunded' | 'rejected' | 'cancelled';
  reason: 'damaged' | 'defective' | 'wrong_item' | 'not_needed' | 'other';
  totalAmount: number;
  refundAmount: number;
  reasonDescription?: string;
}

interface ReturnFormProps {
  returnItem?: ReturnFormData | null;
  onSubmit: (data: ReturnFormData) => void;
  onCancel: () => void;
}

export const ReturnForm: React.FC<ReturnFormProps> = ({ returnItem, onSubmit, onCancel }) => {
  const { t } = useLanguage();
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<ReturnFormData>({
    defaultValues: returnItem || {
      returnNumber: '',
      salesInvoice: '',
      returnDate: '',
      status: 'requested',
      reason: 'damaged',
      totalAmount: 0,
      refundAmount: 0,
      reasonDescription: ''
    }
  });

  const statusOptions = [
    { value: 'requested', label: t('returns.status.requested', 'Requested') },
    { value: 'approved', label: t('returns.status.approved', 'Approved') },
    { value: 'received', label: t('returns.status.received', 'Received') },
    { value: 'refunded', label: t('returns.status.refunded', 'Refunded') },
    { value: 'rejected', label: t('returns.status.rejected', 'Rejected') },
    { value: 'cancelled', label: t('returns.status.cancelled', 'Cancelled') }
  ];

  const reasonOptions = [
    { value: 'damaged', label: t('returns.reason.damaged', 'Damaged') },
    { value: 'defective', label: t('returns.reason.defective', 'Defective') },
    { value: 'wrong_item', label: t('returns.reason.wrong_item', 'Wrong Item') },
    { value: 'not_needed', label: t('returns.reason.not_needed', 'Not Needed') },
    { value: 'other', label: t('returns.reason.other', 'Other') }
  ];

  register('returnDate', { required: t('validation.required', 'This field is required') });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="form-section">
      <div className="form-grid">
        <div className="space-y-2">
          <Label htmlFor="returnNumber">{t('returns.returnNumber', 'Return Number')} *</Label>
          <Input
            id="returnNumber"
            {...register('returnNumber', { required: t('validation.required', 'This field is required') })}
            placeholder={t('returns.returnNumberPlaceholder', 'Enter return number')}
          />
          {errors.returnNumber && (
            <p className="text-sm text-destructive">{errors.returnNumber.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="salesInvoice">{t('returns.salesInvoice', 'Sales Invoice')} *</Label>
          <Input
            id="salesInvoice"
            {...register('salesInvoice', { required: t('validation.required', 'This field is required') })}
            placeholder={t('returns.salesInvoicePlaceholder', 'Enter sales invoice number')}
          />
          {errors.salesInvoice && (
            <p className="text-sm text-destructive">{errors.salesInvoice.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="returnDate">{t('returns.returnDate', 'Return Date')} *</Label>
          <DatePickerInput
            value={watch('returnDate') || ''}
            onChange={(value) => setValue('returnDate', value, { shouldValidate: true })}
          />
          {errors.returnDate && (
            <p className="text-sm text-destructive">{errors.returnDate.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>{t('returns.status.label', 'Status')} *</Label>
          <Select onValueChange={(value) => setValue('status', value as ReturnFormData['status'])} defaultValue={watch('status')}>
            <SelectTrigger>
              <SelectValue placeholder={t('common.selectOption', 'Select an option')} />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t('returns.reason.label', 'Reason')} *</Label>
          <Select onValueChange={(value) => setValue('reason', value as ReturnFormData['reason'])} defaultValue={watch('reason')}>
            <SelectTrigger>
              <SelectValue placeholder={t('common.selectOption', 'Select an option')} />
            </SelectTrigger>
            <SelectContent>
              {reasonOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="totalAmount">{t('returns.totalAmount', 'Total Amount')} *</Label>
          <Input
            id="totalAmount"
            type="number"
            step="0.01"
            {...register('totalAmount', { 
              required: t('validation.required', 'This field is required'),
              min: { value: 0, message: t('validation.minValue', 'Value must be greater than 0') }
            })}
            placeholder={t('returns.totalAmountPlaceholder', 'Enter total amount')}
          />
          {errors.totalAmount && (
            <p className="text-sm text-destructive">{errors.totalAmount.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="refundAmount">{t('returns.refundAmount', 'Refund Amount')} *</Label>
          <Input
            id="refundAmount"
            type="number"
            step="0.01"
            {...register('refundAmount', { 
              required: t('validation.required', 'This field is required'),
              min: { value: 0, message: t('validation.minValue', 'Value must be greater than 0') }
            })}
            placeholder={t('returns.refundAmountPlaceholder', 'Enter refund amount')}
          />
          {errors.refundAmount && (
            <p className="text-sm text-destructive">{errors.refundAmount.message}</p>
          )}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="reasonDescription">{t('returns.reasonDescription', 'Reason Description')}</Label>
          <Textarea
            id="reasonDescription"
            {...register('reasonDescription')}
            placeholder={t('returns.reasonDescriptionPlaceholder', 'Enter detailed reason for return')}
            rows={3}
          />
        </div>
      </div>

      <div className="flex justify-end gap-4 pt-6">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button type="submit">
          {returnItem ? t('common.update', 'Update') : t('common.create', 'Create')}
        </Button>
      </div>
    </form>
  );
};