import { ShoppingCart, TrendingUp, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { ReportAmount } from './ReportAmount';

export type InvoiceReport = {
  returns_in_period?: number; net_invoiced_in_period?: number;
  total: number; paid: number; unpaid: number; count: number;
  paid_count: number; partial_count: number; unpaid_count: number;
  payments_in_period: number; payments_for_period_invoices: number;
  payments_for_other_invoices: number; credit_settlements_in_period: number;
};
export type TradeReportData = { sales: InvoiceReport; purchases: InvoiceReport };

export function TradeReportSection({ data, currency, onSelect }: {
  data: TradeReportData; currency: string; onSelect: (section: string) => void;
}) {
  const { t } = useLanguage();
  return <section className="space-y-3">
    <div><h2 className="text-lg font-semibold">{t('reports.tradeOverview')}</h2><p className="text-sm leading-relaxed text-muted-foreground">{t('reports.invoiceSettlementHint')}</p></div>
    <div className="grid gap-4 xl:grid-cols-2">
      {(['sales', 'purchases'] as const).map(kind => {
        const row = data[kind]; const Icon = kind === 'sales' ? TrendingUp : ShoppingCart;
        return <Card key={kind} className="min-w-0 overflow-hidden">
          <CardHeader className="border-b bg-muted/20">
            <CardTitle className="flex items-center gap-2 text-base"><Icon className="h-5 w-5 shrink-0" />{t(kind === 'sales' ? 'reports.salesInvoices' : 'reports.purchaseInvoices')}</CardTitle>
            <CardDescription><bdi dir="ltr">{row.count}</bdi> {t('reports.invoicesInPeriod')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {(['total','paid','unpaid'] as const).map(metric => <button key={metric} type="button" onClick={() => onSelect(`${kind}_invoice_${metric}`)} className="min-w-0 rounded-lg border p-3 text-start transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
                <p className="text-sm text-muted-foreground">{t(`reports.invoice${metric[0].toUpperCase()}${metric.slice(1)}`)}</p>
                <p className={`mt-2 text-lg font-semibold ${metric === 'unpaid' ? 'text-destructive' : metric === 'paid' ? 'text-emerald-700 dark:text-emerald-400' : ''}`}><ReportAmount value={row[metric]} currency={currency} /></p>
              </button>)}
            </div>
            <div className="flex flex-wrap gap-2"><Badge variant="secondary">{t('reports.paid')}: {row.paid_count}</Badge><Badge variant="outline">{t('reports.partial')}: {row.partial_count}</Badge><Badge variant="outline">{t('reports.unpaid')}: {row.unpaid_count}</Badge></div>
            {kind === 'sales' && <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="space-y-1"><p className="text-muted-foreground">{t('reports.returns')}</p><ReportAmount value={row.returns_in_period || 0} currency={currency} /></div>
              <div className="space-y-1"><p className="text-muted-foreground">{t('reports.netBilled')}</p><ReportAmount value={row.net_invoiced_in_period ?? row.total} currency={currency} /></div>
            </div>}
            <div className="space-y-3 rounded-lg bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{t(kind === 'sales' ? 'reports.saleCashReceived' : 'reports.purchaseCashPaid')}</p><ReportAmount value={row.payments_in_period} currency={currency} className="font-semibold" /></div>
              <div className="grid gap-3 text-xs sm:grid-cols-2"><div className="space-y-1"><p className="text-muted-foreground">{t('reports.paymentsOnPeriodInvoices')}</p><ReportAmount value={row.payments_for_period_invoices} currency={currency} /></div><div className="space-y-1"><p className="text-muted-foreground">{t('reports.paymentsOnOtherInvoices')}</p><ReportAmount value={row.payments_for_other_invoices} currency={currency} /></div></div>
              {row.credit_settlements_in_period > 0 && <p className="text-xs">{t('reports.nonCashSettlements')}: <ReportAmount value={row.credit_settlements_in_period} currency={currency} /></p>}
              <Button size="sm" variant="link" className="h-auto whitespace-normal p-0 text-start" onClick={() => onSelect(kind === 'sales' ? 'sales_payments' : 'purchase_payments')}>{t('reports.viewPaymentRecords')}<ArrowUpRight className="ms-1 h-4 w-4 shrink-0 rtl:-scale-x-100" /></Button>
            </div>
          </CardContent>
        </Card>;
      })}
    </div>
  </section>;
}
