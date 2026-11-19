import { Autocomplete } from '@/components/ui/autocomplete';
import { Badge } from '@/components/ui/badge';
import { buildApiUrl } from '@/lib/apiUrl';
import { useLanguage } from '@/contexts/LanguageContext';
import { getPaymentConfig, PaymentModuleType } from '@/pages/payments/shared/paymentConfig';
import {
  getOrderCurrency,
  getOrderOptionLabel,
  getOrderPaid,
  getOrderRemaining,
  getOrderTotal,
  getPartyName,
  OrderRecord,
} from '@/pages/payments/shared/orderHelpers';

interface OrderAutocompleteProps {
  type: PaymentModuleType;
  value: string;
  onChange: (value: string, option?: OrderRecord | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** When set, only loads sales for this customer. */
  partyId?: string;
}

const OrderAutocomplete = ({
  type,
  value,
  onChange,
  placeholder,
  disabled,
  className,
  partyId,
}: OrderAutocompleteProps) => {
  const { t } = useLanguage();
  const config = getPaymentConfig(type);

  return (
    <Autocomplete
      key={`order-${type}-${partyId || 'all'}`}
      endpoint={config.ordersEndpoint}
      apiUrl={buildApiUrl(config.ordersEndpoint)}
      value={value}
      onChange={(val, option) => onChange(val ? String(val) : '', option as OrderRecord | null)}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      pageSize={25}
      queryParams={{
        outstanding: 1,
        ...(partyId ? { [config.partyParam]: partyId } : {}),
      }}
      getOptionLabel={(order) => getOrderOptionLabel(order as OrderRecord, type)}
      getOptionValue={(order) => order.id.toString()}
      renderOption={(order) => {
        const o = order as OrderRecord;
        const currency = getOrderCurrency(o);
        const remaining = getOrderRemaining(o);
        const isFullyPaid = remaining <= 0;

        return (
          <div className="py-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{o.invoice_number || `#${o.id}`}</span>
              <Badge variant={isFullyPaid ? 'secondary' : 'outline'} className="text-xs shrink-0">
                {isFullyPaid
                  ? t('payments.paidBadge')
                  : `${currency?.symbol || ''}${remaining.toFixed(2)} ${t('payments.dueBadge')}`}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {getPartyName(o, type)} · {currency?.code || ''} · {t('payments.totalLabel')}{' '}
              {getOrderTotal(o).toFixed(2)} · {t('payments.paidLabel')}{' '}
              {getOrderPaid(o).toFixed(2)}
            </div>
          </div>
        );
      }}
    />
  );
};

export default OrderAutocomplete;
