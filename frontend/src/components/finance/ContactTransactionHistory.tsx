import { formatDecimalDisplay } from '@/lib/decimalDisplay';
import api from '@/api/client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Printer, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { STATIC_CURRENCIES } from '@/components/forms/CurrencySelect';
import { DataTable } from '@/components/ui/data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import useFetchObjects from '@/api/useFetchObjects';
import { getBaseCurrency } from '@/lib/currencyChoices';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import { printTable } from '@/lib/printTable';
import { getFontStacks } from '@/lib/fonts';

export interface TransactionTotals {
  currency: string;
  total_debit: number;
  total_credit: number;
  balance: number;
  transaction_count: number;
}

export interface ContactTransactionRow {
  id: string;
  entry_date: string;
  entry_type_name: string;
  entry_type_key?: string;
  reference_number?: string;
  debit_amount: number;
  credit_amount: number;
  running_balance?: number;
  notes?: string;
  account_currency?: string;
}

interface ContactTransactionHistoryProps {
  contactType: 'customer' | 'vendor';
  contactId: string;
  contactName?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Controlled currency code (`AFN`) or `all`. */
  currency?: string;
  onCurrencyChange?: (currency: string) => void;
  /** Extra codes to offer in the filter (e.g. from party finance). */
  availableCurrencies?: string[];
}

const TYPE_BADGE: Record<string, string> = {
  sale: 'bg-primary/15 text-primary border-primary/30',
  purchase: 'bg-accent/15 text-accent border-accent/30',
  payment: 'bg-primary/15 text-primary border-primary/30',
  loan: 'bg-accent/15 text-orange-800 border-orange-200',
  loan_payment: 'bg-primary/15 text-primary border-primary/30',
  return: 'bg-amber-100 text-amber-800 border-amber-200',
};

function formatAmount(value: number, currency?: string) {
  const num = Number(value || 0);
  if (num <= 0) return '—';
  const code = (currency || '').toUpperCase();
  return `${formatDecimalDisplay(num, 2)} ${code}`.trim();
}

export function ContactTransactionHistory({
  contactType,
  contactId,
  contactName,
  dateFrom,
  dateTo,
  currency,
  onCurrencyChange,
  availableCurrencies = [],
}: ContactTransactionHistoryProps) {
  const { t, language } = useLanguage();
  const { formatDate, formatDateTime } = useFormatAppDate();
  const navigate = useNavigate();
  const baseCurrency = getBaseCurrency();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [searchValue, setSearchValue] = useState('');
  const [internalCurrency, setInternalCurrency] = useState('all');
  const [printing, setPrinting] = useState(false);

  const rawCurrency = (currency ?? internalCurrency) || 'all';
  const currencyFilter = rawCurrency.toUpperCase() === 'ALL' ? 'all' : rawCurrency.toUpperCase();

  const setCurrencyFilter = (value: string) => {
    const next = value === 'all' ? 'all' : value.toUpperCase();
    onCurrencyChange?.(next);
    if (currency === undefined) setInternalCurrency(next);
  };

  const endpoint =
    contactType === 'customer'
      ? `customers/${contactId}/account_entry_history`
      : `vendors/${contactId}/account_entry_history`;

  const { data, isLoading, isFetching } = useFetchObjects<{
    results: ContactTransactionRow[];
    count: number;
    totals_by_currency?: Record<string, TransactionTotals>;
  }>({
    queryKey: [contactType, contactId, 'transactions', page, pageSize, searchValue, dateFrom, dateTo, currencyFilter],
    endpoint,
    params: {
      page: String(page),
      page_size: String(pageSize),
      ...(searchValue.trim() && { search: searchValue.trim() }),
      ...(dateFrom && { date_from: dateFrom }),
      ...(dateTo && { date_to: dateTo }),
      ...(currencyFilter !== 'all' && { currency: currencyFilter }),
    },
    enabled: !!contactId,
  });

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, currencyFilter, searchValue]);

  const rows = data?.results || [];
  const totals = data?.totals_by_currency || {};

  const currencyOptions = useMemo(() => {
    const codes = new Set<string>([
      ...STATIC_CURRENCIES.map((c) => c.code.toUpperCase()),
      ...availableCurrencies.map((c) => c.toUpperCase()),
      ...Object.keys(totals).map((c) => c.toUpperCase()),
    ]);
    return Array.from(codes).sort((a, b) => {
      if (a === baseCurrency?.code) return -1;
      if (b === baseCurrency?.code) return 1;
      return a.localeCompare(b);
    });
  }, [availableCurrencies, totals, baseCurrency?.code]);

  const activeCurrencyLabel =
    currencyFilter === 'all'
      ? t('common.allCurrencies')
      : currencyFilter;

  const typeLabel = (key?: string, fallback?: string) => {
    if (!key) return fallback || '—';
    const i18nKey = `common.transactionTypes.${key}`;
    const translated = t(i18nKey);
    return translated !== i18nKey ? translated : fallback || key;
  };

  const handleReferenceClick = (row: ContactTransactionRow) => {
    const id = String(row.id || '');
    if (id.startsWith('sale-')) {
      navigate(`/sales/${id.replace('sale-', '')}`);
    } else if (id.startsWith('raw-material-purchase-')) {
      navigate(`/purchases/${id.replace('raw-material-purchase-', '')}`);
    } else if (id.startsWith('loan-') && !id.startsWith('loan-payment-')) {
      navigate(`/loans/${id.replace('loan-', '')}`);
    }
  };

  const buildPrintPayload = useCallback(
    (printRows: ContactTransactionRow[], printTotals: Record<string, TransactionTotals>) => {
      const columns = [
        { title: t('accounts.entryDate'), width: '14%' },
        { title: t('accounts.entryType'), width: '12%' },
        { title: t('accounts.referenceNumber'), width: '12%' },
        { title: t('accounts.debit'), align: 'left' as const, width: '12%' },
        { title: t('accounts.credit'), align: 'left' as const, width: '12%' },
        { title: t('accounts.balance'), align: 'left' as const, width: '12%' },
        { title: t('common.notes'), width: '26%' },
      ];

      const tableRows = printRows.map((row) => [
        formatDateTime(row.entry_date),
        typeLabel(row.entry_type_key, row.entry_type_name),
        row.reference_number || '—',
        formatAmount(Number(row.debit_amount), row.account_currency),
        formatAmount(Number(row.credit_amount), row.account_currency),
        formatAmount(Math.abs(Number(row.running_balance || 0)), row.account_currency),
        row.notes || '—',
      ]);

      const footerRows = Object.values(printTotals).map((item) => [
        {
          text: `${t('common.totals')} (${item.currency}) — ${item.transaction_count} ${t('common.transactions')}`,
          colspan: 3,
          bold: true,
        },
        { text: formatAmount(item.total_debit, item.currency), align: 'left' as const, bold: true },
        { text: formatAmount(item.total_credit, item.currency), align: 'left' as const, bold: true },
        {
          text: formatAmount(Math.abs(item.balance), item.currency),
          align: 'left' as const,
          bold: true,
        },
        { text: '', colspan: 1 },
      ]);

      const metadata: Record<string, string> = {};
      if (contactName) {
        metadata[contactType === 'customer' ? t('accounts.customer') : t('accounts.vendor')] = contactName;
      }
      metadata[t('accounts.currency')] = activeCurrencyLabel;
      if (dateFrom) metadata[t('common.dateFrom')] = formatDate(dateFrom);
      if (dateTo) metadata[t('common.dateTo')] = formatDate(dateTo);
      if (searchValue.trim()) metadata[t('common.search')] = searchValue.trim();

      printTable({
        title: t('common.transactionHistory'),
        subtitle: t('common.transactionHistoryDesc'),
        metadata,
        columns,
        rows: tableRows,
        footerRows,
        landscape: true,
        fontFamily: getFontStacks(language).body,
      });
    },
    [activeCurrencyLabel, contactName, contactType, dateFrom, dateTo, formatDate, formatDateTime, language, searchValue, t],
  );

  const handlePrint = useCallback(async () => {
    setPrinting(true);
    try {
      const totalCount = data?.count ?? rows.length;
      let printRows = rows;
      let printTotals = totals;

      if (totalCount > rows.length) {
        const params = new URLSearchParams({
          page: '1',
          page_size: String(totalCount),
          ...(searchValue.trim() && { search: searchValue.trim() }),
          ...(dateFrom && { date_from: dateFrom }),
          ...(dateTo && { date_to: dateTo }),
          ...(currencyFilter && currencyFilter !== 'all' && { currency: currencyFilter }),
        });

        const { data: json } = await api.get(endpoint, { params });
        printRows = json.results || [];
        printTotals = json.totals_by_currency || {};
      }

      buildPrintPayload(printRows, printTotals);
    } catch (error) {
      console.error('Print failed:', error);
    } finally {
      setPrinting(false);
    }
  }, [
    buildPrintPayload,
    currencyFilter,
    data?.count,
    dateFrom,
    dateTo,
    endpoint,
    rows,
    searchValue,
    totals,
  ]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">{t('accounts.currency')}:</span>
          <Select
            value={currencyFilter}
            onValueChange={(value) => {
              setCurrencyFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.allCurrencies')}</SelectItem>
              {currencyOptions.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                  {code === baseCurrency?.code ? ` (${t('common.baseCurrency')})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {currencyFilter !== 'all' && (
            <Badge variant="default" className="font-mono">
              {activeCurrencyLabel}
            </Badge>
          )}
        </div>
      </div>

      <DataTable
        title={t('common.transactionHistory')}
        subtitle={`${t('common.transactionHistoryDesc')} — ${activeCurrencyLabel}`}
        icon={<Receipt className="h-5 w-5" />}
        headerActions={
          <Button onClick={handlePrint} size="sm" variant="outline" disabled={printing || isLoading}>
            <Printer className="h-4 w-4 me-2" />
            {printing ? t('common.loading') : t('common.print')}
          </Button>
        }
        data={rows}
        columns={[
          {
            key: 'entry_date',
            title: t('accounts.entryDate'),
            render: (value) => {
              return (
                <div className="flex items-center gap-2 min-w-[120px]">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <div className="font-medium text-sm">
                      {formatDate(value)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {value
                        ? new Date(value).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                        : '—'}
                    </div>
                  </div>
                </div>
              );
            },
          },
          {
            key: 'entry_type_key',
            title: t('accounts.entryType'),
            render: (_value, record) => {
              const key = record.entry_type_key || '';
              return (
                <Badge variant="outline" className={TYPE_BADGE[key] || ''}>
                  {typeLabel(key, record.entry_type_name)}
                </Badge>
              );
            },
          },
          {
            key: 'reference_number',
            title: t('accounts.referenceNumber'),
            render: (value, record) => {
              const clickable =
                String(record.id).startsWith('sale-') ||
                String(record.id).startsWith('purchase-') ||
                (String(record.id).startsWith('loan-') && !String(record.id).startsWith('loan-payment-'));
              if (clickable && value) {
                return (
                  <button
                    type="button"
                    onClick={() => handleReferenceClick(record)}
                    className="font-medium text-primary hover:underline text-left"
                  >
                    {value}
                  </button>
                );
              }
              return <span className="font-medium">{value || '—'}</span>;
            },
          },
          {
            key: 'debit_amount',
            title: t('accounts.debit'),
            align: 'left',
            render: (value, record) => (
              <span className={`font-medium whitespace-nowrap ${Number(value) > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                {formatAmount(Number(value), record.account_currency)}
              </span>
            ),
          },
          {
            key: 'credit_amount',
            title: t('accounts.credit'),
            align: 'left',
            render: (value, record) => (
              <span className={`font-medium whitespace-nowrap ${Number(value) > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                {formatAmount(Number(value), record.account_currency)}
              </span>
            ),
          },
          {
            key: 'running_balance',
            title: t('accounts.balance'),
            align: 'left',
            render: (value, record) => {
              const bal = Number(value || 0);
              return (
                <span className={`font-semibold whitespace-nowrap ${bal > 0 ? 'text-red-600' : bal < 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                  {formatAmount(Math.abs(bal), record.account_currency)}
                </span>
              );
            },
          },
          {
            key: 'notes',
            title: t('common.notes'),
            render: (value) => (
              <span className="text-sm text-muted-foreground truncate max-w-[200px] block" title={value}>
                {value || '—'}
              </span>
            ),
          },
        ]}
        searchable
        searchPlaceholder={t('common.searchTransactions')}
        searchValue={searchValue}
        onSearch={(value) => {
          setSearchValue(value);
          setPage(1);
        }}
        showClearFilters={!!searchValue}
        onClearFilters={() => {
          setSearchValue('');
          setPage(1);
        }}
        pagination={{
          current: page,
          pageSize,
          total: data?.count || 0,
          onPageChange: setPage,
          showSizeChanger: true,
          pageSizeOptions: [10, 25, 50, 100],
          onPageSizeChange: (size) => {
            setPageSize(size);
            setPage(1);
          },
        }}
        loading={isLoading || isFetching}
        emptyTitle={t('common.noTransactions')}
        emptyDescription={t('common.noTransactionsDesc')}
        emptyIcon={<Receipt className="h-12 w-12 opacity-50" />}
        maxHeight="70vh"
        stickyHeader
      />
    </div>
  );
}
