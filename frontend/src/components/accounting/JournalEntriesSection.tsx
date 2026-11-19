import { BookOpen } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import {
  JournalEntriesWithLines,
  type JournalEntryWithLines,
} from '@/components/accounting/JournalLinesTable';

interface JournalEntriesSectionProps {
  model: string;
  objectId: string | number;
  includeRelated?: boolean;
}

const parseObjectId = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const JournalEntriesSection = ({
  model,
  objectId,
  includeRelated = false,
}: JournalEntriesSectionProps) => {
  const { t } = useLanguage();

  const parsedObjectId = parseObjectId(objectId);
  const { data, isLoading } = useFetchObjects<JournalEntryWithLines[]>({
    queryKey: ['journal-entries', 'for-source', model, parsedObjectId, String(includeRelated)],
    endpoint: 'journal-entries/for_source',
    params: {
      model,
      object_id: parsedObjectId,
      ...(includeRelated ? { include_related: true } : {}),
    },
    enabled: parsedObjectId != null,
  });

  const entries: JournalEntryWithLines[] = Array.isArray(data) ? data : [];

  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="border-b border-border/60 bg-muted/15 px-4 py-3 sm:px-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookOpen className="h-3.5 w-3.5" />
          </span>
          {t('accounts.journalEntries')}
        </CardTitle>
        <CardDescription className="ms-10 text-xs">
          {t('accounts.journalLinesDetailHint')}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <JournalEntriesWithLines entries={entries} />
        )}
      </CardContent>
    </Card>
  );
};

export default JournalEntriesSection;
