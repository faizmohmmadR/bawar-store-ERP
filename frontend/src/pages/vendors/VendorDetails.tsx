import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { keepPreviousData } from '@tanstack/react-query';
import { ArrowLeft, Mail, Phone, MapPin, Building } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import { CurrencyFinanceSummary } from '@/components/finance/CurrencyFinanceSummary';
import { ContactTransactionHistory } from '@/components/finance/ContactTransactionHistory';
import {
  filterFinanceByCurrency,
  getFinanceCurrencyCodes,
  hasOutstandingBalance,
} from '@/lib/finance';
import { DetailDateRangeBar } from '@/components/filters/DetailDateRangeBar';
import { usePartyPeriodFilter } from '@/hooks/usePartyPeriodFilter';

interface VendorDetailsProps {
  vendor?: any;
}

const VendorDetails: React.FC<VendorDetailsProps> = ({ vendor: propVendor }) => {
  const { t } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    period,
    setPeriod,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    dateFrom,
    dateTo,
    clear: clearPeriod,
  } = usePartyPeriodFilter();
  const [currencyFilter, setCurrencyFilter] = useState('all');

  const { data: fetchedVendor, isLoading, isError: isVendorError } = useFetchObjects<any>({
    queryKey: ['vendors', id, dateFrom, dateTo],
    endpoint: `vendors/${id}`,
    params: {
      ...(dateFrom && { date_from: dateFrom }),
      ...(dateTo && { date_to: dateTo }),
    },
    enabled: !propVendor && !!id,
    options: { placeholderData: keepPreviousData },
  });

  const vendor = propVendor || fetchedVendor;
  const summaryFinance = useMemo(
    () => filterFinanceByCurrency(vendor?.finance, currencyFilter),
    [vendor?.finance, currencyFilter],
  );
  const availableCurrencies = useMemo(
    () => getFinanceCurrencyCodes(vendor?.finance),
    [vendor?.finance],
  );

  if (isLoading && !vendor) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (isVendorError || !vendor) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">{t('vendors.notFound')}</p>
        {id && (
          <Button variant="outline" onClick={() => navigate('/vendors')} className="mt-4">
            <ArrowLeft className="h-4 w-4 me-2" />
            {t('common.back')}
          </Button>
        )}
      </div>
    );
  }

  const { name, email, phone, address, finance, is_active } = vendor;
  const isActive = is_active !== false;

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <Card className="overflow-hidden">
        <div className="p-4 sm:p-6 space-y-4">
          {id && (
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => navigate('/vendors')}>
                <ArrowLeft className="h-4 w-4 me-2" />
                {t('common.back')}
              </Button>
              <h1 className="text-lg font-bold">{t('vendors.vendorDetails')}</h1>
            </div>
          )}

          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Building className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold truncate">{name}</h2>
                <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted-foreground">
                  {email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      {email}
                    </span>
                  )}
                  {phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      {phone}
                    </span>
                  )}
                  {address && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {address}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={isActive ? 'default' : 'secondary'}>
                {isActive ? t('vendors.active') : t('vendors.inactive')}
              </Badge>
              {finance && (
                <Badge variant={!hasOutstandingBalance(finance) ? 'default' : 'destructive'}>
                  {!hasOutstandingBalance(finance) ? t('vendors.settled') : t('vendors.outstanding')}
                </Badge>
              )}
            </div>
          </div>

          {id && (
            <DetailDateRangeBar
              period={period}
              onPeriodChange={setPeriod}
              dateFrom={period === 'custom' ? customFrom : dateFrom}
              dateTo={period === 'custom' ? customTo : dateTo}
              onDateFromChange={setCustomFrom}
              onDateToChange={setCustomTo}
              onClear={clearPeriod}
            />
          )}
        </div>
      </Card>

      {summaryFinance && Object.keys(summaryFinance).length > 0 && (
        <CurrencyFinanceSummary
          finance={summaryFinance}
          debitLabel={t('vendors.totalDebit')}
          creditLabel={t('vendors.totalCredit')}
          balanceLabel={t('vendors.balance')}
        />
      )}

      {id && (
        <ContactTransactionHistory
          contactType="vendor"
          contactId={id}
          contactName={vendor.name}
          dateFrom={dateFrom}
          dateTo={dateTo}
          currency={currencyFilter}
          onCurrencyChange={setCurrencyFilter}
          availableCurrencies={availableCurrencies}
        />
      )}
    </div>
  );
};

export { VendorDetails };
export default VendorDetails;
