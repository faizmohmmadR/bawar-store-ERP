import { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import useAdd from '@/api/useAdd';
import useDelete from '@/api/useDelete';
import useFetchObjects from '@/api/useFetchObjects';
import useUpdate from '@/api/useUpdate';
import { EmployeeMoney } from '@/components/payroll/EmployeeMoney';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import { usePayrollRefresh } from '@/hooks/usePayrollRefresh';
import { payrollPeriodFromDate, toGregorianIsoDate } from '@/lib/calendarDate';
import type { CurrencyDetails } from '@/lib/currencies';
import { cn } from '@/lib/utils';

type DeductionEntryType = 'absence' | 'food';

type OvertimeEntry = {
  id: number;
  work_date: string;
  amount: number | string;
  notes?: string;
};

type AbsenceEntry = {
  id: number;
  entry_type?: DeductionEntryType | string;
  absence_date: string;
  days: number | string;
  amount: number | string;
  notes?: string;
};

type Props = {
  employeeId: string;
  currency?: CurrencyDetails | null;
  employeeCurrencyId?: number | string | null;
  month: string;
  year: number;
  periodCalendar: string;
  canEdit?: boolean;
};

const isNumericInput = (raw: string) => raw === '' || /^\d*\.?\d*$/.test(raw);

export function EmployeePayEntriesPanel({
  employeeId,
  currency,
  employeeCurrencyId,
  month,
  year,
  periodCalendar,
  canEdit = true,
}: Props) {
  const { t } = useLanguage();
  const { calendar } = useCalendarPreference();
  const { formatDate } = useFormatAppDate();
  const todayIso = toGregorianIsoDate(new Date()) || new Date().toISOString().slice(0, 10);

  const [otDate, setOtDate] = useState(todayIso);
  const [otAmount, setOtAmount] = useState('');
  const [otNotes, setOtNotes] = useState('');
  const [editingOtId, setEditingOtId] = useState<number | null>(null);

  const [deductionType, setDeductionType] = useState<DeductionEntryType>('absence');
  const [absDate, setAbsDate] = useState(todayIso);
  const [absDays, setAbsDays] = useState('1');
  const [absAmount, setAbsAmount] = useState('');
  const [absNotes, setAbsNotes] = useState('');
  const [editingAbsId, setEditingAbsId] = useState<number | null>(null);

  const periodParams = useMemo(
    () => ({ employee: employeeId, month, year: String(year), period_calendar: periodCalendar, page_size: '100' }),
    [employeeId, month, year, periodCalendar],
  );

  const overtimeQuery = useFetchObjects<{ results: OvertimeEntry[] }>({
    queryKey: ['employee-overtime-entries', employeeId, month, String(year), periodCalendar],
    endpoint: 'employee-overtime-entries',
    params: periodParams,
    enabled: !!employeeId,
    options: { staleTime: 0 },
  });
  const absenceQuery = useFetchObjects<{ results: AbsenceEntry[] }>({
    queryKey: ['employee-absence-entries', employeeId, month, String(year), periodCalendar],
    endpoint: 'employee-absence-entries',
    params: periodParams,
    enabled: !!employeeId,
    options: { staleTime: 0 },
  });

  const { handleAdd: addOvertime, loading: addingOt, isSuccess: otAdded } = useAdd({
    queryKey: 'employee-overtime-entries',
    customSuccessMessage: t('employees.overtimeAdded', 'Overtime saved'),
  });
  const { handleAdd: addAbsence, loading: addingAbs, isSuccess: absAdded } = useAdd({
    queryKey: 'employee-absence-entries',
    customSuccessMessage: t('employees.absenceAdded', 'Deduction saved'),
  });
  const { handleUpdate: updateOvertime, loading: updatingOt, isSuccess: otUpdated } = useUpdate({
    queryKey: 'employee-overtime-entries',
    customSuccessMessage: t('employees.overtimeUpdated', 'Overtime updated'),
  });
  const { handleUpdate: updateAbsence, loading: updatingAbs, isSuccess: absUpdated } = useUpdate({
    queryKey: 'employee-absence-entries',
    customSuccessMessage: t('employees.absenceUpdated', 'Deduction updated'),
  });
  const { handleDelete: deleteOvertime, ConfirmDialog: OtConfirm } = useDelete({
    queryKey: ['employee-overtime-entries'],
    endpoint: 'employee-overtime-entries',
    additionalQueryKeys: ['employees', 'employee-financial-summary', 'employee-yearly-summary'],
  });
  const { handleDelete: deleteAbsence, ConfirmDialog: AbsConfirm } = useDelete({
    queryKey: ['employee-absence-entries'],
    endpoint: 'employee-absence-entries',
    additionalQueryKeys: ['employees', 'employee-financial-summary', 'employee-yearly-summary'],
  });

  usePayrollRefresh(otAdded || absAdded || otUpdated || absUpdated);

  const resetOvertimeForm = () => {
    setEditingOtId(null);
    setOtAmount('');
    setOtNotes('');
    setOtDate(todayIso);
  };

  const resetAbsenceForm = () => {
    setEditingAbsId(null);
    setDeductionType('absence');
    setAbsDays('1');
    setAbsAmount('');
    setAbsNotes('');
    setAbsDate(todayIso);
  };

  useEffect(() => {
    if (!otAdded && !otUpdated) return;
    resetOvertimeForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otAdded, otUpdated, todayIso]);

  useEffect(() => {
    if (!absAdded && !absUpdated) return;
    resetAbsenceForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [absAdded, absUpdated, todayIso]);

  const overtimeRows = overtimeQuery.data?.results || [];
  const absenceRows = absenceQuery.data?.results || [];
  const overtimeTotal = overtimeRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const absenceDeductionTotal = absenceRows.reduce(
    (sum, row) => sum + (row.entry_type === 'food' ? 0 : Number(row.amount || 0)),
    0,
  );
  const foodDeductionTotal = absenceRows.reduce(
    (sum, row) => sum + (row.entry_type === 'food' ? Number(row.amount || 0) : 0),
    0,
  );

  const periodFromDate = (iso: string) =>
    payrollPeriodFromDate(iso, calendar) || { month, year, period_calendar: periodCalendar };

  const currencyId = Number(employeeCurrencyId || currency?.id || 1);

  const deductionTypeLabel = (value?: string) =>
    value === 'food'
      ? t('employees.deductionTypeFood', 'Food')
      : t('employees.deductionTypeAbsence', 'Absence');

  const openEditOvertime = (row: OvertimeEntry) => {
    setEditingOtId(row.id);
    setOtDate(String(row.work_date).slice(0, 10));
    setOtAmount(String(row.amount ?? ''));
    setOtNotes(row.notes || '');
  };

  const openEditAbsence = (row: AbsenceEntry) => {
    setEditingAbsId(row.id);
    setDeductionType(row.entry_type === 'food' ? 'food' : 'absence');
    setAbsDate(String(row.absence_date).slice(0, 10));
    setAbsDays(String(row.days ?? '1'));
    setAbsAmount(String(row.amount ?? ''));
    setAbsNotes(row.notes || '');
  };

  const submitOvertime = () => {
    const amount = Number(otAmount);
    if (!otDate || !Number.isFinite(amount) || amount < 0) return;
    const period = periodFromDate(otDate);
    const payload = {
      employee: Number(employeeId),
      work_date: otDate,
      amount,
      notes: otNotes,
      month: period.month,
      year: period.year,
      period_calendar: period.period_calendar,
      currency: currencyId,
    };
    if (editingOtId != null) {
      updateOvertime(editingOtId, payload);
      return;
    }
    addOvertime(payload);
  };

  const submitAbsence = () => {
    if (!absDate) return;
    const period = periodFromDate(absDate);
    const base = {
      employee: Number(employeeId),
      entry_type: deductionType,
      absence_date: absDate,
      notes: absNotes,
      month: period.month,
      year: period.year,
      period_calendar: period.period_calendar,
      currency: currencyId,
    };

    if (deductionType === 'food') {
      const amount = Number(absAmount);
      if (!Number.isFinite(amount) || amount < 0) return;
      const payload = { ...base, amount, days: 0 };
      if (editingAbsId != null) {
        updateAbsence(editingAbsId, payload);
        return;
      }
      addAbsence(payload);
      return;
    }

    const days = Number(absDays || 1);
    if (!Number.isFinite(days) || days <= 0) return;
    const payload = { ...base, days };
    if (editingAbsId != null) {
      updateAbsence(editingAbsId, payload);
      return;
    }
    addAbsence(payload);
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className="shadow-none">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 px-3 py-2">
          <CardTitle className="text-sm font-semibold">
            {t('employees.overtimeEntries', 'Overtime by day')}
          </CardTitle>
          <EmployeeMoney amount={overtimeTotal} currency={currency} className="text-xs font-semibold" />
        </CardHeader>
        <CardContent className="space-y-2 px-3 pb-3 pt-0">
          {canEdit && (
            <div className="space-y-1.5 rounded-md border border-dashed p-2">
              {editingOtId != null && (
                <p className="text-[11px] font-medium text-primary">
                  {t('employees.editingEntry', 'Editing selected entry')}
                </p>
              )}
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-1.5">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[11px] text-muted-foreground">{t('employees.workDate', 'Work date')}</p>
                  <DatePickerInput value={otDate} onChange={setOtDate} className="h-8 text-xs" />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[11px] text-muted-foreground">{t('payroll.overtime')}</p>
                  <Input
                    type="text"
                    inputMode="decimal"
                    className="h-8 text-xs tabular-nums"
                    value={otAmount}
                    onChange={(e) => {
                      if (!isNumericInput(e.target.value)) return;
                      setOtAmount(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                    }}
                    placeholder="0.00"
                  />
                </div>
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 px-2"
                    disabled={addingOt || updatingOt}
                    onClick={submitOvertime}
                    title={editingOtId != null ? t('common.save') : t('common.add')}
                  >
                    {editingOtId != null ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  </Button>
                  {editingOtId != null && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 px-2"
                      onClick={resetOvertimeForm}
                      title={t('common.cancel')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <Input
                className="h-8 w-full text-xs"
                value={otNotes}
                onChange={(e) => setOtNotes(e.target.value)}
                placeholder={t('payroll.notes')}
              />
            </div>
          )}
          <div className="overflow-x-auto rounded-md border">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 px-2 text-[11px]">{t('employees.workDate', 'Work date')}</TableHead>
                  <TableHead className="h-8 px-2 text-[11px]">{t('payroll.amount', 'Amount')}</TableHead>
                  <TableHead className="h-8 px-2 text-[11px]">{t('payroll.notes')}</TableHead>
                  {canEdit ? <TableHead className="h-8 w-[4.5rem] px-1 text-center">{t('common.actions')}</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {overtimeRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 4 : 3} className="px-2 py-2 text-[11px] text-muted-foreground">
                      {t('employees.noOvertimeEntries', 'No overtime recorded for this period.')}
                    </TableCell>
                  </TableRow>
                ) : (
                  overtimeRows.map((row) => (
                    <TableRow key={row.id} className={cn(editingOtId === row.id && 'bg-primary/5')}>
                      <TableCell className="px-2 py-1.5 whitespace-nowrap">{formatDate(row.work_date)}</TableCell>
                      <TableCell className="px-2 py-1.5 whitespace-nowrap">
                        <EmployeeMoney amount={row.amount} currency={currency} className="text-xs" />
                      </TableCell>
                      <TableCell className="max-w-[10rem] truncate px-2 py-1.5 text-muted-foreground" title={row.notes || undefined}>
                        {row.notes || '—'}
                      </TableCell>
                      {canEdit ? (
                        <TableCell className="px-1 py-1.5">
                          <div className="flex items-center justify-center gap-0.5">
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title={t('common.edit')} onClick={() => openEditOvertime(row)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              title={t('common.delete')}
                              onClick={() => deleteOvertime(row.id, formatDate(row.work_date))}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 px-3 py-2">
          <CardTitle className="text-sm font-semibold">
            {t('employees.absenceEntries', 'Deductions')}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{t('employees.deductionTypeAbsence', 'Absence')}:</span>
              <EmployeeMoney amount={absenceDeductionTotal} currency={currency} className="font-semibold" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{t('employees.deductionTypeFood', 'Food')}:</span>
              <EmployeeMoney amount={foodDeductionTotal} currency={currency} className="font-semibold" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 px-3 pb-3 pt-0">
          {canEdit && (
            <div className="space-y-1.5 rounded-md border border-dashed p-2">
              {editingAbsId != null && (
                <p className="text-[11px] font-medium text-primary">
                  {t('employees.editingEntry', 'Editing selected entry')}
                </p>
              )}
              <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] items-end gap-1.5">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[11px] text-muted-foreground">{t('employees.entryType', 'Type')}</p>
                  <Select
                    value={deductionType}
                    onValueChange={(value) => setDeductionType(value as DeductionEntryType)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="absence">{t('employees.deductionTypeAbsence', 'Absence')}</SelectItem>
                      <SelectItem value="food">{t('employees.deductionTypeFood', 'Food')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[11px] text-muted-foreground">{t('employees.absenceDate', 'Date')}</p>
                  <DatePickerInput value={absDate} onChange={setAbsDate} className="h-8 text-xs" />
                </div>
                {deductionType === 'food' ? (
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-[11px] text-muted-foreground">{t('employees.foodAmount', 'Food amount')}</p>
                    <Input
                      type="text"
                      inputMode="decimal"
                      className="h-8 text-xs tabular-nums"
                      value={absAmount}
                      onChange={(e) => {
                        if (!isNumericInput(e.target.value)) return;
                        setAbsAmount(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                      }}
                      placeholder="0.00"
                    />
                  </div>
                ) : (
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-[11px] text-muted-foreground">{t('employees.absenceDays', 'Days')}</p>
                    <Input
                      type="text"
                      inputMode="decimal"
                      className="h-8 text-xs tabular-nums"
                      value={absDays}
                      onChange={(e) => {
                        if (!isNumericInput(e.target.value)) return;
                        setAbsDays(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                      }}
                    />
                  </div>
                )}
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 px-2"
                    disabled={addingAbs || updatingAbs}
                    onClick={submitAbsence}
                    title={editingAbsId != null ? t('common.save') : t('common.add')}
                  >
                    {editingAbsId != null ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  </Button>
                  {editingAbsId != null && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 px-2"
                      onClick={resetAbsenceForm}
                      title={t('common.cancel')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <Input
                className="h-8 w-full text-xs"
                value={absNotes}
                onChange={(e) => setAbsNotes(e.target.value)}
                placeholder={t('payroll.notes')}
              />
              {deductionType === 'absence' && (
                <p className="text-[11px] text-muted-foreground">
                  {t('employees.absenceHint', 'Each absent day is deducted as monthly salary ÷ 30 (or the daily rate).')}
                </p>
              )}
            </div>
          )}
          <div className="overflow-x-auto rounded-md border">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 px-2 text-[11px]">{t('employees.entryType', 'Type')}</TableHead>
                  <TableHead className="h-8 px-2 text-[11px]">{t('employees.absenceDate', 'Date')}</TableHead>
                  <TableHead className="h-8 px-2 text-[11px]">{t('employees.absenceDays', 'Days')}</TableHead>
                  <TableHead className="h-8 px-2 text-[11px]">{t('payroll.deductions')}</TableHead>
                  <TableHead className="h-8 px-2 text-[11px]">{t('payroll.notes')}</TableHead>
                  {canEdit ? <TableHead className="h-8 w-[4.5rem] px-1 text-center">{t('common.actions')}</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {absenceRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 6 : 5} className="px-2 py-2 text-[11px] text-muted-foreground">
                      {t('employees.noAbsenceEntries', 'No deductions recorded for this period.')}
                    </TableCell>
                  </TableRow>
                ) : (
                  absenceRows.map((row) => (
                    <TableRow key={row.id} className={cn(editingAbsId === row.id && 'bg-primary/5')}>
                      <TableCell className="px-2 py-1.5 whitespace-nowrap">{deductionTypeLabel(row.entry_type)}</TableCell>
                      <TableCell className="px-2 py-1.5 whitespace-nowrap">{formatDate(row.absence_date)}</TableCell>
                      <TableCell className="px-2 py-1.5 whitespace-nowrap">
                        {row.entry_type === 'food' ? '—' : row.days}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 whitespace-nowrap">
                        <EmployeeMoney amount={row.amount} currency={currency} className="text-xs" />
                      </TableCell>
                      <TableCell className="max-w-[9rem] truncate px-2 py-1.5 text-muted-foreground" title={row.notes || undefined}>
                        {row.notes || '—'}
                      </TableCell>
                      {canEdit ? (
                        <TableCell className="px-1 py-1.5">
                          <div className="flex items-center justify-center gap-0.5">
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title={t('common.edit')} onClick={() => openEditAbsence(row)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              title={t('common.delete')}
                              onClick={() => deleteAbsence(row.id, formatDate(row.absence_date))}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <OtConfirm />
      <AbsConfirm />
    </div>
  );
}
