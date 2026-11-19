import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import useFetchObjects from '@/api/useFetchObjects';

export default function AccountStatement() {
  const { id } = useParams();
  const { t } = useLanguage();
  const { formatDate } = useFormatAppDate();
  const navigate = useNavigate();

  const { data: statement } = useFetchObjects({
    queryKey: ['account-statement', id],
    endpoint: `accounts/${id}/statement/`,
    enabled: !!id,
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/accounts')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{t('accounts.statement', 'Account Statement')}</h1>
          <p className="text-muted-foreground">
            {statement?.account?.customer_details?.name || statement?.account?.vendor_details?.name}
          </p>
        </div>
        <Button variant="outline">
          <Download className="w-4 h-4 mr-2" />
          {t('common.export', 'Export')}
        </Button>
      </div>

      <Card className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">{t('accounts.date', 'Date')}</th>
                <th className="text-left p-2">{t('accounts.type', 'Type')}</th>
                <th className="text-left p-2">{t('accounts.reference', 'Reference')}</th>
                <th className="text-right p-2">{t('accounts.debit', 'Debit')}</th>
                <th className="text-right p-2">{t('accounts.credit', 'Credit')}</th>
                <th className="text-right p-2">{t('accounts.balance', 'Balance')}</th>
              </tr>
            </thead>
            <tbody>
              {statement?.entries?.map((entry: any) => (
                <tr key={entry.id} className="border-b hover:bg-muted/50">
                  <td className="p-2">{formatDate(entry.entry_date)}</td>
                  <td className="p-2">{entry.entry_type}</td>
                  <td className="p-2">{entry.reference_number}</td>
                  <td className="p-2 text-right text-primary">{entry.debit_amount > 0 ? entry.debit_amount.toFixed(2) : '-'}</td>
                  <td className="p-2 text-right text-red-600">{entry.credit_amount > 0 ? entry.credit_amount.toFixed(2) : '-'}</td>
                  <td className="p-2 text-right font-semibold">{entry.balance.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
