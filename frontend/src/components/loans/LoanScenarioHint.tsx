import { Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getLoanDirectionLabel,
  getLoanScenarioDescription,
  getLoanScenarioLabel,
} from '@/lib/loanUtils';
import { cn } from '@/lib/utils';

interface LoanScenarioHintProps {
  loanerType: string | undefined;
  loanType: string;
  className?: string;
  variant?: 'banner' | 'inline' | 'default';
  showLabel?: boolean;
}

export function LoanScenarioHint({
  loanerType,
  loanType,
  className,
  variant = 'banner',
  showLabel = false,
}: LoanScenarioHintProps) {
  const { t } = useLanguage();

  if (!loanerType || !loanType) {
    if (variant === 'banner') {
      return <div className={cn('h-11', className)} aria-hidden />;
    }
    return null;
  }

  const label = getLoanScenarioLabel(loanerType, loanType, t);
  const description = getLoanScenarioDescription(loanerType, loanType, t);
  const direction = getLoanDirectionLabel(loanerType, loanType, t);

  if (variant === 'banner') {
    return (
      <div
        className={cn(
          'h-11 px-3 rounded-md border border-primary/15 bg-primary/5',
          'flex items-center gap-2 min-w-0',
          className,
        )}
        role="note"
      >
        <Info className="h-4 w-4 text-primary shrink-0" aria-hidden />
        {direction && (
          <Badge variant="outline" className="text-xs shrink-0 font-normal">
            {direction}
          </Badge>
        )}
        <p className="text-xs text-muted-foreground truncate flex-1 min-w-0">
          {showLabel ? `${label} — ${description}` : description}
        </p>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 min-w-0 text-xs text-muted-foreground',
          className,
        )}
        role="note"
      >
        {direction && (
          <Badge variant="outline" className="text-xs shrink-0 font-normal">
            {direction}
          </Badge>
        )}
        <span className="truncate">{description}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'p-3 rounded-lg border bg-muted/40 flex items-center gap-3 min-w-0',
        className,
      )}
      role="note"
    >
      <Info className="h-5 w-5 text-primary shrink-0" aria-hidden />
      <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        {showLabel && <span className="text-sm font-medium">{label}</span>}
        {direction && (
          <Badge variant="outline" className="text-xs shrink-0 font-normal">
            {direction}
          </Badge>
        )}
        <span className="text-sm text-muted-foreground">{description}</span>
      </div>
    </div>
  );
}
