import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { FALLBACK_BASE_CODE, FALLBACK_BASE_SYMBOL } from '@/lib/currencies';
import { formatJournalDate, journalSourceLabel } from '@/lib/journalLabels';
import { JournalLinesTable } from '@/components/accounting/JournalLinesTable';

const JournalEntryDetail = () => {
  const { t, language } = useLanguage();
  const { calendar } = useCalendarPreference();
  const navigate = useNavigate();
  const { id } = useParams();

  const { data: entry, isLoading } = useFetchObjects({
    queryKey: ['journal-entry', id],
    endpoint: `journal-entries/${id}/`,
    enabled: !!id,
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['journal-entries'],
    endpoint: 'journal-entries',
  });

  const fmt = (n: number, code?: string) => {
    const formatted = Number(n || 0).toLocaleString(language === 'fa' ? 'fa-AF' : 'en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    return code ? `${formatted} ${code}` : formatted;
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">{t('common.loading')}</div>;
  }

  if (!entry) {
    return <div className="flex items-center justify-center h-64">{t('accounts.journalNotFound')}</div>;
  }

  const mixed = entry.is_mixed_currency || entry.native_currency?.code === 'MIXED';
  const currencyCode = mixed
    ? t('accounts.mixedCurrencies', 'Mixed currencies')
    : entry.native_currency?.code || FALLBACK_BASE_CODE;
  const refLabel = entry.reference_number || `JE-${entry.id}`;

  return (
    <div className="w-full max-w-[1800px] mx-auto p-4 sm:p-6 lg:p-8 space-y-5">
      <Card className="border-border/70 shadow-sm overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/10 px-4 py-3 sm:px-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 -ms-1"
              onClick={() => navigate('/journal-entries')}
            >
              <ArrowLeft className="me-1.5 h-4 w-4" />
              {t('common.back')}
            </Button>
            <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
            <div className="min-w-0 flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BookOpen className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold leading-tight sm:text-lg">
                  {t('accounts.journalEntryDetails')}
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-mono font-medium text-foreground/80">{refLabel}</span>
                  <span className="mx-1.5 text-border">·</span>
                  {formatJournalDate(entry.entry_date, language, { calendar })}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Badge variant="outline" className="h-7 font-normal">
              {journalSourceLabel(entry.source_model, t)}
            </Badge>
            <Badge variant={entry.is_auto ? 'secondary' : 'default'} className="h-7 font-normal">
              {entry.is_auto ? t('accounts.autoEntry') : t('accounts.manualEntry')}
            </Badge>
            <Badge variant="secondary" className="h-7 font-mono font-normal">
              {currencyCode}
            </Badge>
            <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => navigate(`/journal-entries/${id}/edit`)}
            >
              <Edit className="me-1.5 h-3.5 w-3.5" />
              {t('common.edit')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-8"
              onClick={() => handleDelete(Number(id))}
            >
              <Trash2 className="me-1.5 h-3.5 w-3.5" />
              {t('common.delete')}
            </Button>
          </div>
        </div>

        <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-3 p-4 sm:p-5">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('accounts.date')}</p>
            <p className="mt-0.5 text-sm font-medium">
              {formatJournalDate(entry.entry_date, language, { calendar })}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('accounts.reference')}</p>
            <p className="mt-0.5 text-sm font-medium font-mono">{entry.reference_number || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('accounts.source')}</p>
            <p className="mt-0.5 text-sm font-medium">{journalSourceLabel(entry.source_model, t)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('accounts.entryKind')}</p>
            <p className="mt-0.5 text-sm font-medium">
              {entry.is_auto ? t('accounts.autoEntry') : t('accounts.manualEntry')}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('accounts.afnEquivalentReporting')}
            </p>
            <p className="mt-0.5 text-sm font-medium tabular-nums">
              {fmt(Number(entry.total_base_debit || 0), FALLBACK_BASE_CODE)} /{' '}
              {fmt(Number(entry.total_base_credit || 0), FALLBACK_BASE_CODE)}
            </p>
          </div>
          {entry.description ? (
            <div className="col-span-2 sm:col-span-3 lg:col-span-5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('accounts.description')}
              </p>
              <p className="mt-0.5 text-sm">{entry.description}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/60 bg-muted/10 py-3 px-4 sm:px-6">
          <CardTitle className="text-base">{t('accounts.journalLines')}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t(
              'accounts.journalLinesNativeHint',
              'Native amounts are in the line currency. AFN columns are reporting equivalents, not Cash AFN.',
            )}
          </p>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <div className="px-2 sm:px-3 py-2">
            <JournalLinesTable lines={entry.lines || []} compact showAccountType />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 border-t border-border/60 bg-muted/10 px-4 py-2.5 text-xs font-semibold tabular-nums sm:px-6">
            {!mixed && (
              <>
                <span>
                  {t('accounts.total')} {t('accounts.debit')}:{' '}
                  <span className="text-primary">
                    {fmt(Number(entry.total_debit || 0), entry.native_currency?.code)}
                  </span>
                </span>
                <span>
                  {t('accounts.total')} {t('accounts.credit')}:{' '}
                  <span className="text-red-600">
                    {fmt(Number(entry.total_credit || 0), entry.native_currency?.code)}
                  </span>
                </span>
              </>
            )}
            <span>
              {t('accounts.afnDebit', 'AFN Debit')}:{' '}
              <span className="text-primary">
                {fmt(Number(entry.total_base_debit || 0), FALLBACK_BASE_CODE)}
              </span>
            </span>
            <span>
              {t('accounts.afnCredit', 'AFN Credit')}:{' '}
              <span className="text-red-600">
                {fmt(Number(entry.total_base_credit || 0), FALLBACK_BASE_CODE)}
              </span>
            </span>
          </div>
          <p className="px-4 pb-2.5 text-[10px] text-muted-foreground sm:px-6">
            {FALLBACK_BASE_SYMBOL} {t('accounts.afnEquivalentReporting')}
          </p>
        </CardContent>
      </Card>

      <ConfirmDialog />
    </div>
  );
};

export default JournalEntryDetail;
