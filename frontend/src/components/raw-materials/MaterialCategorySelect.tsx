import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import useFetchObjects from '@/api/useFetchObjects';
import api from '@/api/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Autocomplete } from '@/components/ui/autocomplete';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { formatApiError, notifyError } from '@/lib/notify';

export function MaterialCategorySelect({ value, onChange, allowCreate = false, disabled = false, variant = 'default' }: {
  value: string; onChange: (value: string) => void; allowCreate?: boolean; disabled?: boolean; variant?: 'default' | 'filter';
}) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const nameId = useId();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const { data } = useFetchObjects<{ results: { id: number; name: string }[] }>({
    queryKey: ['raw-material-categories'], endpoint: 'raw-material-categories', params: { page_size: 1000 },
  });
  const categories = [...(data?.results || [])].sort((a, b) => a.name.localeCompare(b.name));
  const create = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const result = await api.post('/raw-material-categories/', { name: name.trim() });
      await queryClient.invalidateQueries({ queryKey: ['raw-material-categories'] });
      onChange(String(result.data.id));
      setName(''); setAdding(false);
    } catch (error) {
      notifyError(formatApiError(error));
    } finally { setSaving(false); }
  };
  return <div className="min-w-0 space-y-2">
    <div className="flex min-w-0 gap-2">
      <Autocomplete variant={variant} disabled={disabled} options={categories} value={value} onChange={(next) => onChange(next ? String(next) : '')}
        getOptionLabel={(option) => option.name} getOptionValue={(option) => String(option.id)}
        placeholder={t('rawMaterials.selectCategory', 'Select category')} className="w-full min-w-0" />
      {allowCreate && <Dialog open={adding} onOpenChange={(open) => {
        if (saving) return;
        setAdding(open);
        if (!open) setName('');
      }}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline">{t('common.add', 'Add')}</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md" onKeyDown={(event) => {
          if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
            event.preventDefault();
            event.stopPropagation();
            void create();
          }
        }}>
          <DialogHeader>
            <DialogTitle>{t('common.add', 'Add')} · {t('rawMaterials.category', 'Category')}</DialogTitle>
            <DialogDescription>{t('rawMaterials.newCategoryHint', 'Enter a name to create and select a new category.')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={nameId}>{t('rawMaterials.categoryName', 'Category name')} *</Label>
            <Input id={nameId} value={name} autoFocus disabled={saving} maxLength={100}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('rawMaterials.categoryName', 'Category name')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => { setAdding(false); setName(''); }}>{t('common.cancel')}</Button>
            <Button type="button" onClick={create} disabled={!name.trim() || saving}>{t(saving ? 'common.saving' : 'common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}
    </div>
  </div>;
}
