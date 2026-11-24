import { useRef, useState } from 'react';
import { Loader2, ScanBarcode } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { looksLikeBarcode, resolveBarcode, type ResolvedBarcode } from '@/lib/resolveBarcode';
import { notifyError, notifySuccess } from '@/lib/notify';

type Props = {
  onResolved: (resolved: ResolvedBarcode) => void | Promise<void>;
  className?: string;
  /** Restrict packaging purpose after resolve (sale/purchase). */
  require?: 'sale' | 'purchase';
  autoFocus?: boolean;
};

/**
 * Dedicated scan / paste field for USB barcode wedges (type + Enter).
 * Also accepts typed barcodes; product name search stays on the line Autocomplete.
 */
export function ProductScanBar({ onResolved, className, require, autoFocus = true }: Props) {
  const { t } = useLanguage();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (raw: string) => {
    const code = raw.trim();
    if (!code || busy) return;
    setBusy(true);
    try {
      const resolved = await resolveBarcode(code);
      if (!resolved) {
        notifyError(
          t('products.barcodeNotFound', 'No product found for this barcode'),
          { title: t('common.validationError', 'Validation Error') },
        );
        inputRef.current?.select();
        return;
      }
      if (require === 'sale' && resolved.packaging.for_sale === false) {
        notifyError(
          t('products.barcodeNotForSale', 'This barcode packaging is not enabled for sale'),
          { title: t('common.validationError', 'Validation Error') },
        );
        return;
      }
      if (require === 'purchase' && resolved.packaging.for_purchase === false) {
        notifyError(
          t('products.barcodeNotForPurchase', 'This barcode packaging is not enabled for purchase'),
          { title: t('common.validationError', 'Validation Error') },
        );
        return;
      }
      await onResolved(resolved);
      setValue('');
      notifySuccess(
        `${resolved.product.name} · ${resolved.packaging.name}`,
        { title: t('common.success', 'Success') },
      );
      requestAnimationFrame(() => inputRef.current?.focus());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-2', className)}>
      <div className="relative min-w-0 flex-1">
        <ScanBarcode className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={value}
          disabled={busy}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          placeholder={t(
            'products.scanOrEnterBarcode',
            'Scan barcode or type code + Enter',
          )}
          className="h-9 ps-8 pe-8"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            e.stopPropagation();
            void submit(value);
          }}
          onBlur={() => {
            // If a wedge left a full code without Enter somehow, don't auto-submit names.
            if (looksLikeBarcode(value) && value.trim().length >= 6) {
              // leave as-is; user/scanner should press Enter
            }
          }}
        />
        {busy ? (
          <Loader2 className="absolute end-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>
    </div>
  );
}

export default ProductScanBar;
