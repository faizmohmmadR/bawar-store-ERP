import { formatDecimalDisplay } from '@/lib/decimalDisplay';
import { DollarSign, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ContactFinance, getFinanceBucket, getFinanceCurrencyCodes } from '@/lib/finance';

interface CurrencyFinanceSummaryProps {
  finance?: ContactFinance | null;
  debitLabel: string;
  creditLabel: string;
  balanceLabel: string;
}

export function CurrencyFinanceSummary({
  finance,
  debitLabel,
  creditLabel,
  balanceLabel,
}: CurrencyFinanceSummaryProps) {
  const codes = getFinanceCurrencyCodes(finance);

  if (!finance || codes.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {codes.map((code) => {
        const bucket = getFinanceBucket(finance, code);
        if (!bucket) return null;
        const currencyCode = (bucket.currency || code).toUpperCase();

        return (
          <div key={code} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">{currencyCode}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="border-l-4 border-l-primary">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{debitLabel}</p>
                      <p className="text-2xl font-bold">{formatDecimalDisplay(bucket.total_debit, 2)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{currencyCode}</p>
                    </div>
                    <div className="h-12 w-12 rounded-lg bg-primary/100/10 flex items-center justify-center">
                      <Wallet className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-primary">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{creditLabel}</p>
                      <p className="text-2xl font-bold text-primary">{formatDecimalDisplay(bucket.total_credit, 2)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{currencyCode}</p>
                    </div>
                    <div className="h-12 w-12 rounded-lg bg-primary/100/10 flex items-center justify-center">
                      <DollarSign className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-red-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{balanceLabel}</p>
                      <p className={`text-2xl font-bold ${bucket.balance > 0 ? 'text-red-600' : 'text-primary'}`}>
                        {formatDecimalDisplay(bucket.balance, 2)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{currencyCode}</p>
                    </div>
                    <div className="h-12 w-12 rounded-lg bg-red-500/10 flex items-center justify-center">
                      <DollarSign className="h-6 w-6 text-red-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FinanceBalanceBadges({ finance }: { finance?: ContactFinance | null }) {
  const codes = getFinanceCurrencyCodes(finance);
  if (!finance || codes.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      {codes.map((code) => {
        const bucket = getFinanceBucket(finance, code);
        if (!bucket) return null;
        const currencyCode = (bucket.currency || code).toUpperCase();
        return (
          <span
            key={code}
            className={`text-sm font-medium ${bucket.balance > 0 ? 'text-red-600' : 'text-primary'}`}
          >
            {formatDecimalDisplay(bucket.balance, 2)} {currencyCode}
          </span>
        );
      })}
    </div>
  );
}
