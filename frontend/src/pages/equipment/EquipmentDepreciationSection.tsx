import { useState } from 'react';
import { PlusCircle, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFetchObjects, useAdd } from '@/api';
import { formatDisplayMoney } from '@/lib/displayMoney';

interface DepreciationEntry {
  id: number;
  equipment: number;
  equipment_name: string;
  year: number;
  amount: string;
  notes: string | null;
  net_book_value_before: string;
  created_at: string;
}

interface Props {
  equipmentId: string | number;
  currencyCode: string;
  netBookValue: number;
  acquisitionType: string;
}

export default function EquipmentDepreciationSection({
  equipmentId,
  currencyCode,
  netBookValue,
  acquisitionType,
}: Props) {
  const { t } = useLanguage();
  const [showForm, setShowForm] = useState(false);
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  const { data, refetch } = useFetchObjects<{ results?: DepreciationEntry[]; count?: number } | DepreciationEntry[]>({
    queryKey: ['equipment-depreciation', String(equipmentId)],
    endpoint: 'equipment-depreciation/',
    params: { equipment: equipmentId },
    enabled: !!equipmentId,
  });

  const entries: DepreciationEntry[] = Array.isArray(data)
    ? data
    : (data as any)?.results ?? [];

  const totalDepreciated = entries.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0);

  const { handleAdd, loading } = useAdd<{ equipment: number; year: number; amount: string; notes: string }>({
    queryKey: ['equipment-depreciation', String(equipmentId)],
    endpoint: 'equipment-depreciation/',
    showSuccessToast: true,
    customSuccessMessage: t('equipment.depreciation.added', 'Depreciation entry added and journal posted.'),
    invalidateQueries: true,
  });

  const handleSubmit = () => {
    setFormError('');
    const yearNum = parseInt(year, 10);
    const amountNum = parseFloat(amount);

    if (!yearNum || yearNum < 2000 || yearNum > 2100) {
      setFormError(t('equipment.depreciation.invalidYear', 'Enter a valid year (2000–2100).'));
      return;
    }
    if (!amountNum || amountNum <= 0) {
      setFormError(t('equipment.depreciation.invalidAmount', 'Amount must be greater than zero.'));
      return;
    }
    if (amountNum > netBookValue) {
      setFormError(
        t('equipment.depreciation.exceedsNBV', `Amount exceeds net book value (${formatDisplayMoney(netBookValue, currencyCode)} ${currencyCode}).`)
      );
      return;
    }
    if (entries.some((e) => e.year === yearNum)) {
      setFormError(t('equipment.depreciation.yearExists', `A depreciation entry for ${yearNum} already exists.`));
      return;
    }

    handleAdd(
      { equipment: Number(equipmentId), year: yearNum, amount: String(amountNum), notes },
    );
    setShowForm(false);
    setYear(String(new Date().getFullYear()));
    setAmount('');
    setNotes('');
    setTimeout(() => refetch(), 500);
  };

  // Don't show for expense-type equipment
  if (acquisitionType === 'expense') return null;

  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="border-b border-border/60 bg-muted/15 px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">
              {t('equipment.depreciation.title', 'Depreciation')}
            </CardTitle>
            {entries.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {entries.length} {t('equipment.depreciation.entries', 'entries')}
              </Badge>
            )}
          </div>
          {!showForm && netBookValue > 0 && (
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <PlusCircle className="me-2 h-4 w-4" />
              {t('equipment.depreciation.addEntry', 'Add Depreciation')}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-4 py-4 sm:px-6">
        {/* Summary row */}
        <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t('equipment.depreciation.totalDepreciated', 'Total Depreciated')}
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {formatDisplayMoney(totalDepreciated, currencyCode)} {currencyCode}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t('equipment.netBookValue', 'Net Book Value')}
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-primary">
              {formatDisplayMoney(netBookValue, currencyCode)} {currencyCode}
            </p>
          </div>
        </div>

        {/* Add form */}
        {showForm && (
          <>
            <Separator className="mb-4" />
            <div className="rounded-lg border border-border/60 bg-muted/10 p-4 space-y-4">
              <p className="text-sm font-medium">
                {t('equipment.depreciation.newEntry', 'New Depreciation Entry')}
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="dep-year">{t('equipment.depreciation.year', 'Year')}</Label>
                  <Input
                    id="dep-year"
                    type="number"
                    min={2000}
                    max={2100}
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="e.g. 2024"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dep-amount">
                    {t('equipment.depreciation.amount', 'Amount')} ({currencyCode})
                  </Label>
                  <Input
                    id="dep-amount"
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`Max: ${formatDisplayMoney(netBookValue, currencyCode)}`}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dep-notes">{t('equipment.depreciation.notes', 'Notes (optional)')}</Label>
                <Textarea
                  id="dep-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('equipment.depreciation.notesPlaceholder', 'e.g. Straight-line 20% annual')}
                  rows={2}
                />
              </div>
              {formError && (
                <p className="text-sm font-medium text-destructive">{formError}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSubmit} disabled={loading}>
                  {loading
                    ? t('common.saving', 'Saving...')
                    : t('equipment.depreciation.save', 'Save & Post Journal')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setFormError(''); }}>
                  {t('common.cancel', 'Cancel')}
                </Button>
              </div>
            </div>
            <Separator className="mt-4" />
          </>
        )}

        {/* Entries table */}
        {entries.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t('equipment.depreciation.noEntries', 'No depreciation entries yet.')}
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left">
                  <th className="pb-2 pr-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t('equipment.depreciation.year', 'Year')}
                  </th>
                  <th className="pb-2 pr-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t('equipment.depreciation.nbvBefore', 'NBV Before')}
                  </th>
                  <th className="pb-2 pr-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t('equipment.depreciation.amount', 'Amount')}
                  </th>
                  <th className="pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t('equipment.depreciation.notes', 'Notes')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border/30 last:border-0">
                    <td className="py-2.5 pr-4 font-semibold tabular-nums">{entry.year}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-muted-foreground">
                      {formatDisplayMoney(entry.net_book_value_before, currencyCode)} {currencyCode}
                    </td>
                    <td className="py-2.5 pr-4 font-medium tabular-nums text-destructive">
                      − {formatDisplayMoney(entry.amount, currencyCode)} {currencyCode}
                    </td>
                    <td className="py-2.5 text-muted-foreground">{entry.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
