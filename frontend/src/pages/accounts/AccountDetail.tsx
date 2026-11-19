import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Wallet, DollarSign, Calendar, Edit, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import useFetchObjects from '@/api/useFetchObjects';
import { getStaticCurrencyById } from '@/components/forms/CurrencySelect';

/**
 * Operational cash/bank account detail.
 * Double-entry balances live on GL accounts (AFN books), not on this model.
 */
export default function AccountDetail() {
  const { id } = useParams();
  const { t } = useLanguage();
  const { formatDate } = useFormatAppDate();
  const navigate = useNavigate();

  const { data: account, isLoading } = useFetchObjects({
    queryKey: ['account', id],
    endpoint: `accounts/${id}`,
    enabled: !!id,
  });

  const currency =
    account?.currency_details ||
    getStaticCurrencyById(account?.currency) ||
    null;

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/accounts')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                <div>
                  <h1 className="text-base sm:text-lg font-semibold">
                    {account?.name || account?.account_number}
                  </h1>
                  <p className="text-xs text-muted-foreground">{account?.account_number}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/accounts/${id}/edit`)}
              >
                <Edit className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">{t('common.edit')}</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/gl-accounts')}>
                <BookOpen className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">
                  {t('accounts.chartOfAccounts', 'Chart of Accounts')}
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('accounts.accountInformation')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('accounts.accountNumber')}</p>
                <p className="font-medium">{account?.account_number || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('accounts.name')}</p>
                <p className="font-medium truncate">{account?.name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('accounts.currency')}</p>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="outline">{currency?.code || '—'}</Badge>
                  {currency?.symbol ? (
                    <span className="text-sm text-muted-foreground">({currency.symbol})</span>
                  ) : null}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('common.createdAt')}</p>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {account?.created_at ? formatDate(account.created_at) : '—'}
                  </span>
                </div>
              </div>
              {account?.notes ? (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">{t('accounts.notes', 'Notes')}</p>
                  <p className="text-sm whitespace-pre-wrap">{account.notes}</p>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            {t(
              'accounts.operationalAccountHint',
              'This is an operational cash/bank book for the selected currency. Double-entry balances and statements are on the Chart of Accounts (base AFN) and Accounting reports.',
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
