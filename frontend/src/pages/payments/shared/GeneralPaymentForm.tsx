import { PaymentPartyFinanceSummary } from '@/components/payments/PaymentPartyFinanceSummary';
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';
import api from '@/api/client';
import useFetchObjects from '@/api/useFetchObjects';
import { Autocomplete } from '@/components/ui/autocomplete';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CurrencySelect } from '@/components/forms/CurrencySelect';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage, FormPageFields } from '@/components/forms/FormPage';
import { CurrencyAmount } from '@/components/display/CurrencyAmount';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatApiError, notifyError, notifySuccess } from '@/lib/notify';
import { getStaticCurrencyById } from '@/components/forms/CurrencySelect';
import type { GeneralPayment, PaymentBalance } from '@/types/payment';
import { getPaymentConfig, type PaymentModuleType } from './paymentConfig';

export default function GeneralPaymentForm({ type }: { type: PaymentModuleType }) {
  const { t } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const config = getPaymentConfig(type);
  const [partyId, setPartyId] = useState('');
  const [currency, setCurrency] = useState('1');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kabul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const { data: receipt, isLoading: loadingReceipt } = useFetchObjects<GeneralPayment>({
    queryKey: ['general-payment', id || 'new'], endpoint: 'general-payments', id, enabled: !!id,
  });
  useEffect(() => {
    if (!receipt || receipt.payment_type !== type) return;
    setPartyId(String(receipt.customer || receipt.vendor));
    setCurrency(String(receipt.currency));
    setAmount(receipt.amount);
    setMethod(receipt.payment_method);
    setDate(receipt.payment_date.slice(0, 10));
    setReference(receipt.reference_number || '');
    setNotes(receipt.notes || '');
  }, [receipt, type]);
  const { data: balance, isFetching, isError, refetch } = useFetchObjects<PaymentBalance>({
    queryKey: ['general-payment-balance', type, partyId, currency, id || 'new'],
    endpoint: 'general-payments/balance', enabled: !!partyId && !!currency,
    params: { payment_type: type, party_id: partyId, currency, ...(id ? { exclude_general_payment: id } : {}) },
  });
  const due = Number(balance?.total_due || 0);
  const currencyDetails = getStaticCurrencyById(currency);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || isFetching) return;
    if (!partyId || !date) {
      notifyError(t('payments.generalSelectParty', 'Select a customer or vendor and a payment date.'));
      return;
    }
    if (!balance || isError) {
      notifyError(t('payments.generalBalanceFailed', 'Could not load the outstanding balance.'));
      return;
    }
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      notifyError(t('payments.generalInvalidAmount', 'Enter an amount greater than zero.'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        payment_type: type, customer: type === 'sale' ? Number(partyId) : null,
        vendor: type === 'purchase' ? Number(partyId) : null, currency: Number(currency),
        amount, payment_method: method, payment_date: `${date}T12:00:00+04:30`, reference_number: reference, notes,
      };
      const result = id
        ? await api.patch<GeneralPayment>(`/general-payments/${id}/`, payload)
        : await api.post<GeneralPayment>('/general-payments/', payload);
      await queryClient.invalidateQueries();
      notifySuccess(t('payments.generalSaved', 'General payment saved.'));
      navigate(`${config.listPath}/general/${result.data.id}`);
    } catch (error) {
      notifyError(formatApiError(error, t('payments.generalSaveFailed', 'Could not save the payment.')));
      refetch();
    } finally { setSaving(false); }
  };
  if (id && loadingReceipt) return <p className="p-6">{t('common.loading')}</p>;
  if (id && (!receipt || receipt.payment_type !== type)) return <p className="p-6">{t('payments.noPayments')}</p>;
  return (
    <FormPage title={t(id ? 'payments.generalEdit' : 'payments.generalAdd', id ? 'Edit general payment' : 'General payment')}
      description={t('payments.generalHelp', 'Record the exact customer or supplier payment. Open bills are settled from this credit; any leftover stays for future bills.')}
      icon={<CreditCard />} backTo={`${config.listPath}/general`}
      headerActions={!id && <Button variant="outline" onClick={() => navigate(`${config.addPath}?mode=bill`)}>{t('payments.payOneBill', 'Pay one bill')}</Button>}>
      <PaymentPartyFinanceSummary type={type} partyId={partyId} selectedCurrency={currency} />
      <form onSubmit={save} className="space-y-6">
        <FormPageFields>
          <div className="space-y-2">
            <Label htmlFor="general-party">{type === 'sale' ? t('sales.customer') : t('rawMaterialPurchases.vendor', 'Vendor')} *</Label>
            {id ? <Input id="general-party" value={receipt?.party_name || ''} disabled /> :
              <Autocomplete endpoint={config.partyEndpoint} value={partyId}
                onChange={value => { setPartyId(value == null ? '' : String(value)); setAmount(''); }}
                getOptionLabel={(party: { name: string }) => party.name}
                getOptionValue={(party: { id: number }) => String(party.id)}
                placeholder={type === 'sale' ? t('payments.selectCustomer', 'Select customer') : t('payments.selectVendor', 'Select vendor')} />}
          </div>
          <div className="space-y-2">
            <Label>{t('payments.currency')} *</Label>
            <CurrencySelect value={currency} onChange={value => { setCurrency(value); setAmount(''); }} disabled={!!id} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="general-date">{t('payments.paymentDate')} *</Label>
            <DatePickerInput value={date} onChange={setDate} />
          </div>
          <div className="space-y-2">
            <Label>{t('payments.paymentMethod', 'Payment method')} *</Label>
            <Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{['cash', 'bank', 'sarafi'].map(value => <SelectItem key={value} value={value}>{t(`payments.methods.${value}`, value)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <p className="text-sm text-muted-foreground">{t('payments.totalDue')}:
              {' '}<CurrencyAmount amount={due} currency={currencyDetails} showCode />
            </p>
            <Label htmlFor="general-amount">{t('payments.amount')} *</Label>
            <div className="flex gap-2">
              <Input id="general-amount" type="number" step="0.01" min="0.01" required value={amount} onChange={event => setAmount(event.target.value)} disabled={!partyId || isFetching} />
              <Button type="button" variant="outline" disabled={due <= 0 || isFetching} onClick={() => setAmount(due.toFixed(2))}>{t('payments.payRemaining')}</Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('payments.generalCurrencyHint', 'Each payment uses one currency and method. Record another payment for a different currency or method.')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="general-reference">{t('payments.referenceNumber')}</Label>
            <Input id="general-reference" value={reference} onChange={event => setReference(event.target.value)} maxLength={100} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="general-notes">{t('payments.notes')}</Label>
            <Textarea id="general-notes" value={notes} onChange={event => setNotes(event.target.value)} />
          </div>
        </FormPageFields>
        {isFetching && <p role="status">{t('common.loading')}</p>}
        {isError && <p role="alert" className="text-destructive">{t('payments.generalBalanceFailed', 'Could not load the outstanding balance.')} <Button type="button" variant="outline" onClick={() => refetch()}>{t('common.retry', 'Retry')}</Button></p>}
        <FormActions onCancel={() => navigate(`${config.listPath}/general`)} loading={saving || isFetching} submitLabel={t('payments.generalSave', 'Save general payment')} />
      </form>
    </FormPage>
  );
}
