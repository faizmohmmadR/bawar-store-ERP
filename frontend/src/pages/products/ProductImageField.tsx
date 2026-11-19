import { useEffect, useMemo } from 'react';
import type { Control } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useLanguage } from '@/contexts/LanguageContext';

type ProductImageFieldProps = {
  control: Control<any>;
  name?: string;
  currentUrl?: string | null;
};

function ImagePreview({ file, url }: { file?: File | null; url?: string | null }) {
  const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);
  const src = objectUrl || url || '';
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      className="h-24 w-24 rounded-md border object-cover bg-muted"
    />
  );
}

export function ProductImageField({
  control,
  name = 'image',
  currentUrl,
}: ProductImageFieldProps) {
  const { t } = useLanguage();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { onChange, value, ...field } }) => (
        <FormItem className="sm:col-span-2">
          <FormLabel>{t('products.image')}</FormLabel>
          <FormControl>
            <div className="flex flex-wrap items-center gap-4">
              <ImagePreview file={value instanceof File ? value : null} url={currentUrl} />
              <Input
                type="file"
                accept="image/*"
                {...field}
                value={undefined}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  onChange(file || undefined);
                }}
              />
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
