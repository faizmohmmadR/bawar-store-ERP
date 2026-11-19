import { packingFullUnitCosts } from '@/lib/packingStockCosts';
import { formatPrice } from '@/lib/formatNumber';
import { PackingCostSummary, PackingFullUnitCosts } from '@/components/packing/PackingCostSummary';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, PackageCheck, Pencil } from 'lucide-react';
import { ReloadIcon } from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ListDate } from '@/components/display/ListDate';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';
import type { PackingRun } from '@/types/packing';
import JournalEntriesSection from '@/components/accounting/JournalEntriesSection';

const PackingRunDetails = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: run, isLoading, isError } = useFetchObjects<PackingRun>({
    queryKey: ['packing-run', id],
    endpoint: `packing-runs/${id}`,
    enabled: !!id,
  });

  const afn = resolveCurrencySymbol(1);
  const amount = (value: string | number, digits = 4) =>
    Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <ReloadIcon className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (isError || !run) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <p className="text-muted-foreground">{t('packing.packingNotFound', 'Packing run not found.')}</p>
        <Button variant="outline" onClick={() => navigate('/packing')}>
          <ArrowLeft className="me-2 h-4 w-4" />
          {t('common.back')}
        </Button>
      </div>
    );
  }

  const components = run.components || [];
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center gap-3 border-b pb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/packing')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold">
            {run.product_name || t('packing.title')}
          </h1>
          <p className="font-mono text-sm text-muted-foreground">{run.packing_number}</p>
        </div>
        <Button variant="outline" onClick={() => navigate(`/packing/${run.id}/edit`)}>
          <Pencil className="me-2 h-4 w-4" />
          {t('packing.editPacking')}
        </Button>
        <PackageCheck className="h-5 w-5 text-muted-foreground" />
      </header>
      {run.packing_return && <Card><CardContent className="pt-6 text-sm">
        {t('packing.returnedBottleCost', 'Returned bottle value')}: {afn}{formatPrice(run.returned_cost_afn || 0)}
        <Button variant="link" onClick={() => navigate('/stock/returned-for-packing')}>{t('stock.returnedForPacking', 'Returned for Packing')}</Button>
      </CardContent></Card>}
      {run.outputs && run.outputs.length > 0 && <Card>
        <CardHeader><CardTitle>{t('stock.packingOutputs')}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">{run.outputs.map(output => <div key={output.id} className="rounded-lg border p-3">
          <Button variant="link" className="h-auto p-0 text-start" onClick={() => navigate(`/stock/${output.stock}`)}>{output.product_name}</Button>
          <p className="mt-2 text-sm">{t('stock.pieceQuantity')}: <bdi dir="ltr" className="font-semibold">{amount(output.quantity_pieces)}</bdi></p>
        </div>)}</CardContent>
      </Card>}
      <div className="grid gap-5">
        <Card>
          <CardHeader>
            <CardTitle>{t('packing.packingDetails', 'Packing Details')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">{t('packing.packingDate')}</p>
              <ListDate value={run.created_at} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('packing.sourceType', 'Packing source')}</p>
              <p className="font-medium">{[run.storage_tank_name, run.packing_return ? `${t('stock.returnedForPacking', 'Returned for Packing')} · ${run.returned_bottle_count}` : null].filter(Boolean).join(' + ')}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('packing.finishedProduct')}</p>
              <p className="font-medium">{run.product_name || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('packing.kgToPack', 'Quantity to pack (kg)')}</p>
              <p className="font-medium tabular-nums">{amount(run.quantity_kg)} kg</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('packing.kgPerBottle', 'Weight per bottle (kg)')}</p>
              <p className="font-medium tabular-nums">{amount(run.bottle_count ? Number(run.quantity_kg) / run.bottle_count : 0)} kg</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('packing.bottleCount')}</p>
              <p className="font-medium tabular-nums">{amount(run.bottle_count, 0)}</p>
            </div>
            {run.notes ? (
              <div className="sm:col-span-2">
                <p className="text-sm text-muted-foreground">{t('packing.notes')}</p>
                <p>{run.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

      </div>

      <PackingCostSummary
        rate={run.usd_to_afn_rate ?? null}
        liquidCost={run.liquid_cost_afn}
        packagingCost={run.packaging_cost_afn}
        returnedCost={run.packing_return ? run.returned_cost_afn : undefined}
        totalCost={run.total_cost_afn}
      />
      {run.full_unit_costs?.length ? run.full_unit_costs.map(section => (
        <PackingFullUnitCosts key={section.section} rate={run.usd_to_afn_rate ?? null}
          title={section.section === 'new' ? t('packing.newFullUnitCosts', 'New packing — full unit costs')
            : section.section === 'returned' ? t('packing.returnedFullUnitCosts', 'Returned packing — full unit costs') : undefined}
          costs={(['bottle', 'carton', 'plastic'] as const).map(type => ({ type, afn: section[`cost_per_${type}_afn`] }))}
        />
      )) : <PackingFullUnitCosts rate={run.usd_to_afn_rate ?? null}
        costs={packingFullUnitCosts(Number(run.total_cost_afn), run.bottle_count,
          components.map(row => ({ componentType: row.component_type, quantity: Number(row.quantity_pieces) })))}
      />}

      <Card>
        <CardHeader>
          <CardTitle>{t('packing.packagingMaterials')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('packing.componentTypeShort')}</TableHead>
                  <TableHead>{t('packing.materialShort')}</TableHead>
                  <TableHead className="text-right">{t('packing.quantityUsedShort')}</TableHead>
                  <TableHead className="text-right">{t('packing.unitPrice')}</TableHead>
                  <TableHead className="text-right">{t('packing.costShort')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {components.length === 0 ? (
                  <TableRow>
                    <td colSpan={5} className="p-4 text-muted-foreground">
                      {t('common.noData')}
                    </td>
                  </TableRow>
                ) : (
                  components.map((component) => (
                    <TableRow key={component.id}>
                      <TableCell className="font-medium">
                        {t(
                          `packing.component_${component.component_type}`,
                          component.component_label || component.component_type,
                        )}
                      </TableCell>
                      <TableCell>{component.product_name || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {amount(component.quantity_pieces, 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {afn}
                        {formatPrice(component.unit_cost_afn)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {afn}
                        {formatPrice(component.total_cost_afn)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>


      {id && <JournalEntriesSection model="packingrun" objectId={id} />}
    </div>
  );
};

export default PackingRunDetails;
