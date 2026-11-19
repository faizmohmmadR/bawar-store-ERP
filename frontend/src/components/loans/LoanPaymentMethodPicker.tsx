import { Banknote, Building2, Landmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

export type LoanCashMethod = 'cash' | 'bank' | 'sarafi';

const METHODS: {
  value: LoanCashMethod;
  icon: typeof Banknote;
  labelKey: string;
  fallback: string;
  accountHintKey: string;
  accountHintFallback: string;
}[] = [
  {
    value: 'cash',
    icon: Banknote,
    labelKey: 'payments.methods.cash',
    fallback: 'Cash',
    accountHintKey: 'payments.methods.cashAccount',
    accountHintFallback: 'Posts to Cash (1000)',
  },
  {
    value: 'bank',
    icon: Landmark,
    labelKey: 'payments.methods.bank',
    fallback: 'Bank',
    accountHintKey: 'payments.methods.bankAccount',
    accountHintFallback: 'Posts to Bank (1050)',
  },
  {
    value: 'sarafi',
    icon: Building2,
    labelKey: 'payments.methods.sarafi',
    fallback: 'Sarafi',
    accountHintKey: 'payments.methods.sarafiAccount',
    accountHintFallback: 'Posts to Sarafi (1060)',
  },
];

interface LoanPaymentMethodPickerProps {
  value: string;
  onChange: (value: LoanCashMethod) => void;
  /** loan_in = money increases; loan_out = money decreases (at creation). Settlement flips. */
  movement: 'increase' | 'decrease';
  className?: string;
}

export function LoanPaymentMethodPicker({
  value,
  onChange,
  movement,
  className,
}: LoanPaymentMethodPickerProps) {
  const { t } = useLanguage();
  const movementLabel =
    movement === 'increase'
      ? t('loans.accountIncreases', 'This account increases')
      : t('loans.accountDecreases', 'This account decreases');

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-xs text-muted-foreground">{movementLabel}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {METHODS.map((method) => {
          const Icon = method.icon;
          const active = value === method.value;
          return (
            <button
              key={method.value}
              type="button"
              onClick={() => onChange(method.value)}
              className={cn(
                'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                active
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border hover:bg-muted/40',
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">
                  {t(method.labelKey, method.fallback)}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {t(method.accountHintKey, method.accountHintFallback)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
