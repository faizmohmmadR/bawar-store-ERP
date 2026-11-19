import useFetchObjects from '@/api/useFetchObjects';
import { Button } from '@/components/ui/button';
import { STATIC_CURRENCIES } from '@/components/forms/CurrencySelect';
import { useLanguage } from '@/contexts/LanguageContext';
import { type ContactFinance, getFinanceBucket, getFinanceCurrencyCodes } from '@/lib/finance';
import { cn } from '@/lib/utils';
import { getPaymentConfig, type PaymentModuleType } from '@/pages/payments/shared/paymentConfig';

/** The party's current ledger totals, using the same figures as its detail page. */
export function PaymentPartyFinanceSummary({ type, partyId, selectedCurrency }: {
  type: PaymentModuleType;
  partyId?: string | number | null;
  selectedCurrency?: string | number | null;
}) {
  const { t } = useLanguage();
  const config = getPaymentConfig(type);
  const { data: party, isLoading, isFetching, isError, refetch } = useFetchObjects<{ name: string; finance?: ContactFinance }>({
    queryKey: ['payment-party-finance', type, String(partyId || '')],
    endpoint: config.partyEndpoint, id: partyId, enabled: !!partyId, options: { staleTime: 0 },
  });
  if (!partyId) return null;
  const labels = type === 'sale' ? 'customers' : 'vendors';
  const knownCodes = STATIC_CURRENCIES.map(currency => currency.code.toUpperCase());
  const codes = [...knownCodes, ...getFinanceCurrencyCodes(party?.finance).filter(code => !knownCodes.includes(code))];
  const number = (value?: number) => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return <section className="mb-6 rounded-lg border bg-muted/20" aria-label={t('payments.partyFinance', 'Financial summary')} aria-live="polite" aria-busy={isFetching}>
    <div className="border-b px-4 py-2 text-sm font-medium">
      {t('payments.partyFinance', 'Financial summary')}{party?.name && <span className="ms-2 text-muted-foreground">— {party.name}</span>}
    </div>
    {isLoading ? <p className="px-4 py-3 text-sm text-muted-foreground" role="status">{t('common.loading')}</p> : isError ?
      <div className="flex items-center gap-3 px-4 py-3 text-sm" role="alert"><span>{t('payments.partyFinanceFailed', 'Could not load financial summary.')}</span><Button type="button" variant="outline" size="sm" onClick={() => refetch()}>{t('common.retry', 'Retry')}</Button></div> :
      <div className="flex divide-x divide-border overflow-x-auto rtl:divide-x-reverse">
        {codes.map(code => {
          const currency = STATIC_CURRENCIES.find(item => item.code.toUpperCase() === code.toUpperCase());
          const bucket = getFinanceBucket(party?.finance, code);
          const active = currency && String(currency.id) === String(selectedCurrency);
          const balance = Number(bucket?.balance || 0);
          return <div key={code} className={cn('min-w-[240px] flex-1 px-4 py-3', active && 'bg-primary/5')}>
            <p className="mb-2 text-xs font-semibold tracking-wide">{code.toUpperCase()}</p>
            <dl className="grid grid-cols-3 gap-3 text-xs">
              <div><dt className="mb-1 text-muted-foreground">{t(`${labels}.totalDebit`)}</dt><dd className="font-semibold tabular-nums" dir="ltr">{number(bucket?.total_debit)}</dd></div>
              <div><dt className="mb-1 text-muted-foreground">{t(`${labels}.totalCredit`)}</dt><dd className="font-semibold tabular-nums" dir="ltr">{number(bucket?.total_credit)}</dd></div>
              <div><dt className="mb-1 text-muted-foreground">{t(`${labels}.balance`)}</dt><dd className={cn('font-semibold tabular-nums', balance !== 0 && 'text-primary')} dir="ltr">{number(balance)}</dd></div>
            </dl>
          </div>;
        })}
      </div>}
  </section>;
}
