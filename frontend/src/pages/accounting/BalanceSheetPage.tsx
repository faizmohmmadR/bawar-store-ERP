import { Link } from 'react-router-dom';
import { FileSpreadsheet, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccountingReportShell } from '@/components/accounting/AccountingReportShell';
import { BalanceSheetTable } from '@/components/accounting/BalanceSheetTable';
import { useLanguage } from '@/contexts/LanguageContext';
import type { BalanceSheetResponse } from '@/types/accountingReports';

export default function BalanceSheetPage() {
  const { t } = useLanguage();

  return (
    <AccountingReportShell
      title={t('accounts.balanceSheet')}
      subtitle={t('accounts.balanceSheetDesc')}
      icon={<FileSpreadsheet className="h-6 w-6 text-primary shrink-0" />}
      endpoint="journal-entries/balance-sheet"
      queryKey="balance-sheet"
      headerAction={
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
          <Link to="/accounting">
            <ArrowLeft className="h-4 w-4" />
            {t('accounts.accountingCenter')}
          </Link>
        </Button>
      }
    >
      {(data) => <BalanceSheetTable data={data as BalanceSheetResponse} />}
    </AccountingReportShell>
  );
}
