import { cn } from '@/lib/utils';

/** Shared layout/styles for purchase & sales form headers */
export const orderFormHeaderField = 'min-w-0 flex flex-col';

export const orderFormHeaderLabel =
  'text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block';

export const orderFormHeaderControl =
  'h-9 min-h-9 w-full text-sm border-input focus:border-primary focus:ring-1 focus:ring-primary';

export const orderFormHeaderError = 'text-xs text-destructive mt-1';

export function orderFormHeaderControlClass(error?: boolean) {
  return cn(
    orderFormHeaderControl,
    error && 'border-destructive focus:border-destructive focus:ring-destructive',
  );
}

/** Shared panel headers for items & summary cards (sales/purchase forms) */
export const orderFormPanelHeader =
  'bg-gradient-to-r from-primary/10 via-primary/5 to-accent/10 px-4 py-3 border-b border-border flex items-center justify-between gap-2 min-h-[3.25rem]';

export const orderFormPanelTitle = 'text-base font-bold text-foreground';

/** Table column widths for numeric / price fields */
export const orderFormTableNumericCol = 'min-w-[8rem] w-[8rem]';
export const orderFormTableNumericColWide = 'min-w-[9rem] w-[9rem]';
export const orderFormTablePriceCol = 'min-w-[8.5rem] w-[8.5rem]';
export const orderFormTableTotalCol = 'min-w-[6rem] w-[6rem]';
export const orderFormTableExpireCol = 'min-w-[9.5rem] w-[9.5rem]';
/** Product column — wide enough for names, not full-row stretch */
export const orderFormTableProductCol = 'w-[16rem] max-w-[18rem] min-w-[14rem]';
export const orderFormTableUnitCol = 'w-[8.5rem] min-w-[8.5rem]';
export const orderFormRowControl = 'h-9';
