import { Heart } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  /** Dark login surface vs light app chrome */
  variant?: 'auth' | 'app';
};

/**
 * Localized credit: "Made with ♥ by Urooj Technology"
 * `{heart}` in the translation is replaced by a Heart icon.
 */
export function MadeByCredit({ className, variant = 'app' }: Props) {
  const { t } = useLanguage();
  const template = t('common.madeBy.credit', 'Made with {heart} by Urooj Technology');
  const [before = '', after = ''] = template.split('{heart}');

  return (
    <p
      className={cn(
        'inline-flex items-center justify-center gap-1 text-center text-[10px] leading-none sm:text-[11px]',
        variant === 'auth' ? 'text-white/45' : 'text-muted-foreground',
        className,
      )}
    >
      {before ? <span>{before.trimEnd()}</span> : null}
      <Heart
        className={cn(
          'inline h-2.5 w-2.5 shrink-0 fill-current',
          variant === 'auth' ? 'text-rose-400' : 'text-rose-500',
        )}
        aria-hidden
      />
      {after ? <span>{after.trimStart()}</span> : null}
    </p>
  );
}

/** Compact always-on footer for the authenticated app shell. */
export function AppFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        'flex h-7 shrink-0 items-center justify-center border-t border-border/60 bg-background px-3 print:hidden',
        className,
      )}
    >
      <MadeByCredit variant="app" />
    </footer>
  );
}
