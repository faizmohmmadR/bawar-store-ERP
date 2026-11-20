import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Boxes,
  Download,
  FileSpreadsheet,
  Landmark,
  Loader2,
  Printer,
  RefreshCw,
  Scale,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import useFetchObjects from '@/api/useFetchObjects';
import api from '@/api/client';
import { useCalendarPreference, type CalendarSystem } from '@/contexts/CalendarPreferenceContext';
import { useLanguage } from '@/contexts/LanguageContext';
import type { Language } from '@/i18n';
import { formatAppDate, formatAppDateTime } from '@/lib/calendarDate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

type Scope = 'period' | 'cutoff' | 'current' | 'opening';
type ReportDefinition = {
  id: string;
  titleEn: string;
  titleFa: string;
  groupEn: string;
  groupFa: string;
  scope: Scope;
  currency?: boolean;
};

const REPORTS: ReportDefinition[] = [
  { id: 'cash-activity', titleEn: 'Cash, Bank & Sarafi Activity', titleFa: 'حرکت پول نقد، بانک و صرافی', groupEn: 'Cash & Trade', groupFa: 'پول و تجارت', scope: 'period', currency: true },
  { id: 'cash-balances', titleEn: 'Cash Account Balances', titleFa: 'مانده حساب‌های پولی', groupEn: 'Cash & Trade', groupFa: 'پول و تجارت', scope: 'period', currency: true },
  { id: 'customer-invoice-balances', titleEn: 'Customer Invoice Balances', titleFa: 'طلب مشتریان و بیل‌ها', groupEn: 'Cash & Trade', groupFa: 'پول و تجارت', scope: 'period', currency: true },
  { id: 'vendor-invoice-balances', titleEn: 'Vendor Invoice Balances', titleFa: 'بدهی فروشندگان و بیل‌ها', groupEn: 'Cash & Trade', groupFa: 'پول و تجارت', scope: 'period', currency: true },
  { id: 'customer-advance-balances', titleEn: 'Customer Advances', titleFa: 'پیش‌پرداخت مشتریان', groupEn: 'Cash & Trade', groupFa: 'پول و تجارت', scope: 'period', currency: true },
  { id: 'party-loan-balances', titleEn: 'Party Loans & Repayments', titleFa: 'قرض‌ها و بازپرداخت', groupEn: 'Cash & Trade', groupFa: 'پول و تجارت', scope: 'period', currency: true },
  { id: 'party-position-overview', titleEn: 'Party Position Overview', titleFa: 'وضعیت اشخاص', groupEn: 'Cash & Trade', groupFa: 'پول و تجارت', scope: 'period', currency: true },
  { id: 'inventory-movement-review', titleEn: 'Inventory Movement Review', titleFa: 'حرکت مواد و اجناس', groupEn: 'Production & Inventory', groupFa: 'تولید و موجودی', scope: 'period' },
  { id: 'inventory-current-position', titleEn: 'Current Inventory vs GL 1100', titleFa: 'موجودی فعلی و حساب ۱۱۰۰', groupEn: 'Production & Inventory', groupFa: 'تولید و موجودی', scope: 'current' },
  { id: 'inventory-transfer-review', titleEn: 'Stock Transfer Review', titleFa: 'انتقال‌های استاک', groupEn: 'Production & Inventory', groupFa: 'تولید و موجودی', scope: 'cutoff' },
  { id: 'inventory-purchase-bridge', titleEn: 'Purchase–Inventory Bridge', titleFa: 'تطبیق خرید و موجودی', groupEn: 'Production & Inventory', groupFa: 'تولید و موجودی', scope: 'cutoff' },
  { id: 'inventory-sale-bridge', titleEn: 'Sales–COGS Bridge', titleFa: 'تطبیق فروش و قیمت تمام‌شده', groupEn: 'Production & Inventory', groupFa: 'تولید و موجودی', scope: 'cutoff' },
  { id: 'inventory-waste-bridge', titleEn: 'Waste & Salvage Bridge', titleFa: 'ضایعات و بازیافت', groupEn: 'Production & Inventory', groupFa: 'تولید و موجودی', scope: 'cutoff' },
  { id: 'inventory-transformation-bridge', titleEn: 'Production & Packing Bridge', titleFa: 'تولید و پکینگ', groupEn: 'Production & Inventory', groupFa: 'تولید و موجودی', scope: 'cutoff' },
  { id: 'employee-payroll-activity', titleEn: 'Payroll, Overtime & Deductions', titleFa: 'معاش، اضافه‌کاری، غیرحاضری و غذا', groupEn: 'HR & Expenses', groupFa: 'کارمندان و مصارف', scope: 'period', currency: true },
  { id: 'payroll-posting-bridge', titleEn: 'Payroll Posting Bridge', titleFa: 'تطبیق ثبت معاش', groupEn: 'HR & Expenses', groupFa: 'کارمندان و مصارف', scope: 'cutoff' },
  { id: 'expense-activity', titleEn: 'Expense Activity', titleFa: 'مصارف ثبت‌شده', groupEn: 'HR & Expenses', groupFa: 'کارمندان و مصارف', scope: 'period', currency: true },
  { id: 'profit-loss-review', titleEn: 'Profit & Loss', titleFa: 'فایده و زیان', groupEn: 'Accounting', groupFa: 'حسابداری', scope: 'period' },
  { id: 'balance-sheet-review', titleEn: 'Balance Sheet', titleFa: 'بیلانس', groupEn: 'Accounting', groupFa: 'حسابداری', scope: 'cutoff' },
  { id: 'trial-balance-review', titleEn: 'Trial Balance', titleFa: 'تراز آزمایشی', groupEn: 'Accounting', groupFa: 'حسابداری', scope: 'period' },
  { id: 'ledger-balances', titleEn: 'Ledger Balances', titleFa: 'مانده دفتر کل', groupEn: 'Accounting', groupFa: 'حسابداری', scope: 'period', currency: true },
  { id: 'ledger-entries', titleEn: 'Ledger Entries', titleFa: 'روزنامچه', groupEn: 'Accounting', groupFa: 'حسابداری', scope: 'period', currency: true },
  { id: 'ledger-health', titleEn: 'Journal Health', titleFa: 'سلامت ژورنال‌ها', groupEn: 'Controls', groupFa: 'کنترل صحت', scope: 'period' },
  { id: 'source-coverage', titleEn: 'Source Document Coverage', titleFa: 'پوشش اسناد', groupEn: 'Controls', groupFa: 'کنترل صحت', scope: 'cutoff' },
  { id: 'document-reconciliation', titleEn: 'Document–Journal Reconciliation', titleFa: 'تطبیق اسناد و ژورنال', groupEn: 'Controls', groupFa: 'کنترل صحت', scope: 'cutoff' },
  { id: 'settlement-reconciliation', titleEn: 'Settlement Reconciliation', titleFa: 'تطبیق تسویه', groupEn: 'Controls', groupFa: 'کنترل صحت', scope: 'cutoff' },
  { id: 'invoice-reconciliation', titleEn: 'Invoice Reconciliation', titleFa: 'تطبیق بیل‌ها', groupEn: 'Controls', groupFa: 'کنترل صحت', scope: 'cutoff' },
  { id: 'customer-ar-bridge', titleEn: 'Customer AR Bridge', titleFa: 'پل طلب مشتری و دفتر کل', groupEn: 'Controls', groupFa: 'کنترل صحت', scope: 'cutoff', currency: true },
  { id: 'vendor-ap-bridge', titleEn: 'Vendor AP Bridge', titleFa: 'پل بدهی فروشنده و دفتر کل', groupEn: 'Controls', groupFa: 'کنترل صحت', scope: 'cutoff', currency: true },
  { id: 'opening-review', titleEn: 'Opening Balance Review', titleFa: 'بررسی افتتاحیه', groupEn: 'Controls', groupFa: 'کنترل صحت', scope: 'opening' },
];

const GROUP_ICONS: Record<string, typeof Wallet> = {
  'Cash & Trade': Wallet,
  'پول و تجارت': Wallet,
  'Production & Inventory': Boxes,
  'تولید و موجودی': Boxes,
  'HR & Expenses': Users,
  'کارمندان و مصارف': Users,
  Accounting: BookOpen,
  حسابداری: BookOpen,
  Controls: ShieldCheck,
  'کنترل صحت': ShieldCheck,
};

const reportTitle = (report: ReportDefinition, language: string) =>
  language === 'en' ? report.titleEn : report.titleFa;
const reportGroup = (report: ReportDefinition, language: string) =>
  language === 'en' ? report.groupEn : report.groupFa;

type ReportPayload = Record<string, unknown> & {
  meta?: { period?: { start_date?: string | null; end_date?: string | null }; timezone?: string };
  status?: string;
  limitations?: string[];
  count?: number;
  next?: string | null;
  previous?: string | null;
};

const asRows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === 'object' && !Array.isArray(item),
      )
    : [];

const HIDDEN_COLUMNS = new Set([
  'id',
  'journal_id',
  'account_id',
  'currency_id',
  'source_id',
  'source_model',
  'sale_id',
  'purchase_id',
  'expense_id',
  'employee_id',
  'loan_id',
  'deleted_account',
  'needs_rate_review',
  'is_closing_entry',
  'exchange_rate',
  'content_type',
  'object_id',
  'gl_account_id',
  'pk',
  'uuid',
]);

const COLUMN_PRIORITY = [
  'entry_date',
  'date',
  'reference_number',
  'reference',
  'code',
  'account_code',
  'account_name',
  'name',
  'party_name',
  'customer_name',
  'vendor_name',
  'employee_name',
  'product_name',
  'description',
  'debit',
  'credit',
  'base_debit',
  'base_credit',
  'amount',
  'balance',
  'quantity',
  'difference',
  'status',
  'currency',
  'category',
];

const COLUMN_LABELS_EN: Record<string, string> = {
  entry_date: 'Date',
  date: 'Date',
  reference_number: 'Reference',
  reference: 'Reference',
  code: 'Code',
  account_code: 'Account',
  account_name: 'Account name',
  name: 'Name',
  party_name: 'Person',
  customer_name: 'Customer',
  vendor_name: 'Vendor',
  employee_name: 'Employee',
  product_name: 'Product',
  description: 'Description',
  debit: 'Debit',
  credit: 'Credit',
  base_debit: 'Debit (AFN)',
  base_credit: 'Credit (AFN)',
  amount: 'Amount',
  balance: 'Balance',
  quantity: 'Qty',
  difference: 'Difference',
  status: 'Status',
  currency: 'Currency',
  category: 'Type',
};

const COLUMN_LABELS_FA: Record<string, string> = {
  entry_date: 'تاریخ',
  date: 'تاریخ',
  reference_number: 'شماره',
  reference: 'شماره',
  code: 'کد',
  account_code: 'حساب',
  account_name: 'نام حساب',
  name: 'نام',
  party_name: 'شخص',
  customer_name: 'مشتری',
  vendor_name: 'فروشنده',
  employee_name: 'کارمند',
  product_name: 'محصول',
  description: 'شرح',
  debit: 'بدهکار',
  credit: 'بستانکار',
  base_debit: 'بدهکار (افغانی)',
  base_credit: 'بستانکار (افغانی)',
  amount: 'مبلغ',
  balance: 'مانده',
  quantity: 'تعداد',
  difference: 'تفاوت',
  status: 'وضعیت',
  currency: 'ارز',
  category: 'نوع',
};

const isPlainValue = (value: unknown) =>
  value === null ||
  value === undefined ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

const DATE_COLUMN_KEYS = new Set([
  'entry_date',
  'date',
  'start_date',
  'end_date',
  'payment_date',
  'purchase_date',
  'sale_date',
  'created_at',
  'updated_at',
  'posted_at',
  'first_returned_at',
  'last_returned_at',
]);

const looksLikeDateValue = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return true;
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return true;
  return false;
};

const isDateColumn = (key: string, value?: unknown) =>
  DATE_COLUMN_KEYS.has(key) ||
  key.endsWith('_date') ||
  key.endsWith('_at') ||
  looksLikeDateValue(value);

const formatReportDateValue = (
  value: unknown,
  calendar: CalendarSystem,
  language: Language,
): string => {
  if (value === null || value === undefined || value === '') return '—';
  const raw = String(value);
  if (raw.includes('T') || /\d{2}:\d{2}/.test(raw)) {
    return formatAppDateTime(raw, calendar, language);
  }
  return formatAppDate(raw, calendar, { language });
};

const display = (
  value: unknown,
  options?: { column?: string; calendar?: CalendarSystem; language?: Language },
): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (
    options?.calendar &&
    options?.language &&
    options.column &&
    isDateColumn(options.column, value)
  ) {
    return formatReportDateValue(value, options.calendar, options.language);
  }
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  if (typeof value === 'string') {
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      const num = Number(value);
      return Number.isInteger(num)
        ? num.toLocaleString()
        : num.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }
    return value;
  }
  if (typeof value === 'object') return '—';
  return String(value);
};

const humanLabel = (key: string, isEn: boolean) => {
  const map = isEn ? COLUMN_LABELS_EN : COLUMN_LABELS_FA;
  if (map[key]) return map[key];
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const pickColumns = (rows: Record<string, unknown>[], showAll: boolean): string[] => {
  const present = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((key) => {
    if (HIDDEN_COLUMNS.has(key) || key.endsWith('_id')) return false;
    return rows.some((row) => {
      const value = row[key];
      return isPlainValue(value) && value !== null && value !== undefined && value !== '';
    });
  });

  const ranked = [
    ...COLUMN_PRIORITY.filter((key) => present.includes(key)),
    ...present.filter((key) => !COLUMN_PRIORITY.includes(key)),
  ];

  if (showAll) return ranked;
  return ranked.slice(0, 6);
};

const csvCell = (value: unknown): string => {
  const raw = display(value);
  const safe =
    /^[\s]*[=+@]/.test(raw) || (/^[\s]*-/.test(raw) && !/^-\d+(\.\d+)?$/.test(raw))
      ? `'${raw}`
      : raw;
  return `"${safe.replace(/"/g, '""')}"`;
};

function exportCsv(name: string, rows: Record<string, unknown>[], period: string) {
  const columns = Array.from(new Set(rows.flatMap(Object.keys)));
  const lines = [
    [csvCell('Report'), csvCell(name)],
    [csvCell('Period'), csvCell(period)],
    columns.map(csvCell),
    ...rows.map((row) => columns.map((key) => csvCell(row[key]))),
  ];
  const blob = new Blob(['\uFEFF', lines.map((line) => line.join(',')).join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `report-v2-${name}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const SOURCE_PATHS: Record<string, string> = {
  sales: '/sales',
  sale: '/sales',
  rawmaterialsale: '/raw-material-sales',
  rawmaterialpurchase: '/purchases',
  rawmaterialprocess: '/raw-material-processes',
  packingrun: '/packing',
  payroll: '/payroll',
  expense: '/expenses',
  withdrawal: '/withdrawals',
  loan: '/loans',
  return: '/returns',
  stock: '/stock',
  storagetank: '/storage-tanks',
  damagedmaterial: '/damaged',
  employee: '/employees',
};

function sourceLink(row: Record<string, unknown>): string | null {
  const model = typeof row.source_model === 'string' ? row.source_model.toLowerCase() : '';
  const id = row.source_id;
  if (model && SOURCE_PATHS[model] && Number.isInteger(Number(id)) && Number(id) > 0) {
    return `${SOURCE_PATHS[model]}/${id}`;
  }
  const direct: Array<[string, string]> = [
    ['sale_id', '/sales'],
    ['purchase_id', '/purchases'],
    ['expense_id', '/expenses'],
    ['employee_id', '/employees'],
    ['loan_id', '/loans'],
  ];
  for (const [field, path] of direct) {
    const value = row[field];
    if (Number.isInteger(Number(value)) && Number(value) > 0) return `${path}/${value}`;
  }
  return null;
}

function DataTable({
  title,
  rows,
  openLabel,
  isEn,
  language,
  calendar,
}: {
  title: string;
  rows: Record<string, unknown>[];
  openLabel: string;
  isEn: boolean;
  language: Language;
  calendar: CalendarSystem;
}) {
  const [showAllColumns, setShowAllColumns] = useState(false);
  if (!rows.length) return null;

  const allUseful = pickColumns(rows, true);
  const columns = pickColumns(rows, showAllColumns);
  const hasLinks = rows.some((row) => Boolean(sourceLink(row)));
  const moneyColumns = new Set([
    'debit',
    'credit',
    'base_debit',
    'base_credit',
    'amount',
    'balance',
    'difference',
  ]);

  return (
    <Card className="overflow-hidden break-inside-avoid shadow-sm">
      <CardHeader className="border-b bg-muted/20 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold tracking-tight">
              {humanLabel(title, isEn)}
            </CardTitle>
            <Badge variant="secondary" className="tabular-nums">
              {rows.length}
            </Badge>
          </div>
          {allUseful.length > 6 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setShowAllColumns((value) => !value)}
            >
              {showAllColumns
                ? isEn
                  ? 'Fewer columns'
                  : 'ستون‌های کمتر'
                : isEn
                  ? 'More columns'
                  : 'ستون‌های بیشتر'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[32rem] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    key={column}
                    className={cn(
                      'whitespace-nowrap text-xs font-medium',
                      moneyColumns.has(column) && 'text-end',
                    )}
                  >
                    {humanLabel(column, isEn)}
                  </TableHead>
                ))}
                {hasLinks && (
                  <TableHead className="whitespace-nowrap text-xs font-medium">
                    {openLabel}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => {
                const link = sourceLink(row);
                return (
                  <TableRow key={index} className="hover:bg-muted/30">
                    {columns.map((column) => {
                      const value = row[column];
                      const formatted = display(value, { column, calendar, language });
                      const isMoney = moneyColumns.has(column);
                      const isDate = isDateColumn(column, value);
                      const isNumberish =
                        !isDate &&
                        (typeof value === 'number' ||
                          (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)));
                      return (
                        <TableCell
                          key={column}
                          className={cn(
                            'max-w-[14rem] truncate text-sm',
                            isMoney && 'text-end tabular-nums font-medium',
                            isDate && 'whitespace-nowrap tabular-nums text-muted-foreground',
                            column === 'description' && 'max-w-[18rem] whitespace-normal text-foreground',
                          )}
                          title={formatted}
                          dir={isNumberish || isDate ? 'ltr' : undefined}
                        >
                          {formatted}
                        </TableCell>
                      );
                    })}
                    {hasLinks && (
                      <TableCell className="whitespace-nowrap">
                        {link ? (
                          <Link
                            className="text-sm font-medium text-primary hover:underline"
                            to={link}
                          >
                            {openLabel}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReportingV2Page() {
  const { language, t, direction } = useLanguage();
  const { calendar } = useCalendarPreference();
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = REPORTS.find((report) => report.id === searchParams.get('report')) ?? REPORTS[0];
  const selectedTitle = reportTitle(selected, language);
  const groups = Array.from(new Set(REPORTS.map((report) => reportGroup(report, language))));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const isEn = language === 'en';

  const params = useMemo(
    () => ({
      ...((selected.scope === 'period' || selected.scope === 'opening') && startDate
        ? { start_date: startDate }
        : {}),
      ...((selected.scope === 'period' || selected.scope === 'cutoff') && endDate
        ? { end_date: endDate }
        : {}),
      ...(selected.currency && currency ? { currency } : {}),
      page,
    }),
    [selected, startDate, endDate, currency, page],
  );

  const query = useFetchObjects<ReportPayload>({
    queryKey: ['reports-v2', selected.id, JSON.stringify(params)],
    endpoint: `reports/v2/${selected.id}`,
    params,
    enabled: selected.scope !== 'opening' || !!startDate,
    options: { staleTime: 0 },
  });

  const data = query.data;
  const sections = data
    ? Object.entries(data)
        .filter(
          ([key, value]) =>
            !['meta', 'limitations'].includes(key) &&
            Array.isArray(value) &&
            asRows(value).length > 0,
        )
        .map(([key, value]) => ({ key, rows: asRows(value) }))
    : [];
  const facts = data
    ? Object.entries(data).filter(
        ([key, value]) =>
          !['meta', 'limitations', 'next', 'previous'].includes(key) &&
          !Array.isArray(value) &&
          value !== null &&
          typeof value !== 'object',
      )
    : [];
  const periodStart = data?.meta?.period?.start_date
    ? formatAppDate(data.meta.period.start_date, calendar, { language })
    : isEn
      ? 'Start'
      : 'ابتدا';
  const periodEnd = data?.meta?.period?.end_date
    ? formatAppDate(data.meta.period.end_date, calendar, { language })
    : isEn
      ? 'Now'
      : 'اکنون';
  const periodLabel = `${periodStart} — ${periodEnd}`;
  const choose = (id: string) => {
    setSearchParams({ report: id });
    setPage(1);
  };

  const downloadExcel = async () => {
    setExporting(true);
    setExportError(false);
    try {
      const response = await api.get('/reports/v2/export-xlsx/', {
        params: { ...params, report: selected.id },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `report-v2-${selected.id}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  };

  const scopeHint =
    selected.scope === 'current'
      ? isEn
        ? 'Current snapshot — no date filter'
        : 'وضعیت فعلی — بدون فیلتر تاریخ'
      : selected.scope === 'opening'
        ? isEn
          ? 'Needs a start date'
          : 'تاریخ شروع لازم است'
        : selected.scope === 'cutoff'
          ? isEn
            ? 'Uses end date'
            : 'بر اساس تاریخ پایان'
          : isEn
            ? 'Uses date range'
            : 'بر اساس بازه تاریخ';

  return (
    <div
      className="mx-auto max-w-[1800px] space-y-6 p-4 sm:p-6 lg:p-8"
      dir={direction || (isEn ? 'ltr' : 'rtl')}
    >
      <Card className="border-border/70 shadow-sm print:hidden">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Landmark className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-heading font-bold tracking-tight sm:text-2xl">
                  {t('reports.ledgerReports', 'Ledger Reports')}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t(
                    'reports.ledgerReportsHint',
                    'Books reports: trial balance, profit & loss, balance sheet, cash, stock, payroll and checks',
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/reports">
                <Scale className="h-4 w-4" />
                {t('reports.operationalReport', 'Operations Report')}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4" />
                {t('core.dashboard.title', 'Dashboard')}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="print:hidden">
          <Card className="sticky top-4 overflow-hidden shadow-sm">
            <CardHeader className="border-b bg-muted/20 py-4">
              <CardTitle className="text-sm font-semibold">
                {isEn ? 'Choose a report' : 'انتخاب گزارش'}
              </CardTitle>
              <CardDescription>
                {isEn ? `${REPORTS.length} reports in ${groups.length} groups` : `${REPORTS.length} گزارش در ${groups.length} گروه`}
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-[calc(100vh-12rem)] space-y-5 overflow-y-auto p-3">
              {groups.map((group) => {
                const Icon = GROUP_ICONS[group] || BookOpen;
                const items = REPORTS.filter((report) => reportGroup(report, language) === group);
                return (
                  <div key={group} className="space-y-1.5">
                    <div className="flex items-center gap-2 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                      <span>{group}</span>
                    </div>
                    <div className="space-y-0.5">
                      {items.map((report) => {
                        const active = selected.id === report.id;
                        return (
                          <button
                            key={report.id}
                            type="button"
                            onClick={() => choose(report.id)}
                            className={cn(
                              'w-full rounded-lg px-3 py-2 text-start text-sm transition-colors',
                              active
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-foreground hover:bg-muted',
                            )}
                          >
                            {reportTitle(report, language)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </aside>

        <main className="min-w-0 space-y-4">
          <Card className="shadow-sm print:hidden">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{selectedTitle}</h2>
                  <p className="text-xs text-muted-foreground">
                    {scopeHint}
                    {data?.meta?.timezone ? ` · ${data.meta.timezone}` : ''}
                  </p>
                </div>
                <Badge variant="outline">{reportGroup(selected, language)}</Badge>
              </div>

              <div className="grid gap-3 border-t pt-4 sm:grid-cols-2 xl:grid-cols-4">
                {(selected.scope === 'period' || selected.scope === 'opening') && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      {selected.scope === 'opening'
                        ? isEn
                          ? 'Start date (required)'
                          : 'تاریخ شروع (ضروری)'
                        : isEn
                          ? 'From date'
                          : 'از تاریخ'}
                    </Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(event) => {
                        setStartDate(event.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                )}
                {(selected.scope === 'period' || selected.scope === 'cutoff') && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">{isEn ? 'To date' : 'تا تاریخ'}</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(event) => {
                        setEndDate(event.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                )}
                {selected.currency && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">{isEn ? 'Currency' : 'ارز'}</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={currency}
                      onChange={(event) => {
                        setCurrency(event.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">{isEn ? 'All currencies' : 'تمام ارزها'}</option>
                      <option value="1">AFN</option>
                      <option value="2">USD</option>
                      <option value="3">KDR</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => query.refetch()}>
                  <RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} />
                  {isEn ? 'Refresh' : 'تازه‌سازی'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!data}>
                  <Printer className="h-4 w-4" />
                  {isEn ? 'Print' : 'چاپ'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadExcel}
                  disabled={!data || exporting}
                >
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  {exporting
                    ? isEn
                      ? 'Building…'
                      : 'در حال ساخت…'
                    : isEn
                      ? 'Excel'
                      : 'Excel'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    exportCsv(
                      selected.id,
                      sections.flatMap((section) =>
                        section.rows.map((row) => ({ section: section.key, ...row })),
                      ),
                      periodLabel,
                    )
                  }
                  disabled={!sections.length}
                >
                  <Download className="h-4 w-4" />
                  CSV
                </Button>
              </div>
              {exportError && (
                <p role="alert" className="text-sm text-destructive">
                  {isEn
                    ? 'Excel export failed. Check the report dates or your access.'
                    : 'ساخت فایل Excel ناموفق بود. تاریخ یا دسترسی را بررسی کنید.'}
                </p>
              )}
            </CardContent>
          </Card>

          {selected.scope === 'opening' && !startDate && (
            <Card className="border-dashed shadow-sm">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {isEn
                  ? 'Select a start date to review opening balances.'
                  : 'برای بررسی افتتاحیه، تاریخ شروع را انتخاب کنید.'}
              </CardContent>
            </Card>
          )}

          {query.isLoading && (
            <Card className="shadow-sm">
              <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isEn ? 'Loading report…' : 'در حال دریافت گزارش…'}
              </CardContent>
            </Card>
          )}

          {query.isError && (
            <Card className="border-destructive/40 shadow-sm">
              <CardContent className="space-y-1 py-6 text-sm text-destructive" role="alert">
                <p className="font-medium">{isEn ? 'Could not load this report' : 'دریافت گزارش ناموفق بود'}</p>
                <p className="text-destructive/80">
                  {display(query.error?.response?.data ?? query.error?.message)}
                </p>
              </CardContent>
            </Card>
          )}

          {data && (
            <>
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <Badge variant="secondary" className="tabular-nums">
                  {isEn ? 'Period' : 'دوره'}: {periodLabel}
                </Badge>
                {data.status != null && (
                  <Badge variant="outline">{display(data.status)}</Badge>
                )}
              </div>

              {(data.limitations?.length || data.status) && (
                <Card className="border-amber-500/30 bg-amber-500/5 shadow-sm">
                  <CardContent className="space-y-2 py-4 text-sm">
                    <p className="font-medium">
                      {isEn ? 'Notes' : 'یادداشت'}: {display(data.status ?? (isEn ? 'Needs review' : 'نیازمند بررسی'))}
                    </p>
                    {data.limitations?.map((item, index) => (
                      <p key={index} className="text-muted-foreground">
                        {item}
                      </p>
                    ))}
                  </CardContent>
                </Card>
              )}

              {facts.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {facts.map(([key, value]) => (
                    <Card key={key} className="shadow-sm">
                      <CardContent className="space-y-1 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {humanLabel(key, isEn)}
                        </p>
                        <p className="break-all text-lg font-semibold tabular-nums" dir="auto">
                          {display(value)}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {sections.length ? (
                sections.map((section) => (
                  <DataTable
                    key={section.key}
                    title={section.key}
                    rows={section.rows}
                    openLabel={isEn ? 'Open' : 'بازکردن'}
                    isEn={isEn}
                    language={language}
                    calendar={calendar}
                  />
                ))
              ) : (
                <Card className="shadow-sm">
                  <CardContent className="py-12 text-center text-sm text-muted-foreground">
                    {isEn ? 'No rows in this report.' : 'در این گزارش ردیفی نیست.'}
                  </CardContent>
                </Card>
              )}

              {typeof data.count === 'number' && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm print:hidden">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!data.previous || query.isFetching}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    {isEn ? 'Previous' : 'قبلی'}
                  </Button>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {isEn
                      ? `Page ${page} · ${data.count} total`
                      : `صفحه ${page} · جمع ${data.count}`}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!data.next || query.isFetching}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    {isEn ? 'Next' : 'بعدی'}
                  </Button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
