import { Link } from 'react-router-dom';
import { Scale, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccountingReportShell } from '@/components/accounting/AccountingReportShell';
import { TrialBalanceTable } from '@/components/accounting/TrialBalanceTable';
import { useLanguage } from '@/contexts/LanguageContext';
import type { TrialBalanceResponse } from '@/types/accountingReports';

export default function TrialBalancePage() {
  const { t } = useLanguage();

  return (
    <AccountingReportShell
      title={t('accounts.trialBalance')}
      subtitle={t('accounts.trialBalanceDesc')}
      icon={<Scale className="h-6 w-6 text-primary shrink-0" />}
      endpoint="journal-entries/trial_balance"
      queryKey="trial-balance"
      headerAction={
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
          <Link to="/accounting">
            <ArrowLeft className="h-4 w-4" />
            {t('accounts.accountingCenter')}
          </Link>
        </Button>
      }
    >
      {(data) => <TrialBalanceTable data={data as TrialBalanceResponse} />}
    </AccountingReportShell>
  );
}
