import React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';

interface AttendanceFormData {
  employeeName: string;
  date: string;
  status: 'present' | 'absent' | 'leave' | 'holiday';
  checkInTime?: string;
  checkOutTime?: string;
  hoursWorked?: number;
}

interface AttendanceFormProps {
  attendance?: AttendanceFormData | null;
  onSubmit: (data: AttendanceFormData) => void;
  onCancel: () => void;
}

export const AttendanceForm: React.FC<AttendanceFormProps> = ({ attendance, onSubmit, onCancel }) => {
  const { t } = useLanguage();
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<AttendanceFormData>({
    defaultValues: attendance || {
      employeeName: '',
      date: '',
      status: 'present',
      checkInTime: '',
      checkOutTime: '',
      hoursWorked: 0
    }
  });

  const statusOptions = [
    { value: 'present', label: t('attendance.status.present', 'Present') },
    { value: 'absent', label: t('attendance.status.absent', 'Absent') },
    { value: 'leave', label: t('attendance.status.leave', 'Leave') },
    { value: 'holiday', label: t('attendance.status.holiday', 'Holiday') }
  ];

  const currentStatus = watch('status');

  register('date', { required: t('validation.required', 'This field is required') });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="form-section">
      <div className="form-grid">
        <div className="space-y-2">
          <Label htmlFor="employeeName">{t('attendance.employeeName', 'Employee Name')} *</Label>
          <Input
            id="employeeName"
            {...register('employeeName', { required: t('validation.required', 'This field is required') })}
            placeholder={t('attendance.employeeNamePlaceholder', 'Enter employee name')}
          />
          {errors.employeeName && (
            <p className="text-sm text-destructive">{errors.employeeName.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="date">{t('attendance.date', 'Date')} *</Label>
          <DatePickerInput
            value={watch('date') || ''}
            onChange={(value) => setValue('date', value, { shouldValidate: true })}
          />
          {errors.date && (
            <p className="text-sm text-destructive">{errors.date.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>{t('attendance.status.label', 'Status')} *</Label>
          <Select onValueChange={(value) => setValue('status', value as AttendanceFormData['status'])} defaultValue={watch('status')}>
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

        {currentStatus === 'present' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="checkInTime">{t('attendance.checkInTime', 'Check In Time')}</Label>
              <Input
                id="checkInTime"
                type="time"
                {...register('checkInTime')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="checkOutTime">{t('attendance.checkOutTime', 'Check Out Time')}</Label>
              <Input
                id="checkOutTime"
                type="time"
                {...register('checkOutTime')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hoursWorked">{t('attendance.hoursWorked', 'Hours Worked')}</Label>
              <Input
                id="hoursWorked"
                type="number"
                step="0.5"
                min="0"
                max="24"
                {...register('hoursWorked', { 
                  min: { value: 0, message: t('validation.minValue', 'Value must be greater than 0') },
                  max: { value: 24, message: t('validation.maxValue', 'Value must be less than 24') }
                })}
                placeholder={t('attendance.hoursWorkedPlaceholder', 'Enter hours worked')}
              />
              {errors.hoursWorked && (
                <p className="text-sm text-destructive">{errors.hoursWorked.message}</p>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end gap-4 pt-6">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button type="submit">
          {attendance ? t('common.update', 'Update') : t('common.create', 'Create')}
        </Button>
      </div>
    </form>
  );
};