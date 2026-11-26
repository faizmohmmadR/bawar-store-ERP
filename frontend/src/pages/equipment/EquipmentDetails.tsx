import { useMemo, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit, ExternalLink, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ListDate } from '@/components/display/ListDate';
import JournalEntriesSection from '@/components/accounting/JournalEntriesSection';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import { printEquipmentSerialLabel } from '@/pages/equipment/printEquipmentLabel';
import EquipmentDepreciationSection from '@/pages/equipment/EquipmentDepreciationSection';
import { formatDisplayMoney } from '@/lib/displayMoney';

const acquisitionLabelKey: Record<string, string> = {
  new_purchase: 'equipment.acquisitionNew',
  opening: 'equipment.acquisitionOpening',
  expense: 'equipment.acquisitionExpense',
};

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-semibold text-foreground">{children}</div>
    </div>
  );
}

export default function EquipmentDetails() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams();

  const { data: item, isLoading } = useFetchObjects<any>({
    queryKey: ['equipment', id],
    endpoint: `equipment/${id}/`,
    enabled: !!id,
  });

  const categoryLabel = useMemo(() => {
    if (!item?.category) return '—';
    return t(`equipment.categories.${item.category}`, item.category);
  }, [item?.category, t]);

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center">{t('common.loading')}</div>;
  }

  if (!item) {
    return <div className="flex h-64 items-center justify-center">{t('crud.notFound')}</div>;
  }

  const acqKey = acquisitionLabelKey[item.acquisition_type] || 'equipment.acquisitionNew';
  const currencyCode = item.currency_details?.code || '';

  return (
    <div className="mx-auto w-full max-w-[90rem] space-y-5 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" size="sm" className="w-fit" onClick={() => navigate('/equipment')}>
          <ArrowLeft className="me-2 h-4 w-4" />
          {t('common.back')}
        </Button>
        <div className="flex flex-wrap gap-2">
          {item.serial_number ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                printEquipmentSerialLabel({
                  serial_number: item.serial_number,
                  name: item.name,
                })
              }
            >
              <Printer className="me-2 h-4 w-4" />
              {t('equipment.printSerial', 'Print serial')}
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => navigate(`/equipment/${id}/edit`)}>
            <Edit className="me-2 h-4 w-4" />
            {t('common.edit')}
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-muted/15 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-2xl font-bold tracking-tight sm:text-3xl">{item.name}</CardTitle>
              <p className="font-mono text-sm text-muted-foreground">{item.serial_number || '—'}</p>
            </div>
            <Badge variant="outline" className="h-7 w-fit shrink-0 px-3 text-sm font-normal">
              {t(acqKey, item.acquisition_type)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-4 py-5 sm:px-6">
          <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            <DetailField label={t('equipment.unitCost', 'Price')}>
              <span className="tabular-nums">
                {formatDisplayMoney(item.unit_cost || 0, currencyCode)} {currencyCode}
              </span>
            </DetailField>
            <DetailField label={t('equipment.quantity', 'Quantity')}>
              {`${item.quantity || 1} ${item.unit || ''}`.trim()}
            </DetailField>
            <DetailField label={t('equipment.acquiredDate', 'Date')}>
              {item.acquired_date ? <ListDate value={item.acquired_date} /> : '—'}
            </DetailField>
            <DetailField label={t('equipment.category', 'Category')}>{categoryLabel}</DetailField>
            <DetailField label={t('equipment.location', 'Location')}>{item.location || '—'}</DetailField>
            {Number(item.accumulated_depreciation || 0) > 0 ? (
              <DetailField label={t('equipment.accumulatedDepreciation', 'Already depreciated')}>
                <span className="tabular-nums">
                  {formatDisplayMoney(item.accumulated_depreciation, currencyCode)} {currencyCode}
                </span>
              </DetailField>
            ) : null}
          </div>

          {item.expense_details ? (
            <>
              <Separator className="my-5" />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {t('equipment.linkedExpense', 'Linked expense')}:{' '}
                  <span className="font-semibold text-foreground tabular-nums">
                    {item.expense_details.amount} {currencyCode}
                  </span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/expenses/${item.expense_details.id}`)}
                >
                  <ExternalLink className="me-2 h-4 w-4" />
                  {t('equipment.viewExpense', 'View expense')}
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <EquipmentDepreciationSection
        equipmentId={id!}
        currencyCode={currencyCode}
        netBookValue={Number(item.net_book_value || 0)}
        acquisitionType={item.acquisition_type}
      />

      <JournalEntriesSection
        model={item.expense_details ? 'expense' : 'equipment'}
        objectId={item.expense_details?.id ?? id}
      />
    </div>
  );
}
