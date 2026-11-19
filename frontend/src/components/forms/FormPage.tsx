import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

const MAX_WIDTH = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  screen: 'max-w-[76rem]',
  '7xl': 'max-w-7xl',
  full: 'max-w-full',
} as const;

export type FormPageMaxWidth = keyof typeof MAX_WIDTH;

export type FormPageProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** Navigate here when Back is clicked (ignored if onBack is set). */
  backTo?: string;
  onBack?: () => void;
  backLabel?: string;
  children: ReactNode;
  maxWidth?: FormPageMaxWidth;
  className?: string;
  contentClassName?: string;
  headerActions?: ReactNode;
};

/**
 * Shared shell for Add / Edit pages.
 * Back control lives inside the form card header (not above the card).
 */
export function FormPage({
  title,
  description,
  icon,
  backTo,
  onBack,
  backLabel,
  children,
  maxWidth = '4xl',
  className,
  contentClassName,
  headerActions,
}: FormPageProps) {
  const navigate = useNavigate();
  const { t, direction } = useLanguage();
  const BackIcon = direction === 'rtl' ? ArrowRight : ArrowLeft;

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (backTo) {
      navigate(backTo);
      return;
    }
    navigate(-1);
  };

  return (
    <div
      className={cn(
        'mx-auto w-full px-3 pt-4 pb-3 sm:px-5 sm:pt-6 sm:pb-4 lg:px-6',
        MAX_WIDTH[maxWidth],
        className,
      )}
    >
      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="space-y-0 border-b border-border/60 bg-muted/30 p-0">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBack}
              className="h-9 w-fit shrink-0 gap-1.5 bg-background px-2.5 shadow-none"
            >
              <BackIcon className="h-4 w-4" />
              <span>{backLabel ?? t('common.back')}</span>
            </Button>

            <div className="min-w-0 flex-1 space-y-0.5">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base font-heading font-semibold leading-none tracking-tight sm:text-lg">
                {icon ? (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&>svg]:h-4 [&>svg]:w-4">
                    {icon}
                  </span>
                ) : null}
                <span className="min-w-0 break-words">{title}</span>
              </CardTitle>
              {description ? (
                <p className="pt-1 text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>

            {headerActions ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                {headerActions}
              </div>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className={cn('p-4 sm:p-5 lg:p-6', contentClassName)}>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

/** Responsive field grid for form bodies. */
export function FormPageFields({
  children,
  className,
  cols = 2,
}: {
  children: ReactNode;
  className?: string;
  cols?: 1 | 2 | 3;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 items-start gap-4',
        cols === 2 && 'sm:grid-cols-2',
        cols === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Optional labeled section inside a FormPage. */
export function FormPageSection({
  title,
  description,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4 sm:p-5',
        className,
      )}
    >
      {(title || description) && (
        <div className="space-y-1 border-b border-border/50 pb-3">
          {title ? (
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          ) : null}
          {description ? (
            <p className="text-xs text-muted-foreground sm:text-sm">{description}</p>
          ) : null}
        </div>
      )}
      {children}
    </section>
  );
}
