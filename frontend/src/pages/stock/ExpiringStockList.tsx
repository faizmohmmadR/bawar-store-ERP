import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';

/** Lot/expiry tracking UI will use InventoryLot when batch tracking is enabled on products. */
const ExpiringStockList = () => {
  const { t } = useLanguage();

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <Button variant="outline" size="sm" asChild>
        <Link to="/stock">
          <ArrowLeft className="me-2 h-4 w-4" />
          {t('common.back')}
        </Link>
      </Button>
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4" />
            {t('stock.expiring', 'Expiring stock')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            {t(
              'stock.expiringHint',
              'Enable Track expiry on a product, then receive purchases with lot/expiry to see items here.',
            )}
          </p>
          <Button asChild>
            <Link to="/stock">{t('stock.viewStock', 'View stock')}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExpiringStockList;
