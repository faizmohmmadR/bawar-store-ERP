import {
  Banknote,
  CircleDollarSign,
  HandCoins,
  Package,
  PieChart as PieChartIcon,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/formatNumber';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

export type BreakdownRow = { type: string; amount: number; count?: number };
export type ProfitBridgeRow = { label: string; amount: number };
export type TopProduct = {
  product_id: number;
  name: string;
  barcode?: string;
  quantity_pieces: number;
  revenue_base: number;
  cogs_base: number;
  gross_profit_base: number;
};

export type OperationalReportResponse = {
  currency: string;
  currency_symbol?: string;
  period?: { start_date?: string; end_date?: string; label?: string };
  notes?: string[];
  kpis: {
    net_billed_afn?: number;
    collected_afn?: number;
    uncollected_period_afn?: number;
    gross_profit_afn?: number;
    net_profit_afn?: number;
    expenses_paid_afn?: number;
    payroll_paid_afn?: number;
    purchases_received_afn?: number;
    stock_value_afn?: number;
    stock_on_hand?: number;
    cash_balance_afn?: number;
    accounts_receivable_afn?: number;
    accounts_payable_afn?: number;
    // legacy aliases
    accrual_revenue?: number;
    sales_invoices?: number;
    returns?: number;
    cash_from_sales?: number;
    credit_sales?: number;
    gross_profit?: number;
    net_profit?: number;
    cash_balance?: number;
    accounts_receivable?: number;
    accounts_payable?: number;
  };
  income: {
    billed_afn: number;
    returns_afn: number;
    net_billed_afn: number;
    accrual_revenue_afn: number;
    collected_afn: number;
    uncollected_period_afn: number;
    customer_cash_received_afn?: number;
    invoice_cash_received_afn?: number;
    advances_received_afn?: number;
    accounts_receivable_outstanding_afn: number;
    collection_rate_pct: number;
    sources: BreakdownRow[];
    collection_breakdown: BreakdownRow[];
    billed_breakdown: BreakdownRow[];
  };
  expenses: {
    cogs_afn: number;
    operating_expenses_gl_afn: number;
    total_pnl_costs_afn: number;
    expenses_paid_afn: number;
    payroll_paid_afn: number;
    advances_paid_afn: number;
    purchase_payments_afn: number;
    total_cash_out_operating_afn: number;
    by_category: Array<{ name: string; amount: number; count: number }>;
    cash_breakdown: BreakdownRow[];
    pnl_breakdown: BreakdownRow[];
  };
  operations: {
    purchases_received_afn: number;
    purchase_payments_afn: number;
    purchases_unpaid_afn: number;
    accounts_payable_outstanding_afn: number;
    payroll_paid_afn?: number;
    advances_paid_afn?: number;
    expenses_paid_afn?: number;
    stock?: {
      product_balance_count?: number;
      total_on_hand?: number;
      total_value_afn?: number;
      low_stock_count?: number;
    };
  };
  profit: {
    revenue_afn: number;
    cogs_afn: number;
    gross_profit_afn: number;
    operating_expenses_afn: number;
    net_profit_afn: number;
    bridge: ProfitBridgeRow[];
  };
  cash: {
    cash_in_afn: number;
    cash_out_afn: number;
    net_cash_flow_afn: number;
    cash_balance_afn: number;
    in_breakdown: BreakdownRow[];
    out_breakdown: BreakdownRow[];
  };
  financing: {
    loans_received: number;
    loans_given: number;
    principal_received?: number;
    principal_given?: number;
    noncash_received?: number;
    noncash_given?: number;
    loan_collections: number;
    loan_repayments: number;
    loans_receivable: number;
    loans_payable: number;
    note?: string;
  };
  top_products: TopProduct[];
};

const CHART_COLORS = [
  '#16a34a',
  '#2563eb',
  '#ea580c',
  '#7c3aed',
  '#0891b2',
  '#dc2626',
  '#ca8a04',
  '#4f46e5',
];

function Money({
  value,
  currency,
  className,
}: {
  value: number;
  currency: string;
  className?: string;
}) {
  return (
    <span className={cn('tabular-nums font-semibold', className)}>
      {formatNumber(value || 0)}{' '}
      <span className="text-sm font-medium text-muted-foreground">{currency}</span>
    </span>
  );
}

function KpiCard({
  title,
  value,
  hint,
  currency,
  icon,
  tone = 'default',
  suffix,
}: {
  title: string;
  value: number;
  hint?: string;
  currency?: string;
  icon: React.ReactNode;
  tone?: 'default' | 'good' | 'bad' | 'neutral';
  suffix?: string;
}) {
  const toneClass =
    tone === 'good'
      ? 'border-l-emerald-500'
      : tone === 'bad'
        ? 'border-l-red-500'
        : tone === 'neutral'
          ? 'border-l-sky-500'
          : 'border-l-primary';
  const valueClass =
    tone === 'good'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'bad'
        ? 'text-red-700 dark:text-red-400'
        : 'text-foreground';

  return (
    <Card className={cn('h-full border-l-4 shadow-sm', toneClass)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </p>
            <p className={cn('text-xl sm:text-2xl font-semibold tabular-nums', valueClass)}>
              {formatNumber(value || 0)}
              {suffix ? (
                <span className="text-sm font-medium text-muted-foreground"> {suffix}</span>
              ) : currency ? (
                <span className="text-sm font-medium text-muted-foreground"> {currency}</span>
              ) : null}
            </p>
            {hint ? <p className="text-xs text-muted-foreground leading-snug">{hint}</p> : null}
          </div>
          <div className="rounded-lg bg-muted/60 p-2 text-muted-foreground shrink-0">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionTable({
  title,
  description,
  rows,
  currency,
  empty,
}: {
  title: string;
  description?: string;
  rows: Array<{ label: string; amount: number; count?: number; meta?: string }>;
  currency: string;
  empty?: string;
}) {
  return (
    <Card className="shadow-sm h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="pt-0">
        {!rows.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{empty || '—'}</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {rows.map((row) => (
              <div
                key={`${row.label}-${row.meta || ''}`}
                className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{row.label}</p>
                  {row.meta ? (
                    <p className="text-xs text-muted-foreground">{row.meta}</p>
                  ) : row.count != null && row.count > 0 ? (
                    <p className="text-xs text-muted-foreground">{row.count} records</p>
                  ) : null}
                </div>
                <Money value={row.amount} currency={currency} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function OperationalReportView({
  data,
  compact = false,
}: {
  data: OperationalReportResponse;
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const currency = data.currency || 'AFN';
  const kpis = data.kpis || {};
  const income = data.income;
  const expenses = data.expenses;
  const ops = data.operations;
  const profit = data.profit;
  const cash = data.cash;
  const financing = data.financing;

  const sourceChart = (income?.sources || []).filter((r) => Math.abs(r.amount) > 0);
  const expenseChart = (expenses?.by_category || [])
    .map((r) => ({ type: r.name, amount: r.amount, count: r.count }))
    .filter((r) => r.amount > 0)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title={t('reports.netBilled', 'Sales this period')}
          value={income?.net_billed_afn ?? data.kpis.net_billed_afn ?? 0}
          currency={currency}
          hint={t('reports.netBilledHint', 'Total sales bills this period, after returns')}
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <KpiCard
          title={t('reports.collected', 'Money collected')}
          value={income?.collected_afn ?? 0}
          currency={currency}
          hint={`${t('reports.collectionRate', 'Paid share')}: ${formatNumber(income?.collection_rate_pct || 0)}% · ${t('reports.collectedHint', "How much of this period's sales bills customers already paid")}`}
          icon={<HandCoins className="h-4 w-4" />}
          tone="good"
        />
        <KpiCard
          title={t('reports.uncollected', 'Still unpaid')}
          value={income?.uncollected_period_afn ?? 0}
          currency={currency}
          hint={t('reports.uncollectedHint', "How much of this period's sales bills is still unpaid. Collected + unpaid = sales")}
          icon={<CircleDollarSign className="h-4 w-4" />}
          tone="bad"
        />
        <KpiCard
          title={t('reports.netProfit', 'Profit')}
          value={profit?.net_profit_afn ?? data.kpis.net_profit_afn ?? 0}
          currency={currency}
          hint={t('reports.accrualProfitHint', 'Profit from sales and costs in the books — not only cash received')}
          icon={<TrendingUp className="h-4 w-4" />}
          tone={(profit?.net_profit_afn ?? 0) >= 0 ? 'good' : 'bad'}
        />
      </div>

      {!compact && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title={t('reports.purchases', 'Purchases')}
            value={ops?.purchases_received_afn ?? kpis.purchases_received_afn ?? 0}
            currency={currency}
            hint={t('reports.purchasesReceivedHint', 'Stock received from vendors this period')}
            icon={<ShoppingCart className="h-4 w-4" />}
            tone="neutral"
          />
          <KpiCard
            title={t('reports.stockValue', 'Stock value')}
            value={ops?.stock?.total_value_afn ?? kpis.stock_value_afn ?? 0}
            currency={currency}
            hint={`${formatNumber(ops?.stock?.total_on_hand ?? kpis.stock_on_hand ?? 0)} ${t('reports.onHand', 'on hand')}`}
            icon={<Package className="h-4 w-4" />}
            tone="neutral"
          />
          <KpiCard
            title={t('reports.expensesPaid', 'Money paid for costs')}
            value={kpis.expenses_paid_afn ?? 0}
            currency={currency}
            hint={t('reports.expensesPaidHint', 'Cash paid this period for costs, salaries, advances, refunds and owner withdrawals — not buying stock')}
            icon={<TrendingDown className="h-4 w-4" />}
            tone="bad"
          />
          <KpiCard
            title={t('reports.cashBalance', 'Cash in books')}
            value={cash?.cash_balance_afn ?? 0}
            currency={currency}
            hint={t(
              'reports.cashBalanceHint',
              'Cash + bank + sarafi in the books today. This is not Money collected minus costs.',
            )}
            icon={<Wallet className="h-4 w-4" />}
            tone={(cash?.cash_balance_afn ?? 0) >= 0 ? 'good' : 'bad'}
          />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionTable
          title={t('reports.incomeSources', 'Sales by type')}
          description={t('reports.incomeSourcesHint', 'Sales bills this period by type (AFN)')}
          currency={currency}
          rows={(income?.sources || []).map((r) => ({
            label: r.type,
            amount: r.amount,
            count: r.count,
          }))}
          empty={t('reports.noIncomeSources', 'No sales in this period')}
        />
        <SectionTable
          title={t('reports.collectionStatus', 'Payment status')}
          description={t(
            'reports.collectionStatusHint',
            'Invoice settlement vs unpaid period invoices; cash received (incl. advances) is listed separately; AR is end balance',
          )}
          currency={currency}
          rows={[
            ...(income?.collection_breakdown || []).map((r) => ({
              label: r.type,
              amount: r.amount,
              count: r.count,
            })),
            {
              label: t('reports.arOutstanding', 'AR outstanding (end)'),
              amount: income?.accounts_receivable_outstanding_afn || 0,
              meta: t('reports.glBalance', 'GL balance'),
            },
          ]}
        />
      </div>

      {!compact && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <PieChartIcon className="h-4 w-4" />
                {t('reports.incomeSourcesChart', 'Income by source')}
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[280px]">
              {sourceChart.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sourceChart}
                      dataKey="amount"
                      nameKey="type"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={2}
                    >
                      {sourceChart.map((_, idx) => (
                        <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${formatNumber(v)} ${currency}`, '']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground h-full flex items-center justify-center">
                  —
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('reports.expenseCategories', 'Expense categories')}</CardTitle>
              <CardDescription>
                {t('reports.expenseCategoriesHint', 'Cash operating expenses by category (AFN)')}
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[280px]">
              {expenseChart.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expenseChart} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="type" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`${formatNumber(v)} ${currency}`, '']} />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                      {expenseChart.map((_, idx) => (
                        <Cell key={idx} fill={CHART_COLORS[(idx + 2) % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground h-full flex items-center justify-center">
                  —
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <SectionTable
        title={t('reports.expensesByCategory', 'Expenses by category')}
        description={t(
          'reports.expensesByCategoryHint',
          'Operating expenses grouped by expense category (AFN)',
        )}
        currency={currency}
        rows={(expenses?.by_category || [])
          .filter((r) => Math.abs(r.amount) > 0)
          .map((r) => ({
            label: r.name,
            amount: r.amount,
            count: r.count,
          }))}
        empty={t('reports.noExpenseCategories', 'No categorized expenses in this period')}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionTable
          title={t('reports.expensesCash', 'Cash paid for costs')}
          description={t('reports.expensesCashHint', 'Cash paid this period for business costs — not for buying stock')}
          currency={currency}
          rows={(expenses?.cash_breakdown || [])
            .filter((r) => Math.abs(r.amount) > 0)
            .map((r) => ({ label: r.type, amount: r.amount, count: r.count }))}
        />
        <SectionTable
          title={t('reports.expensesPnl', 'Costs in profit')}
          description={t('reports.expensesPnlHint', 'Cost of goods sold and other business costs from the books')}
          currency={currency}
          rows={(expenses?.pnl_breakdown || [])
            .filter((r) => Math.abs(r.amount) > 0)
            .map((r) => ({ label: r.type, amount: r.amount, count: r.count }))}
        />
      </div>

      {!compact && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t('reports.purchases', 'Purchases')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t('reports.received', 'Received')}</span>
                  <Money value={ops?.purchases_received_afn || 0} currency={currency} />
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t('reports.paid', 'Paid')}</span>
                  <Money value={ops?.purchase_payments_afn || 0} currency={currency} />
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t('reports.unpaidPeriod', 'Unpaid (period)')}</span>
                  <Money value={ops?.purchases_unpaid_afn || 0} currency={currency} />
                </div>
                <div className="flex justify-between gap-2 border-t pt-2">
                  <span className="text-muted-foreground">{t('reports.apOutstanding', 'AP outstanding')}</span>
                  <Money value={ops?.accounts_payable_outstanding_afn || 0} currency={currency} />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t('reports.stock', 'Stock')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t('reports.onHand', 'On hand')}</span>
                  <span className="font-semibold tabular-nums">
                    {formatNumber(ops?.stock?.total_on_hand || 0)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t('stock.skuCount', 'Products with stock')}</span>
                  <span className="font-semibold tabular-nums">
                    {ops?.stock?.product_balance_count || 0}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t('stock.lowStock', 'Low stock')}</span>
                  <span className="font-semibold tabular-nums">
                    {ops?.stock?.low_stock_count || 0}
                  </span>
                </div>
                <div className="flex justify-between gap-2 border-t pt-2">
                  <span className="text-muted-foreground">{t('reports.stockValue', 'Stock value')}</span>
                  <Money value={ops?.stock?.total_value_afn || 0} currency={currency} />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" />
                  {t('reports.hrPayroll', 'HR & Payroll')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t('reports.salaryPaid', 'Salary paid')}</span>
                  <Money value={ops?.payroll_paid_afn || 0} currency={currency} />
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t('reports.advancesPaid', 'Advances paid')}</span>
                  <Money value={ops?.advances_paid_afn || 0} currency={currency} />
                </div>
                <div className="flex justify-between gap-2 border-t pt-2">
                  <span className="text-muted-foreground">{t('reports.expensesPaid', 'Expenses paid')}</span>
                  <Money value={ops?.expenses_paid_afn || 0} currency={currency} />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t('reports.profitSnapshot', 'Profit snapshot')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(profit?.bridge || []).map((row) => (
                  <div key={row.label} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{row.label}</span>
                    <Money value={row.amount} currency={currency} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {t(
                'reports.periodCashMovementHint',
                'Only money that moved this period — not the Cash in books total above',
              )}
            </p>
            <div className="grid gap-4 xl:grid-cols-2">
              <SectionTable
                title={t('reports.cashIn', 'Money came in')}
                currency={currency}
                rows={(cash?.in_breakdown || [])
                  .filter((r) => Math.abs(r.amount) > 0)
                  .map((r) => ({ label: r.type, amount: r.amount, count: r.count }))}
              />
              <SectionTable
                title={t('reports.cashOut', 'Money went out')}
                currency={currency}
                rows={(cash?.out_breakdown || [])
                  .filter((r) => Math.abs(r.amount) > 0)
                  .map((r) => ({ label: r.type, amount: r.amount, count: r.count }))}
              />
            </div>
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    {t('reports.financingSection', 'Financing (Loans)')}
                  </CardTitle>
                  <CardDescription>
                    {financing?.note ||
                      t(
                        'reports.loanNotIncomeNote',
                        'Loans are financing/cash — not sales income or profit',
                      )}
                  </CardDescription>
                </div>
                <Badge variant="secondary">{t('reports.notProfit', 'Not P&L')}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  {
                    label: t('reports.loanPrincipalReceived', 'Loan principal received'),
                    value: financing?.principal_received || 0,
                  },
                  {
                    label: t('reports.loanPrincipalGiven', 'Loan principal given'),
                    value: financing?.principal_given || 0,
                  },
                  {
                    label: t('reports.loansReceived', 'Loans Received'),
                    value: financing?.loans_received || 0,
                  },
                  {
                    label: t('reports.loansGiven', 'Loans Given'),
                    value: financing?.loans_given || 0,
                  },
                  {
                    label: t('reports.loanCollections', 'Collections'),
                    value: financing?.loan_collections || 0,
                  },
                  {
                    label: t('reports.loanRepayments', 'Repayments'),
                    value: financing?.loan_repayments || 0,
                  },
                  {
                    label: t('reports.loansReceivable', 'Loans Receivable'),
                    value: financing?.loans_receivable || 0,
                  },
                  {
                    label: t('reports.loansPayable', 'Loans Payable'),
                    value: financing?.loans_payable || 0,
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border p-3 bg-muted/20">
                    <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                    <Money value={item.value} currency={currency} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Banknote className="h-4 w-4" />
                {t('reports.topProducts', 'Top products')}
              </CardTitle>
              <CardDescription>
                {t('reports.topProductsHint', 'Highest volume lines with AFN revenue and COGS')}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2 text-start font-medium">{t('reports.product', 'Product')}</th>
                    <th className="py-2 text-start font-medium">{t('reports.pieces', 'Pieces')}</th>
                    <th className="py-2 text-start font-medium">{t('reports.revenue', 'Revenue')}</th>
                    <th className="py-2 text-start font-medium">{t('reports.cogs', 'COGS')}</th>
                    <th className="py-2 text-start font-medium">{t('reports.grossProfit', 'Gross profit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.top_products || []).map((p) => (
                    <tr key={p.product_id} className="border-b last:border-0">
                      <td className="py-2 text-start">
                        <p className="font-medium">{p.name}</p>
                        {p.barcode ? (
                          <p className="text-xs text-muted-foreground font-mono">{p.barcode}</p>
                        ) : null}
                      </td>
                      <td className="py-2 text-start tabular-nums">{formatNumber(p.quantity_pieces)}</td>
                      <td className="py-2 text-start tabular-nums">
                        {formatNumber(p.revenue_base)} {currency}
                      </td>
                      <td className="py-2 text-start tabular-nums">
                        {formatNumber(p.cogs_base)} {currency}
                      </td>
                      <td className="py-2 text-start tabular-nums font-semibold">
                        {formatNumber(p.gross_profit_base)} {currency}
                      </td>
                    </tr>
                  ))}
                  {!data.top_products?.length ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground">
                        —
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {data.notes?.length ? (
            <div className="flex flex-wrap gap-2">
              {data.notes.map((note) => (
                <Badge key={note} variant="outline" className="font-normal text-xs whitespace-normal">
                  {note}
                </Badge>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
