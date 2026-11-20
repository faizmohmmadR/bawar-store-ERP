import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CreditCard, Eye, Edit, Trash2, Plus } from 'lucide-react';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { Button } from '@/components/ui/button';
import DataTable, { type TableColumn, type TableAction } from '@/components/ui/data-table';
import { CurrencyAmount } from '@/components/display/CurrencyAmount';
import { ListDate } from '@/components/display/ListDate';
import { FormPage } from '@/components/forms/FormPage';
import { useLanguage } from '@/contexts/LanguageContext';
import type { GeneralPayment } from '@/types/payment';
import { getPaymentConfig, type PaymentModuleType } from './paymentConfig';

export function GeneralPaymentList({ type }: { type: PaymentModuleType }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const config = getPaymentConfig(type);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data, isLoading } = useFetchObjects<{ results: GeneralPayment[]; count: number }>({
    queryKey: ['general-payments', type, String(page), search], endpoint: 'general-payments',
    params: { payment_type: type, page, page_size: 25, search },
  });
  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['general-payments'], endpoint: 'general-payments', hardDelete: true,
    additionalQueryKeys: [[config.queryKey], ['general-payment-balance'], ['sales'], ['purchases']],
  });
  const columns: TableColumn[] = [
    { key: 'id', title: t('payments.reference'), render: value => <span className="font-mono">GPAY-{value}</span> },
    { key: 'party_name', title: type === 'sale' ? t('sales.customer') : t('rawMaterialPurchases.vendor', 'Vendor') },
    { key: 'amount', title: t('payments.amount'), render: (value, record) => <CurrencyAmount amount={value} currency={record.currency_details} showCode /> },
    { key: 'payment_date', title: t('payments.paymentDate'), render: value => <ListDate value={value} /> },
    { key: 'payment_method', title: t('payments.paymentMethod'), render: value => t(`payments.methods.${value}`, value) },
    { key: 'available_credit', title: t('payments.availableCredit', 'Retained credit'), render: (value, record) => <CurrencyAmount amount={value} currency={record.currency_details} showCode /> },
    { key: 'allocations', title: t('payments.generalBills', 'Bills paid'), render: value => value?.length || 0 },
    { key: 'reference_number', title: t('payments.referenceNumber') },
  ];
  const actions: TableAction[] = [
    { key: 'view', label: t('payments.viewDetails'), icon: <Eye className="h-4 w-4" />, onClick: row => navigate(`${config.listPath}/general/${row.id}`) },
    { key: 'edit', label: t('common.edit'), icon: <Edit className="h-4 w-4" />, onClick: row => navigate(`${config.listPath}/general/${row.id}/edit`) },
    { key: 'delete', label: t('common.delete'), icon: <Trash2 className="h-4 w-4" />, onClick: row => handleDelete(row.id, `GPAY-${row.id} — ${row.party_name}`), className: 'text-destructive' },
  ];
  return <div className="space-y-4 p-4 sm:p-6">
    <DataTable data={data?.results || []} columns={columns} rowActions={actions} loading={isLoading}
      title={t('payments.generalList', 'General payments')} subtitle={t('payments.generalListHelp', 'One exact receipt per payment. Bills settle from retained credit without splitting the cash amount.')}
      icon={<CreditCard className="h-5 w-5" />} searchable searchValue={search} onSearch={value => { setSearch(value); setPage(1); }}
      headerActions={<div className="flex gap-2"><Button variant="outline" onClick={() => navigate(config.listPath)}>{t('payments.billPayments', 'Bill payments')}</Button><Button onClick={() => navigate(config.addPath)}><Plus className="h-4 w-4" />{t('payments.generalAdd', 'General payment')}</Button></div>}
      pagination={{ current: page, pageSize: 25, total: data?.count || 0, onPageChange: setPage }}
      emptyTitle={t('payments.noPayments')} />
    <ConfirmDialog />
  </div>;
}

export function GeneralPaymentDetails({ type }: { type: PaymentModuleType }) {
  const { t } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();
  const config = getPaymentConfig(type);
  const { data: receipt, isLoading } = useFetchObjects<GeneralPayment>({ queryKey: ['general-payment', id], endpoint: 'general-payments', id });
  if (isLoading) return <p className="p-6">{t('common.loading')}</p>;
  if (!receipt || receipt.payment_type !== type) return <p className="p-6">{t('payments.noPayments')}</p>;
  return <FormPage title={`GPAY-${receipt.id} — ${receipt.party_name}`} icon={<CreditCard />} backTo={`${config.listPath}/general`}
    headerActions={<Button onClick={() => navigate(`${config.listPath}/general/${receipt.id}/edit`)}><Edit className="h-4 w-4" />{t('common.edit')}</Button>}>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><p className="text-sm text-muted-foreground">{t('payments.amount')}</p><CurrencyAmount amount={receipt.amount} currency={receipt.currency_details} showCode className="text-xl font-semibold" /></div>
      <div><p className="text-sm text-muted-foreground">{t('payments.paymentDate')}</p><ListDate value={receipt.payment_date} /></div>
      <div><p className="text-sm text-muted-foreground">{t('payments.paymentMethod')}</p>{t(`payments.methods.${receipt.payment_method}`, receipt.payment_method)}</div>
      <div><p className="text-sm text-muted-foreground">{t('payments.referenceNumber')}</p>{receipt.reference_number || '—'}</div>
      <div><p className="text-sm text-muted-foreground">{t('payments.availableCredit', 'Retained credit')}</p><CurrencyAmount amount={receipt.available_credit} currency={receipt.currency_details} showCode className="font-semibold text-primary" /></div>
      {receipt.notes && <div className="sm:col-span-2"><p className="text-sm text-muted-foreground">{t('payments.notes')}</p>{receipt.notes}</div>}
    </div>
    <div className="mt-6 overflow-x-auto rounded-md border">
      <table className="w-full text-sm"><caption className="p-3 text-start font-semibold">{t('payments.generalAllocations', 'Bills paid by this receipt')}</caption>
        <thead className="bg-muted/40"><tr><th className="p-3 text-start">{t('payments.relatedInvoice')}</th><th className="p-3 text-end">{t('payments.amount')}</th><th className="p-3 text-end">{t('common.actions')}</th></tr></thead>
        <tbody>{receipt.allocations.map(payment => <tr key={payment.id} className="border-t">
          <td className="p-3">{payment.related_object_details?.invoice_number || `#${payment.object_id}`}</td>
          <td className="p-3 text-end"><CurrencyAmount amount={payment.amount} currency={receipt.currency_details} showCode /></td>
          <td className="p-3 text-end"><Button variant="ghost" onClick={() => navigate(config.detailPath(payment.id))}>{t('payments.viewDetails')}</Button></td>
        </tr>)}</tbody>
      </table>
    </div>
  </FormPage>;
}
