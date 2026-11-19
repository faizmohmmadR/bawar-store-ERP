import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/api/client';
import useFetchObjects from '@/api/useFetchObjects';
import { FormPage } from '@/components/forms/FormPage';
import { Autocomplete } from '@/components/ui/autocomplete';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { LoanPaymentMethodPicker, type LoanCashMethod } from '@/components/loans/LoanPaymentMethodPicker';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatLoanMoney } from '@/lib/loanFormat';
import type { Loan, LoanPayment } from '@/types/loan';

// These fields follow the application's business-date convention: a naive local datetime.
const currentDateTime = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function LoanPaymentForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { t } = useLanguage();
  const [loanId, setLoanId] = useState(params.get('loan') || '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(currentDateTime);
  const [method, setMethod] = useState<LoanCashMethod>('cash');
  const [reference, setReference] = useState('');
  const [bill, setBill] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const paymentQuery = useFetchObjects<LoanPayment>({
    queryKey: ['loan-payment', id || 'new'], endpoint: `loan-payments/${id}/`, enabled: !!id,
  });
  const payment = paymentQuery.data;
  const loanQuery = useFetchObjects<Loan>({
    queryKey: ['loan', loanId], endpoint: `loans/${loanId}/`, enabled: !!loanId,
  });
  const loan = loanQuery.data;

  useEffect(() => {
    if (!payment) return;
    setLoanId(String(payment.loan));
    setAmount(String(payment.amount));
    setDate(payment.payment_date.slice(0, 16));
    setMethod(payment.payment_method || 'cash');
    setReference(payment.reference_number || '');
    setBill(payment.bill_number || '');
    setNotes(payment.notes || '');
  }, [payment]);
  useEffect(() => {
    if (!id && loan) setMethod(loan.payment_method || 'cash');
  }, [loan, id]);

  const available = Number(loan?.balance_due || 0) + Number(payment?.amount || 0);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    const value = Number(amount);
    if (!loan || !date || !Number.isFinite(value) || value <= 0 || value > available || !/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(amount)) {
      setError(t('loans.paymentValidation'));
      return;
    }
    const data = new FormData();
    data.append('loan', loanId);
    data.append('amount', amount);
    data.append('payment_date', date);
    data.append('payment_method', method);
    data.append('reference_number', reference);
    data.append('bill_number', bill);
    data.append('notes', notes);
    if (file) data.append('bill_file', file);
    else if (removeFile) data.append('bill_file', '');
    setSaving(true);
    try {
      if (id) await api.patch(`loan-payments/${id}/`, data);
      else await api.post('loan-payments/', data);
      await Promise.all(['loans', 'loan', 'loan-summary', 'loan-payments', 'loan-payment', 'journal-entries', 'financial_operational', 'financial_by_currency', 'report-history', 'dashboard_operational'].map(key => client.invalidateQueries({ queryKey: [key] })));
      toast.success(t('loans.paymentSuccess'));
      navigate(`/loan-payments?loan=${loanId}`);
    } catch (err) {
      const details = isAxiosError(err) ? err.response?.data : null;
      setError(details && typeof details === 'object' ? Object.values(details).flat().join(' ') : t('loans.paymentError'));
    } finally { setSaving(false); }
  };

  if ((id && paymentQuery.isLoading) || loanQuery.isLoading) return <div className="p-6">{t('common.loading')}</div>;
  if ((id && (paymentQuery.isError || !payment)) || loanQuery.isError) return <div className="p-6" role="alert">{t('loans.notFound')}</div>;
  return <FormPage title={id ? t('loans.editPayment') : t('loans.addPayment')} backTo="/loan-payments" icon={<CreditCard className="h-5 w-5" />} maxWidth="4xl">
    <form onSubmit={submit} className="space-y-6">
      <fieldset disabled={saving} className="space-y-6">
        <div className="space-y-2"><Label>{t('loans.loanDetails')}</Label>
          <Autocomplete endpoint="loans/" value={loanId} disabled={!!id} queryParams={id ? {} : { is_paid: 'false' }}
            initialLabel={loan ? `${loan.loaner_name} · #${loan.id}` : ''}
            getOptionLabel={option => `${option.loaner_name} · #${option.id} · ${formatLoanMoney(option.balance_due, option)}`}
            onChange={value => { setLoanId(String(value || '')); setAmount(''); }} />
        </div>
        {loan && <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-3">
          <div><p className="text-sm text-muted-foreground">{t('loans.loaner')}</p><p className="font-medium">{loan.loaner_name}</p></div>
          <div><p className="text-sm text-muted-foreground">{t('loans.amountPaid')}</p><p className="font-medium">{formatLoanMoney(loan.amount_paid, loan)}</p></div>
          <div><p className="text-sm text-muted-foreground">{t('loans.maximum')}</p><p className="font-semibold">{formatLoanMoney(available, loan)}</p></div>
        </div>}
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="payment-amount">{t('loans.paymentAmount')} *</Label><Input id="payment-amount" type="number" inputMode="decimal" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div>
          <div className="space-y-2"><Label htmlFor="payment-date">{t('loans.paymentDate')} *</Label><Input id="payment-date" type="datetime-local" required value={date} onChange={e => setDate(e.target.value)} /></div>
        </div>
        <div className="space-y-2"><Label>{t('loans.paymentAccount')}</Label><LoanPaymentMethodPicker value={method} onChange={setMethod} movement={loan?.loan_type === 'loan_out' ? 'increase' : 'decrease'} /></div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="payment-bill">{t('loans.billNumber')}</Label><Input id="payment-bill" maxLength={100} value={bill} onChange={e => setBill(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="payment-reference">{t('loans.referenceNumber')}</Label><Input id="payment-reference" maxLength={100} value={reference} onChange={e => setReference(e.target.value)} /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="payment-file">{t('loans.billFile')}</Label><Input id="payment-file" type="file" onChange={e => { setFile(e.target.files?.[0] || null); setRemoveFile(false); }} />
          {payment?.bill_file && !removeFile && <div className="flex items-center gap-3"><a href={payment.bill_file} target="_blank" rel="noreferrer" className="text-primary underline">{t('loans.viewBill')}</a><Button type="button" variant="ghost" onClick={() => setRemoveFile(true)}>{t('common.remove', 'Remove')}</Button></div>}
        </div>
        <div className="space-y-2"><Label htmlFor="payment-notes">{t('loans.notes')}</Label><Textarea id="payment-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} /></div>
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-3 border-t pt-4"><Button type="button" variant="outline" disabled={saving} onClick={() => navigate('/loan-payments')}>{t('common.cancel')}</Button><Button type="submit" disabled={saving || !loan || available <= 0}>{saving ? t('loans.submittingPayment') : t('loans.submitPayment')}</Button></div>
    </form>
  </FormPage>;
}
