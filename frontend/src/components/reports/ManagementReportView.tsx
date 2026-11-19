import { useMemo } from 'react';
import {
  Banknote,
  CircleDollarSign,
  HandCoins,
  Landmark,
  Package,
  PieChart as PieChartIcon,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
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

export type ManagementReportResponse = {
  currency: string;
  currency_symbol?: string;
  period?: { start_date?: string; end_date?: string; label?: string };
  kpis: {
    accrual_revenue: number;
    sales_invoices: number;
    returns: number;
    cash_from_sales: number;
    credit_sales: number;
    total_purchases?: number;
    cogs: number;
    gross_profit: number;
    operating_expenses: number;
    total_expenses: number;
    net_profit: number;
    total_cash_in: number;
    total_cash_out: number;
    net_cash_flow: number;
    cash_balance: number;
    accounts_receivable: number;
    accounts_payable: number;
  };
  income_breakdown: BreakdownRow[];
  collection_breakdown: BreakdownRow[];
  expense_breakdown: BreakdownRow[];
  expense_by_category: Array<{ name: string; amount: number; count: number }>;
  profit_bridge: ProfitBridgeRow[];
  cash_in_breakdown: BreakdownRow[];
  cash_out_breakdown: BreakdownRow[];
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
  '#db2777',
  '#0f766e',
];

function KpiCard({
  title,
  value,
  hint,
  currency,
  icon,
  tone = 'default',
}: {
  title: string;
  value: number;
  hint?: string;
  currency: string;
  icon: React.ReactNode;
  tone?: 'default' | 'good' | 'bad' | 'neutral';
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
              {formatNumber(value)}{' '}
              <span className="text-sm font-medium text-muted-foreground">{currency}</span>
            </p>
            {hint ? <p className="text-xs text-muted-foreground leading-snug">{hint}</p> : null}
          </div>
          <div className="rounded-lg bg-muted/60 p-2 text-muted-foreground shrink-0">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function BreakdownList({
  rows,
  currency,
  emptyLabel,
}: {
  rows: BreakdownRow[];
  currency: string;
  emptyLabel: string;
}) {
  if (!rows?.length) {
    return <p className="text-sm text-muted-foreground py-6 text-center">{emptyLabel}</p>;
  }
  const max = Math.max(...rows.map((r) => Math.abs(r.amount)), 1);
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.type} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium truncate">{row.type}</span>
            <span className="tabular-nums shrink-0">
              {formatNumber(row.amount)} {currency}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full',
                row.amount < 0 ? 'bg-red-500/80' : 'bg-primary/80',
              )}
              style={{ width: `${Math.min(100, (Math.abs(row.amount) / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ManagementReportView({
  data,
  compact = false,
}: {
  data: ManagementReportResponse;
  compact?: boolean;
}) {
  const { t, direction } = useLanguage();
  const currency = data.currency || 'AFN';
  const kpis = data.kpis;
  const isRtl = direction === 'rtl';

  const expensePieData = useMemo(
    () =>
      (data.expense_breakdown || [])
        .filter((r) => r.amount > 0)
        .map((r) => ({ name: r.type, value: r.amount })),
    [data.expense_breakdown],
  );

  const collectionPieData = useMemo(
    () =>
      (data.collection_breakdown || [])
        .filter((r) => r.amount > 0)
        .map((r) => ({ name: r.type, value: r.amount })),
    [data.collection_breakdown],
  );

  const topProductChart = useMemo(
    () =>
      (data.top_products || []).map((p) => ({
        name: p.name.length > 18 ? `${p.name.slice(0, 16)}…` : p.name,
        fullName: p.name,
        qty: Number(p.quantity_pieces) || 0,
        revenue: Number(p.revenue_base) || 0,
      })),
    [data.top_products],
  );

  const profitBridgeChart = useMemo(
    () =>
      (data.profit_bridge || []).map((row) => ({
        name: row.label,
        amount: Number(row.amount) || 0,
      })),
    [data.profit_bridge],
  );

  const cashOutRows = (data.cash_out_breakdown || []).filter((r) => r.amount !== 0);
  const cashInRows = (data.cash_in_breakdown || []).filter((r) => r.amount !== 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          title={t('reports.accrualRevenue', 'Accrual Revenue')}
          value={kpis.accrual_revenue}
          hint={t(
            'reports.accrualRevenueHint',
            'Sales + other income from ledger (correct P&L income)',
          )}
          currency={currency}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="good"
        />
        <KpiCard
          title={t('reports.cashCollected', 'Cash Collected')}
          value={kpis.cash_from_sales}
          hint={t('reports.cashCollectedHint', 'Sale payments received in period')}
          currency={currency}
          icon={<Banknote className="h-5 w-5" />}
          tone="neutral"
        />
        <KpiCard
          title={t('reports.creditSales', 'On Credit')}
          value={kpis.credit_sales}
          hint={t('reports.onCreditHint', 'Unpaid balance on period sales')}
          currency={currency}
          icon={<HandCoins className="h-5 w-5" />}
        />
        <KpiCard
          title={t('reports.netProfit', 'Profit')}
          value={kpis.net_profit}
          hint={t('reports.netProfitHint', 'Sales minus cost of goods and other costs')}
          currency={currency}
          icon={<CircleDollarSign className="h-5 w-5" />}
          tone={kpis.net_profit >= 0 ? 'good' : 'bad'}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          title={t('reports.grossProfit', 'Gross Profit')}
          value={kpis.gross_profit}
          hint={t('reports.grossProfitHint', 'Sales minus cost of goods sold')}
          currency={currency}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <KpiCard
          title={t('reports.totalPurchases', 'Stock bought')}
          value={kpis.total_purchases || 0}
          hint={t(
            'reports.totalPurchasesHint',
            'Stock bought this period — not a cost until sold',
          )}
          currency={currency}
          icon={<ShoppingCart className="h-5 w-5" />}
          tone="neutral"
        />
        <KpiCard
          title={t('reports.totalExpenses', 'Business costs')}
          value={kpis.total_expenses}
          hint={t('reports.totalExpensesHint', 'Cost of goods sold plus other business costs')}
          currency={currency}
          icon={<TrendingDown className="h-5 w-5" />}
          tone="bad"
        />
        <KpiCard
          title={t('reports.netCashFlow', 'Net money this period')}
          value={kpis.net_cash_flow}
          hint={t('reports.cashInMinusCashOut', 'Money in minus money out this period (not Cash in books)')}
          currency={currency}
          icon={<Wallet className="h-5 w-5" />}
          tone={kpis.net_cash_flow >= 0 ? 'good' : 'bad'}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          title={t('reports.cashBalance', 'Cash in books')}
          value={kpis.cash_balance}
          hint={t(
            'reports.cashBalanceNotCollectedHint',
            'Cash recorded in the books. Not Money collected minus costs. Buying stock, salaries, loans and older days also change it.',
          )}
          currency={currency}
          icon={<Landmark className="h-5 w-5" />}
          tone={kpis.cash_balance >= 0 ? 'good' : 'bad'}
        />
        <KpiCard
          title={t('reports.operatingExpenses', 'Day-to-day costs')}
          value={kpis.operating_expenses}
          hint={t(
            'reports.operatingExpensesHint',
          )}
          currency={currency}
          icon={<TrendingDown className="h-5 w-5" />}
          tone="bad"
        />
        <KpiCard
          title={t('reports.accountsReceivable', 'Customers owe us')}
          value={kpis.accounts_receivable}
          hint={t('reports.accountsReceivableHint', 'How much customers still owe from sales')}
          currency={currency}
          icon={<HandCoins className="h-5 w-5" />}
        />
        <KpiCard
          title={t('reports.accountsPayable', 'We owe vendors')}
          value={kpis.accounts_payable}
          hint={t('reports.accountsPayableHint', 'How much we still owe vendors for purchases')}
          currency={currency}
          icon={<ShoppingCart className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t('reports.expenseBreakdown', 'Expense Breakdown')}
            </CardTitle>
            <CardDescription>
              {t(
                'reports.expenseBreakdownHint',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {expensePieData.length ? (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expensePieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {expensePieData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`${formatNumber(value)} ${currency}`, '']}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : null}
            <BreakdownList
              rows={data.expense_breakdown || []}
              currency={currency}
              emptyLabel={t('reports.noChartData', 'No data for this period')}
            />
          </CardContent>
        </Card>

        <Card className="h-full flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t('reports.cashOutflowsByType', 'Cash Outflows by Type')}
            </CardTitle>
            <CardDescription>
              {t(
                'reports.cashOutflowsHint',
                'Purchase payments, expenses, payroll, advances, and refunds',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <BreakdownList
              rows={cashOutRows}
              currency={currency}
              emptyLabel={t('reports.noChartData', 'No data for this period')}
            />
          </CardContent>
        </Card>
      </div>

      {!compact && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
            <Card className="h-full flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {t('reports.incomeBreakdown', 'Income Breakdown')}
                </CardTitle>
                <CardDescription>
                  {t(
                    'reports.incomeBreakdownHint',
                    'Sales invoices and returns — loans are financing, not income',
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <BreakdownList
                  rows={data.income_breakdown || []}
                  currency={currency}
                  emptyLabel={t('reports.noChartData', 'No data for this period')}
                />
                <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                  {t(
                    'reports.loanNotIncomeNote',
                    'Loans received are cash financing and appear under Financing — they do not increase profit.',
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="h-full flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4" />
                  {t('reports.collectionSplit', 'Cash vs Credit')}
                </CardTitle>
                <CardDescription>
                  {t(
                    'reports.collectionSplitHint',
                    'How period sales were collected — credit is not a loan',
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                {collectionPieData.length ? (
                  <div className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={collectionPieData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={2}
                        >
                          {collectionPieData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => [`${formatNumber(value)} ${currency}`, '']}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-10 text-center">
                    {t('reports.noChartData', 'No data for this period')}
                  </p>
                )}
                <div className="mt-2">
                  <BreakdownList
                    rows={data.collection_breakdown || []}
                    currency={currency}
                    emptyLabel={t('reports.noChartData', 'No data for this period')}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
            <Card className="h-full flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {t('reports.profitBridge', 'Profit Bridge')}
                </CardTitle>
                <CardDescription>
                  {t(
                    'reports.profitBridgeHint',
                    'From revenue to net profit using the chart of accounts',
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={profitBridgeChart} layout={isRtl ? 'horizontal' : 'horizontal'}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: number) => [
                          `${formatNumber(value)} ${currency}`,
                          t('reports.amount', 'Amount'),
                        ]}
                      />
                      <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                        {profitBridgeChart.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={
                              entry.amount < 0
                                ? '#dc2626'
                                : entry.name.toLowerCase().includes('net')
                                  ? '#16a34a'
                                  : CHART_COLORS[i % CHART_COLORS.length]
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="h-full flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  {t('reports.topProducts', 'Top Selling Products')}
                </CardTitle>
                <CardDescription>
                  {t('reports.topProductsHint', 'Best sellers by quantity sold in this period')}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                {topProductChart.length ? (
                  <>
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topProductChart} margin={{ left: 8, right: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 10 }}
                            interval={0}
                            angle={-20}
                            textAnchor="end"
                            height={60}
                          />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip
                            labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                            formatter={(value: number, _name: string, item) => {
                              const key = (item as { dataKey?: string })?.dataKey;
                              const label =
                                key === 'qty'
                                  ? t('reports.quantitySold', 'Quantity sold')
                                  : t('reports.revenueAfn', 'Revenue (AFN)');
                              return [formatNumber(Number(value) || 0), label];
                            }}
                          />
                          <Legend />
                          <Bar
                            dataKey="qty"
                            name={t('reports.quantitySold', 'Quantity sold')}
                            fill="#2563eb"
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="revenue"
                            name={t('reports.revenueAfn', 'Revenue (AFN)')}
                            fill="#16a34a"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="py-2 text-start font-medium">{t('reports.product', 'Product')}</th>
                            <th className="py-2 text-start font-medium">
                              {t('reports.quantityPieces', 'Qty')}
                            </th>
                            <th className="py-2 text-start font-medium">
                              {t('reports.revenueAfn', 'Revenue')}
                            </th>
                            <th className="py-2 text-start font-medium">
                              {t('reports.grossProfit', 'Gross')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(data.top_products || []).map((p) => (
                            <tr key={p.product_id} className="border-b last:border-0">
                              <td className="py-2 text-start">
                                <div className="font-medium">{p.name}</div>
                                {p.barcode ? (
                                  <div className="text-xs text-muted-foreground">{p.barcode}</div>
                                ) : null}
                              </td>
                              <td className="py-2 text-start tabular-nums">
                                {formatNumber(p.quantity_pieces)}
                              </td>
                              <td className="py-2 text-start tabular-nums">
                                {formatNumber(p.revenue_base)}
                              </td>
                              <td className="py-2 text-start tabular-nums">
                                {formatNumber(p.gross_profit_base)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-16 text-center">
                    {t('reports.noTopProducts', 'No product sales in this period')}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
            <Card className="h-full flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {t('reports.cashInflowsByType', 'Cash Inflows by Type')}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                <BreakdownList
                  rows={cashInRows}
                  currency={currency}
                  emptyLabel={t('reports.noChartData', 'No data for this period')}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      {t('reports.financingSection', 'Financing (Loans)')}
                    </CardTitle>
                    <CardDescription>
                      {data.financing?.note ||
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
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    {
                      label: t('reports.loanPrincipalReceived', 'Loan principal received'),
                      value: data.financing?.principal_received || 0,
                    },
                    {
                      label: t('reports.loanPrincipalGiven', 'Loan principal given'),
                      value: data.financing?.principal_given || 0,
                    },
                    {
                      label: t('reports.loansReceived', 'Loans Received'),
                      value: data.financing?.loans_received || 0,
                    },
                    {
                      label: t('reports.loansGiven', 'Loans Given'),
                      value: data.financing?.loans_given || 0,
                    },
                    {
                      label: t('reports.loanCollections', 'Collections'),
                      value: data.financing?.loan_collections || 0,
                    },
                    {
                      label: t('reports.loanRepayments', 'Repayments'),
                      value: data.financing?.loan_repayments || 0,
                    },
                    {
                      label: t('reports.loansReceivable', 'Loans Receivable'),
                      value: data.financing?.loans_receivable || 0,
                    },
                    {
                      label: t('reports.loansPayable', 'Loans Payable'),
                      value: data.financing?.loans_payable || 0,
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border p-3 bg-muted/20">
                      <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {formatNumber(item.value)} {currency}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
