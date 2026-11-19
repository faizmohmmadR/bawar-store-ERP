import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CreditCard, Edit, Eye, Plus, Trash2 } from 'lucide-react';
import DataTable, { type TableColumn, type TableAction } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { formatLoanMoney } from '@/lib/loanFormat';
import type { LoanPayment } from '@/types/loan';

export default function LoanPaymentManagement() {
  const { t } = useLanguage();
  const { formatDateTime } = useFormatAppDate();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const loanId = params.get('loan') || '';
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const { data, isLoading, isError, refetch } = useFetchObjects<{ results: LoanPayment[]; count: number }>({
    queryKey: ['loan-payments', loanId, search, String(page), String(size)], endpoint: 'loan-payments/',
    params: { page, page_size: size, search, ...(loanId ? { loan: loanId } : {}) },
  });
  const { handleDelete, ConfirmDialog } = useDelete({ queryKey: ['loan-payments'], endpoint: 'loan-payments', additionalQueryKeys: [['loan'], ['loans'], ['loan-summary'], ['loan-payment'], ['journal-entries'], ['financial_operational'], ['financial_by_currency'], ['report-history'], ['dashboard_operational']] });
  const columns: TableColumn<LoanPayment>[] = [
    { key: 'loaner_name', title: t('loans.loaner'), render: (_, row) => <Button variant="link" onClick={() => navigate(`/loans/${row.loan}`)}>{row.loaner_name} · #{row.loan}</Button> },
    { key: 'amount', title: t('loans.paymentAmount'), render: (_, row) => <span className="font-semibold tabular-nums">{formatLoanMoney(row.amount, row)}</span> },
    { key: 'payment_date', title: t('loans.paymentDate'), render: value => formatDateTime(String(value)) },
    { key: 'payment_method', title: t('loans.paymentAccount'), render: value => t(`payments.methods.${value}`, String(value)) },
    { key: 'bill_number', title: t('loans.billNumber'), render: (_, row) => <div>{row.bill_number || '—'}{row.bill_file && <a href={row.bill_file} target="_blank" rel="noreferrer" className="block text-primary underline">{t('loans.viewBill')}</a>}</div> },
    { key: 'reference_number', title: t('loans.referenceNumber') },
    { key: 'notes', title: t('loans.notes') },
  ];
  const actions: TableAction<LoanPayment>[] = [
    { key: 'edit', label: t('loans.editPayment'), icon: <Edit className="h-4 w-4" />, onClick: row => navigate(`/loan-payments/${row.id}/edit`) },
    { key: 'delete', label: t('common.delete'), icon: <Trash2 className="h-4 w-4" />, variant: 'destructive', onClick: row => handleDelete(row.id, row.bill_number || row.reference_number || `#${row.id}`) },
    { key: 'loan', label: t('loans.loanDetails'), icon: <Eye className="h-4 w-4" />, onClick: row => navigate(`/loans/${row.loan}`) },
  ];
  return <div className="space-y-4 p-4 sm:p-6">
    {isError && <div role="alert" className="flex gap-3 text-destructive">{t('loans.paymentError')}<Button variant="outline" onClick={() => refetch()}>{t('common.retry', 'Retry')}</Button></div>}
    <DataTable data={data?.results || []} columns={columns} rowActions={actions} loading={isLoading}
      title={t('loans.loanPayments')} subtitle={t('loans.manageLoanPayments')} icon={<CreditCard className="h-5 w-5" />}
      headerActions={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => navigate('/loans')}>{t('loans.title')}</Button>{loanId && <Button variant="outline" onClick={() => { setParams({}); setPage(1); }}>{t('loans.allLoanPayments')}</Button>}<Button onClick={() => navigate(`/loan-payments/add${loanId ? `?loan=${loanId}` : ''}`)}><Plus className="h-4 w-4" />{t('loans.addPayment')}</Button></div>}
      searchable searchValue={search} onSearch={value => { setSearch(value); setPage(1); }} searchPlaceholder={t('loans.searchPayments')}
      pagination={{ current: page, pageSize: size, total: data?.count || 0, onPageChange: setPage, showSizeChanger: true, onPageSizeChange: value => { setSize(value); setPage(1); } }}
      emptyTitle={t('loans.noPaymentsFound')} />
    <ConfirmDialog />
  </div>;
}
