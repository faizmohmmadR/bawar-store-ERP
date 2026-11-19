import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
export function TransactionTypeSelect({ value, onChange, className }: { value: string; className?: string; onChange: (value: 'paid' | 'free') => void }) {
  const { t } = useLanguage();
  return <Select value={value} onValueChange={next => onChange(next as 'paid' | 'free')}><SelectTrigger className={cn("h-10 min-w-[120px]", className)}><SelectValue /></SelectTrigger><SelectContent>
    <SelectItem value="paid">{t('common.paid', 'Paid')}</SelectItem><SelectItem value="free">{t('common.free', 'Free')}</SelectItem>
  </SelectContent></Select>;
}
