import { Link } from 'react-router-dom';
import { TrendingUp, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccountingReportShell } from '@/components/accounting/AccountingReportShell';
import { IncomeStatementTable } from '@/components/accounting/IncomeStatementTable';
import { useLanguage } from '@/contexts/LanguageContext';
import type { IncomeStatementResponse } from '@/types/accountingReports';

export default function IncomeStatementPage() {
  const { t } = useLanguage();

  return (
    <AccountingReportShell
      title={t('accounts.incomeStatement')}
      subtitle={t('accounts.incomeStatementDesc')}
      icon={<TrendingUp className="h-6 w-6 text-primary shrink-0" />}
      endpoint="journal-entries/profit_loss"
      queryKey="income-statement"
      headerAction={
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
          <Link to="/accounting">
            <ArrowLeft className="h-4 w-4" />
            {t('accounts.accountingCenter')}
          </Link>
        </Button>
      }
    >
      {(data) => <IncomeStatementTable data={data as IncomeStatementResponse} />}
    </AccountingReportShell>
  );
}
