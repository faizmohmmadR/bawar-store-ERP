import { Control, UseFormSetValue, useFieldArray, useWatch } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  defaultPackagingRow,
  type ProductFormValues,
} from '@/lib/productFormSchemas';

type Props = {
  control: Control<ProductFormValues>;
  setValue: UseFormSetValue<ProductFormValues>;
};

export function ProductPackagingEditor({ control, setValue }: Props) {
  const { t } = useLanguage();
  const { fields, append, remove } = useFieldArray({ control, name: 'packagings' });
  const packagings = useWatch({ control, name: 'packagings' }) ?? [];

  const setExclusiveDefault = (
    index: number,
    key: 'is_default_purchase' | 'is_default_sale',
    checked: boolean,
  ) => {
    packagings.forEach((_, i) => {
      setValue(`packagings.${i}.${key}`, checked && i === index);
    });
  };

  const setBaseRow = (index: number, checked: boolean) => {
    if (!checked) return;
    packagings.forEach((_, i) => {
      setValue(`packagings.${i}.is_base`, i === index);
      if (i === index) {
        setValue(`packagings.${i}.qty_in_base`, '1');
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{t('products.packagingUnits', 'Packaging / units')}</h3>
          <p className="text-xs text-muted-foreground">
            {t(
              'products.packagingHint',
              'Base unit stores stock. Add carton, sack, etc. with how many base units each contains.',
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            append(
              defaultPackagingRow({
                name: '',
                qty_in_base: '12',
                is_default_purchase: false,
              }),
            )
          }
        >
          <Plus className="h-4 w-4" />
          {t('products.addPackaging', 'Add unit')}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table className="min-w-[1100px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-[9rem] bg-muted/30 text-start text-xs whitespace-nowrap">
                {t('products.unitName', 'Unit name')}
              </TableHead>
              <TableHead className="min-w-[7rem] bg-muted/30 text-start text-xs whitespace-nowrap">
                {t('products.qtyInBase', 'Qty in base')}
              </TableHead>
              <TableHead className="min-w-[9rem] bg-muted/30 text-start text-xs whitespace-nowrap">
                {t('products.barcode', 'Barcode')}
              </TableHead>
              <TableHead className="min-w-[4.5rem] bg-muted/30 text-start text-xs whitespace-nowrap">
                {t('products.base', 'Base')}
              </TableHead>
              <TableHead className="min-w-[4rem] bg-muted/30 text-start text-xs whitespace-nowrap">
                {t('products.buy', 'Buy')}
              </TableHead>
              <TableHead className="min-w-[4rem] bg-muted/30 text-start text-xs whitespace-nowrap">
                {t('products.sell', 'Sell')}
              </TableHead>
              <TableHead className="min-w-[5rem] bg-muted/30 text-start text-xs whitespace-nowrap">
                {t('products.defBuy', 'Def buy')}
              </TableHead>
              <TableHead className="min-w-[5rem] bg-muted/30 text-start text-xs whitespace-nowrap">
                {t('products.defSell', 'Def sell')}
              </TableHead>
              <TableHead className="min-w-[4.5rem] bg-muted/30 text-start text-xs whitespace-nowrap">
                {t('products.varWeight', 'Var wt')}
              </TableHead>
              <TableHead className="w-10 bg-muted/30" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => {
              const row = packagings[index];
              return (
                <TableRow key={field.id} className="hover:bg-muted/10">
                  <TableCell className="align-middle py-2 text-start">
                    <FormField
                      control={control}
                      name={`packagings.${index}.name`}
                      render={({ field: nameField }) => (
                        <FormItem className="space-y-1">
                          <FormControl>
                            <Input
                              {...nameField}
                              placeholder={t('products.unitNamePlaceholder', 'e.g. Bottle, Carton')}
                              className="h-9"
                            />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />
                  </TableCell>

                  <TableCell className="align-middle py-2 text-start">
                    <FormField
                      control={control}
                      name={`packagings.${index}.qty_in_base`}
                      render={({ field: qtyField }) => (
                        <FormItem className="space-y-1">
                          <FormControl>
                            <Input
                              type="number"
                              min={row?.is_base ? 1 : 0.000001}
                              step="any"
                              value={qtyField.value}
                              disabled={Boolean(row?.is_base)}
                              onChange={(e) => qtyField.onChange(e.target.value)}
                              className="h-9"
                            />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />
                  </TableCell>

                  <TableCell className="align-middle py-2 text-start">
                    <FormField
                      control={control}
                      name={`packagings.${index}.barcode`}
                      render={({ field: barcodeField }) => (
                        <FormItem className="space-y-0">
                          <FormControl>
                            <Input
                              {...barcodeField}
                              className="h-9 font-mono text-xs"
                              placeholder="—"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </TableCell>

                  <TableCell className="align-middle py-2 text-start">
                    <div className="flex justify-start">
                      <Checkbox
                        checked={Boolean(row?.is_base)}
                        onCheckedChange={(checked) => setBaseRow(index, checked === true)}
                        aria-label={t('products.base', 'Base')}
                      />
                    </div>
                  </TableCell>

                  <TableCell className="align-middle py-2 text-start">
                    <FormField
                      control={control}
                      name={`packagings.${index}.for_purchase`}
                      render={({ field: buyField }) => (
                        <FormItem className="flex justify-start space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={buyField.value}
                              onCheckedChange={(checked) => buyField.onChange(checked === true)}
                              aria-label={t('products.buy', 'Buy')}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </TableCell>

                  <TableCell className="align-middle py-2 text-start">
                    <FormField
                      control={control}
                      name={`packagings.${index}.for_sale`}
                      render={({ field: sellField }) => (
                        <FormItem className="flex justify-start space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={sellField.value}
                              onCheckedChange={(checked) => sellField.onChange(checked === true)}
                              aria-label={t('products.sell', 'Sell')}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </TableCell>

                  <TableCell className="align-middle py-2 text-start">
                    <div className="flex justify-start">
                      <Checkbox
                        checked={Boolean(row?.is_default_purchase)}
                        onCheckedChange={(checked) =>
                          setExclusiveDefault(index, 'is_default_purchase', checked === true)
                        }
                        aria-label={t('products.defBuy', 'Def buy')}
                      />
                    </div>
                  </TableCell>

                  <TableCell className="align-middle py-2 text-start">
                    <div className="flex justify-start">
                      <Checkbox
                        checked={Boolean(row?.is_default_sale)}
                        onCheckedChange={(checked) =>
                          setExclusiveDefault(index, 'is_default_sale', checked === true)
                        }
                        aria-label={t('products.defSell', 'Def sell')}
                      />
                    </div>
                  </TableCell>

                  <TableCell className="align-middle py-2 text-start">
                    <FormField
                      control={control}
                      name={`packagings.${index}.is_variable_weight`}
                      render={({ field: varField }) => (
                        <FormItem className="flex justify-start space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={varField.value}
                              onCheckedChange={(checked) => varField.onChange(checked === true)}
                              aria-label={t('products.varWeight', 'Var wt')}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </TableCell>

                  <TableCell className="align-middle py-2 text-start">
                    {!row?.is_base && fields.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => remove(index)}
                        aria-label={t('common.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <FormField
        control={control}
        name="packagings"
        render={() => (
          <FormItem>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
        <p>
          <FormLabel className="text-[11px]">{t('products.base', 'Base')}</FormLabel>
          {' — '}
          {t('products.baseExplain', '1:1 inventory unit (piece, gram, ml…)')}
        </p>
        <p>
          <FormLabel className="text-[11px]">{t('products.varWeight', 'Var wt')}</FormLabel>
          {' — '}
          {t('products.varWeightExplain', 'Enter actual weight at purchase/sale time')}
        </p>
      </div>
    </div>
  );
}
