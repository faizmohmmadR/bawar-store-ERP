import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ReloadIcon } from '@radix-ui/react-icons';
import useFetchObjects from '@/api/useFetchObjects';
import { Sale } from '@/types/sale';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { printSaleBill } from '@/pages/sales/print';

/**
 * Legacy route `/sales/:id/print`.
 * Prints immediately via the shared sales print module, then returns to the sale.
 */
const PrintBill = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, language, direction } = useLanguage();
  const { calendar } = useCalendarPreference();

  const { data: sale, isLoading, isError } = useFetchObjects<Sale>({
    queryKey: ['sale', id],
    endpoint: `sales/${id}`,
    enabled: !!id,
  });

  useEffect(() => {
    if (!sale || !id) return;
    let cancelled = false;

    (async () => {
      try {
        await printSaleBill({
          sale,
          language,
          direction,
          calendar,
          t,
        });
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          alert(t('sales.printFailed', 'Could not print this sale. Try again.'));
        }
      } finally {
        if (!cancelled) {
          navigate(`/sales/${id}`, { replace: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sale, id, language, direction, calendar, t, navigate]);

  if (isLoading || (!isError && sale)) {
    return (
      <div className="container mx-auto py-12 flex flex-col items-center gap-3">
        <ReloadIcon className="animate-spin h-8 w-8" />
        <p className="text-sm text-muted-foreground">
          {t('sales.preparingPrint', 'Preparing print…')}
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <p>{t('sales.saleNotFound')}</p>
    </div>
  );
};

export default PrintBill;
