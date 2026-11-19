import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';

const LoanerDetails = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams();

  const { data: loaner, isLoading } = useFetchObjects({
    queryKey: ['loaner', id],
    endpoint: `loaners/${id}/`,
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  if (!loaner) {
    return <div className="flex items-center justify-center h-64">Loaner not found</div>;
  }

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      <Button variant="ghost" onClick={() => navigate('/loans/loaners')} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t('common.back')}
      </Button>

      <div className="bg-gradient-to-r from-primary to-accent rounded-lg p-6 mb-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">{loaner.name}</h1>
            <Badge variant={loaner.is_active ? 'default' : 'secondary'} className="bg-white/20 text-white">
              {loaner.is_active ? t('common.active') : t('common.inactive')}
            </Badge>
          </div>
          <Users className="h-16 w-16 opacity-50" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('loans.loanerInformation')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{t('loans.loanerName')}</p>
            <p className="font-medium text-lg">{loaner.name}</p>
          </div>
          {loaner.phone && (
            <div>
              <p className="text-sm text-muted-foreground">{t('loans.loanerPhone')}</p>
              <p className="font-medium">{loaner.phone}</p>
            </div>
          )}
          {loaner.email && (
            <div>
              <p className="text-sm text-muted-foreground">{t('loans.loanerEmail')}</p>
              <p className="font-medium">{loaner.email}</p>
            </div>
          )}
          {loaner.address && (
            <div className="sm:col-span-2">
              <p className="text-sm text-muted-foreground">{t('loans.loanerAddress')}</p>
              <p className="font-medium">{loaner.address}</p>
            </div>
          )}
          <div>
            <p className="text-sm text-muted-foreground">{t('common.status')}</p>
            <Badge variant={loaner.is_active ? 'default' : 'secondary'} className="mt-1">
              {loaner.is_active ? t('common.active') : t('common.inactive')}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoanerDetails;
