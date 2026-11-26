import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormSelect, type FormSelectOption } from '@/components/forms/FormSelect';
import { useLanguage } from '@/contexts/LanguageContext';
import api from '@/api/client';
import { formatApiError, notifyError, notifySuccess } from '@/lib/notify';

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: FormSelectOption[];
  placeholder?: string;
  disabled?: boolean;
};

export function ProductCategorySelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: Props) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [extraOptions, setExtraOptions] = useState<FormSelectOption[]>([]);

  const sortedOptions = useMemo(() => {
    const byValue = new Map<string, FormSelectOption>();
    [...options, ...extraOptions].forEach((opt) => {
      byValue.set(String(opt.value), { ...opt, value: String(opt.value) });
    });
    return Array.from(byValue.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [options, extraOptions]);

  const resetDialog = () => {
    setName('');
    setDescription('');
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const { data } = await api.post<{ id: number; name: string }>('product-categories/', {
        name: trimmed,
        description: description.trim() || null,
      });
      const created: FormSelectOption = {
        value: String(data.id),
        label: data.name || trimmed,
      };
      setExtraOptions((prev) => [...prev.filter((o) => o.value !== created.value), created]);
      await queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      onChange(created.value);
      notifySuccess(t('products.categoryAdded', 'Category added'), {
        title: t('common.success', 'Success'),
      });
      setOpen(false);
      resetDialog();
    } catch (error) {
      notifyError(
        formatApiError(error, t('products.categoryAddFailed', 'Could not add category')),
        { title: t('common.validationError', 'Validation Error') },
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex gap-2">
      <div className="min-w-0 flex-1">
        <FormSelect
          value={value}
          onChange={onChange}
          options={sortedOptions}
          placeholder={placeholder}
          disabled={disabled}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-10 w-10 shrink-0"
        disabled={disabled}
        title={t('products.addCategory', 'Add category')}
        aria-label={t('products.addCategory', 'Add category')}
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('products.addCategory', 'Add category')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="product-category-name">
                {t('products.categoryName', 'Category name')} *
              </Label>
              <Input
                id="product-category-name"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleCreate();
                  }
                }}
                placeholder={t('products.categoryNamePlaceholder', 'e.g. Biscuits, Drinks')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-category-desc">
                {t('products.description', 'Description')}
              </Label>
              <Input
                id="product-category-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('common.optional', 'Optional')}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                resetDialog();
              }}
              disabled={saving}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreate()}
              disabled={saving || !name.trim()}
            >
              {saving ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ProductCategorySelect;
