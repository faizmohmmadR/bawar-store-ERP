import { ListDate } from '@/components/display/ListDate';
import React, { useState } from 'react';
import DataTable, { TableColumn } from '@/components/ui/data-table';
import { useParams, useNavigate } from 'react-router-dom';
import { keepPreviousData } from '@tanstack/react-query';
import { ArrowLeft, Mail, Phone, MapPin, UserCheck, Wallet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import { Salesman } from '@/types/salesman';
import { formatOrderNumeric } from '@/lib/orderNumeric';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { formatAppDate } from '@/lib/calendarDate';
import { escapeHtml, printHtmlInHiddenIframe } from '@/lib/printHtml';
import { BRAND } from '@/lib/brand';
import { getFontStacks } from '@/lib/fonts';
import { FALLBACK_BASE_SYMBOL } from '@/lib/currencies';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';
import { DetailDateRangeBar } from '@/components/filters/DetailDateRangeBar';
import { usePartyPeriodFilter } from '@/hooks/usePartyPeriodFilter';
import type { SalesmanCommissionStatement, SalesmanStatementEntry } from '@/types/salesmanCommissionPayment';

const SalesmanDetails: React.FC = () => {
  const { t, language, direction } = useLanguage();
  const { calendar } = useCalendarPreference();
  const [page, setPage] = useState(1);
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
  } = usePartyPeriodFilter({ initialPeriod: 'monthly', onFilterChange: () => setPage(1) });

  const { data: salesman, isLoading, isError } = useFetchObjects<Salesman>({
    queryKey: ['salesmen', id],
    endpoint: `salesmen/${id}`,
    enabled: !!id,
  });

  const { data: commission, isLoading: statementLoading, isFetching: statementFetching, isError: statementError } = useFetchObjects<SalesmanCommissionStatement>({
    queryKey: ['salesmen', id, 'commission-statement', dateFrom, dateTo],
    endpoint: `salesmen/${id}/commission-statement`,
    params: {
      ...(dateFrom && { date_from: dateFrom }),
      ...(dateTo && { date_to: dateTo }),
    },
    enabled: !!id,
    options: { placeholderData: keepPreviousData, staleTime: 0 },
  });

  if (isLoading && !salesman) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (isError || !salesman) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">{t('salesmen.notFound')}</p>
        {id && (
          <Button variant="outline" onClick={() => navigate('/salesmen')} className="mt-4">
            <ArrowLeft className="h-4 w-4 me-2" />
            {t('common.back')}
          </Button>
        )}
      </div>
    );
  }

  const isActive = salesman.is_active !== false;
  const afnSymbol = resolveCurrencySymbol(1) || FALLBACK_BASE_SYMBOL;
  const formatAfn = (value: number) =>
    `${formatOrderNumeric(value)} ${afnSymbol}`;

  const entryReference = (row: SalesmanStatementEntry) => row.entry_type === 'sale'
    ? row.invoice_number || `#${row.sale_id}`
    : row.reference_number?.trim() || `#${row.payment_id}`;
  const entries = commission?.entries || [];
  const columns: TableColumn<SalesmanStatementEntry>[] = [
    { key: 'date', title: t('salesmen.date'), render: value => <ListDate value={value} /> },
    { key: 'commission_amount', title: t('salesmen.commissionAfn', 'Commission (AFN)'),
      render: (value, row) => row.entry_type === 'sale' ? <span className="font-semibold tabular-nums">{formatAfn(Number(value))}</span> : '—' },
    { key: 'invoice_number', title: t('salesmen.statementReference', 'Reference'), render: (_value, row) =>
      <Button variant="link" className="h-auto p-0" onClick={() => navigate(row.entry_type === 'sale'
        ? `/sales/${row.sale_id}` : `/salesman-commission-payments/${row.payment_id}`)}>
        {entryReference(row)}
      </Button> },
    { key: 'info', title: t('salesmen.statementInfo', 'Description'), render: (_value, row) =>
      row.entry_type === 'sale'
        ? t('salesmen.statementSale', 'Sale commission')
        : t('salesmen.statementPaid', 'Payment') },
    { key: 'payment_amount', title: t('salesmen.statementPayment', 'Payment (AFN)'),
      render: (value, row) => row.entry_type === 'payment' ? <Button variant="link" className="h-auto p-0 tabular-nums" onClick={() => navigate(`/salesman-commission-payments/${row.payment_id}`)}>{formatAfn(Number(value))}</Button> : '—' },
  ];

  const printStatement = () => {
    if (!commission || statementLoading || statementFetching || statementError) return;
    const description = (row: SalesmanStatementEntry) => row.entry_type === 'sale'
      ? t('salesmen.statementSale', 'Sale commission') : t('salesmen.statementPaid', 'Payment');
    const headers = [t('salesmen.date'), t('salesmen.commissionAfn', 'Commission (AFN)'),
      t('salesmen.statementReference', 'Reference'), t('salesmen.statementInfo', 'Description'), t('salesmen.statementPayment', 'Payment (AFN)')];
    const rows = entries.map(row => [
      formatAppDate(row.date, calendar, { language }),
      row.entry_type === 'sale' ? formatAfn(Number(row.commission_amount)) : '—',
      entryReference(row),
      description(row),
      row.entry_type === 'payment' ? formatAfn(Number(row.payment_amount)) : '—',
    ]);
    const summary = [
      ...(dateFrom ? [[t('salesmen.openingBalance', 'Opening balance'), commission.opening_balance]] : []),
      [t('salesmen.totalCommission'), commission.commission_earned ?? commission.total_commission],
      [t('salesmen.commissionPaid'), commission.commission_paid],
      [t('salesmen.commissionBalance'), commission.commission_balance],
    ];
    const periodLabel = [dateFrom, dateTo].filter(Boolean)
      .map(date => formatAppDate(date, calendar, { language })).join(' – ');
    const contact = [salesman.phone, salesman.email, salesman.address].filter(Boolean).join(' · ');
    printHtmlInHiddenIframe(`<!DOCTYPE html><html dir="${direction}" lang="${escapeHtml(language)}"><head>
      <meta charset="utf-8"><title>${escapeHtml(t('salesmen.commissionStatement'))}</title>
      <style>
        @page { size: A4; margin: 12mm; }
        * { box-sizing: border-box; }
        body { font-family: ${getFontStacks(language).body}; font-size: 10pt; color: #172033; margin: 0; }
        .letterhead { display: flex; align-items: center; gap: 16px; padding-bottom: 16px; border-bottom: 3px solid #1F76D1; }
        .logo { width: 76px; height: 76px; object-fit: contain; }
        h1 { font-size: 16pt; margin: 0 0 6px; }
        h2 { font-size: 13pt; margin: 20px 0 6px; }
        p { margin: 4px 0; }
        .muted { color: #596579; font-size: 9pt; }
        .details { display: flex; justify-content: space-between; gap: 20px; margin: 0 0 18px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th, td { border-bottom: 1px solid #dbe1e8; padding: 10px 8px; text-align: start; overflow-wrap: anywhere; vertical-align: top; }
        th { background: #edf2f7; font-size: 9pt; border-top: 1px solid #dbe1e8; }
        tbody tr:nth-child(even) { background: #f8fafc; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; }
        .summary { margin-top: 20px; break-inside: avoid; border: 1px solid #cbd5e1; }
        .summary td { font-size: 12pt; font-weight: bold; font-variant-numeric: tabular-nums; background: #f8fafc; }
        .summary th, .summary td { border-inline-end: 1px solid #dbe1e8; }
      </style></head><body>
      <header class="letterhead">
        <img class="logo" src="${escapeHtml(new URL(BRAND.logo, window.location.origin).href)}" alt="${escapeHtml(BRAND.shortName)}">
        <div><h1>${escapeHtml(BRAND.name)}</h1><p class="muted">${escapeHtml(BRAND.subtitle)} · ${escapeHtml(BRAND.location)}</p></div>
      </header>
      <h2>${escapeHtml(t('salesmen.commissionStatement'))}</h2>
      <div class="details"><div><p><strong>${escapeHtml(salesman.name)}</strong></p>${contact ? `<p class="muted">${escapeHtml(contact)}</p>` : ''}</div>
        <div class="muted">${periodLabel ? `<p>${escapeHtml(periodLabel)}</p>` : ''}<p>${escapeHtml(t('salesmen.printedOn', 'Printed on'))}: ${escapeHtml(formatAppDate(new Date(), calendar, { language }))}</p></div>
      </div>
      <table><thead><tr>${headers.map(header => `<th scope="col">${escapeHtml(header)}</th>`).join('')}</tr></thead>
      <tbody>${rows.length ? rows.map(row => `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="5">${escapeHtml(t('salesmen.noStatementEntries'))}</td></tr>`}</tbody></table>
      <table class="summary"><thead><tr>${summary.map(([label]) => `<th scope="col">${escapeHtml(label)}</th>`).join('')}</tr></thead>
      <tbody><tr>${summary.map(([, value]) => `<td>${escapeHtml(formatAfn(Number(value || 0)))}</td>`).join('')}</tr></tbody></table>
      </body></html>`);
  };

  return (
    <div className="container mx-auto max-w-7xl p-4 sm:p-6 space-y-4">
      <Card className="overflow-hidden">
        <div className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate('/salesmen')}>
              <ArrowLeft className="h-4 w-4 me-2" />
              {t('common.back')}
            </Button>
            <h1 className="text-lg font-bold">{t('salesmen.salesmanDetails')}</h1>
            <div className="ms-auto flex flex-wrap gap-2">
              {Number(
                commission?.lifetime_commission_balance ?? commission?.commission_balance ?? 0,
              ) > 0 && (
                <Button
                  size="sm"
                  onClick={() =>
                    navigate(`/salesman-commission-payments/add?salesman_id=${id}`)
                  }
                >
                  <Wallet className="h-4 w-4 me-1.5" />
                  {t('salesmen.payCommission')}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => navigate(`/salesmen/${id}/edit`)}>
                {t('common.edit')}
              </Button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <UserCheck className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold truncate">{salesman.name}</h2>
                <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted-foreground">
                  {salesman.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      {salesman.email}
                    </span>
                  )}
                  {salesman.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      {salesman.phone}
                    </span>
                  )}
                  {salesman.address && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {salesman.address}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Badge variant={isActive ? 'default' : 'secondary'}>
              {isActive ? t('salesmen.active') : t('salesmen.inactive')}
            </Badge>
          </div>

          <DetailDateRangeBar
            period={period}
            onPeriodChange={setPeriod}
            dateFrom={period === 'custom' ? customFrom : dateFrom}
            dateTo={period === 'custom' ? customTo : dateTo}
            onDateFromChange={setCustomFrom}
            onDateToChange={setCustomTo}
            onClear={clearPeriod}
          />
        </div>
      </Card>

      <Card className="overflow-hidden shadow-none">
        <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-y-0 sm:[&>div+div]:border-s">
          {[
            [t('salesmen.totalCommission'), commission?.commission_earned ?? commission?.total_commission ?? 0],
            [t('salesmen.commissionPaid'), commission?.commission_paid ?? 0],
            [t('salesmen.commissionBalance'), commission?.commission_balance ?? 0],
          ].map(([label, value], index) => (
            <div key={label} className="px-5 py-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${index === 2 ? 'text-primary' : ''}`}>
                {formatAfn(Number(value))}
              </p>
            </div>
          ))}
        </div>
        {dateFrom && <div className="border-t bg-muted/20 px-5 py-2 text-xs text-muted-foreground">{t('salesmen.openingBalance', 'Opening balance')}: {formatAfn(Number(commission?.opening_balance || 0))}</div>}
      </Card>
      {statementError && <p className="text-sm text-destructive">{t('salesmen.statementFailed', 'Unable to load the commission statement.')}</p>}
      <DataTable
        data={entries.slice((page - 1) * 50, page * 50)} columns={columns}
        title={t('salesmen.commissionStatement', 'Commission statement')}
        headerActions={
          <Button variant="outline" size="sm" onClick={printStatement} disabled={!commission || statementLoading || statementFetching || statementError}>
            <Printer className="h-4 w-4 me-2" />
            {t('common.print', 'Print')}
          </Button>
        }
        loading={statementLoading || statementFetching}
        pagination={{ current: page, pageSize: 50, total: entries.length, onPageChange: setPage }}
        emptyTitle={t('salesmen.noStatementEntries', 'No commissions or payments in this period.')}
      />
    </div>
  );
};

export default SalesmanDetails;
