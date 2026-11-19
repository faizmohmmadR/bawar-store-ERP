import { DualCurrencyCosts, DualCurrencyAmount } from '@/components/display/DualCurrencyCosts';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Factory, Layers, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ListDate } from '@/components/display/ListDate';
import { ReloadIcon } from '@radix-ui/react-icons';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import type { RawMaterialProcess } from '@/types/raw-material-process';

const RawMaterialProcessDetails = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const { data: process, isLoading } = useFetchObjects<RawMaterialProcess>({
        queryKey: ['raw-material-process', id],
        endpoint: `raw-material-processes/${id}`,
        enabled: !!id,
    });

    if (isLoading) {
        return <div className="flex justify-center py-8"><ReloadIcon className="h-8 w-8 animate-spin" /></div>;
    }
    if (!process) {
        return (
            <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
                <p className="text-muted-foreground">{t('rawMaterialProcesses.processNotFound')}</p>
                <Button variant="outline" onClick={() => navigate('/raw-material-processes')}>
                    <ArrowLeft className="me-2 h-4 w-4" />{t('rawMaterialProcesses.backToList')}
                </Button>
            </div>
        );
    }

    const amount = (value: string | number, digits = 4) =>
        Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits });

    return (
        <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
            <header className="flex items-center gap-3 border-b pb-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/raw-material-processes')}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-2xl font-semibold">{process.product_name}</h1>
                    <p className="font-mono text-sm text-muted-foreground">{process.process_number}</p>
                </div>
                <Button variant="outline" onClick={() => navigate(`/raw-material-processes/${process.id}/edit`)}>
                    <Pencil className="me-2 h-4 w-4" />{t('rawMaterialProcesses.editProcess')}
                </Button>
                <Factory className="h-5 w-5 text-muted-foreground" />
            </header>
            <DualCurrencyCosts rate={process.usd_to_afn_rate ?? null} rows={[
              { label: t('rawMaterialProcesses.costPerKilogram'), afn: process.cost_per_kg_afn },
              { label: t('rawMaterialProcesses.totalCost'), afn: process.total_cost_afn },
            ]} />

            <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
                <Card>
                    <CardHeader><CardTitle>{t('rawMaterialProcesses.processDetails')}</CardTitle></CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                        <div><p className="text-sm text-muted-foreground">{t('rawMaterialProcesses.productionName')}</p><p className="font-medium">{process.product_name}</p></div>
                        <div><p className="text-sm text-muted-foreground">{t('rawMaterialProcesses.processDate')}</p><ListDate value={process.process_date} /></div>
                        <div><p className="text-sm text-muted-foreground">{t('rawMaterialProcesses.processStatus')}</p><Badge variant="outline">{t(`rawMaterialProcesses.status${process.status === 'in_process' ? 'InProcess' : process.status === 'completed' ? 'Completed' : 'MovedToStorage'}`)}</Badge></div>
                        <div><p className="text-sm text-muted-foreground">{t('rawMaterialProcesses.extraExpense')}</p><p className="font-medium"><DualCurrencyAmount afn={process.extra_expense_afn ?? process.extra_expense} rate={process.usd_to_afn_rate} /></p></div>
                        {process.notes && <div className="sm:col-span-2"><p className="text-sm text-muted-foreground">{t('rawMaterialProcesses.notes')}</p><p>{process.notes}</p></div>}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>{t('rawMaterialProcesses.summary')}</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        <div className="space-y-2 rounded-lg bg-muted/20 p-3 text-sm">
                          <div className="flex justify-between gap-3"><span>{t('rawMaterialProcesses.chemistryWeight')}</span><bdi dir="ltr">{amount(process.chemistry_quantity_kg || '0')} kg</bdi></div>
                          <div className="flex justify-between gap-3"><span>{t('rawMaterialProcesses.materialsWeight')}</span><bdi dir="ltr">{amount(process.materials_quantity_kg || '0')} kg</bdi></div>
                          <div className="flex justify-between gap-3"><span>{t('rawMaterialProcesses.water')}</span><bdi dir="ltr">{amount(process.water_quantity_kg)} kg</bdi></div>
                          <div className="flex justify-between gap-3 border-t pt-2 font-semibold"><span>{t('rawMaterialProcesses.totalMixtureWeight')}</span><bdi dir="ltr">{amount(process.total_input_quantity_kg || '0')} kg</bdi></div>
                        </div>

                        <div className="flex justify-between gap-3"><span className="text-muted-foreground">{t('rawMaterialProcesses.materialCost')}</span><span className="font-medium"><DualCurrencyAmount afn={process.material_cost_afn} rate={process.usd_to_afn_rate} /></span></div>
                        <div className="flex justify-between gap-3"><span className="text-muted-foreground">{t('rawMaterialProcesses.extraExpenseAfn')}</span><span className="font-medium"><DualCurrencyAmount afn={process.extra_expense_afn} rate={process.usd_to_afn_rate} /></span></div>
                        <div className="flex justify-between gap-3 border-t pt-3"><span className="font-medium">{t('rawMaterialProcesses.totalCost')}</span><span className="font-bold"><DualCurrencyAmount afn={process.total_cost_afn} rate={process.usd_to_afn_rate} /></span></div>
                        <div className="flex justify-between gap-3"><span className="font-medium">{t('rawMaterialProcesses.costPerKilogram')}</span><span className="font-bold text-primary"><DualCurrencyAmount afn={process.cost_per_kg_afn} rate={process.usd_to_afn_rate} /></span></div>
                        <div className="flex justify-between gap-3"><span className="font-medium">{t('rawMaterialProcesses.outputKilograms')}</span><span className="font-bold">{amount(process.output_quantity_kg)} kg</span></div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Layers className="h-4 w-4" />{t('rawMaterialProcesses.ingredients')}</CardTitle></CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader><TableRow>
                                <TableHead>{t('rawMaterials.name')}</TableHead>
                                <TableHead className="text-right">{t('rawMaterialProcesses.quantityToUse')}</TableHead>
                                <TableHead className="text-right">{t('rawMaterialProcesses.pieceCountToUse')}</TableHead>
                                <TableHead className="text-right">{t('rawMaterialProcesses.materialCost')}</TableHead>
                                <TableHead>{t('rawMaterialProcesses.allocationSources')}</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                                {process.items.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-medium">{item.raw_material_details.name}</TableCell>
                                        <TableCell className="text-right tabular-nums">{amount(item.quantity)} {item.raw_material_details.unit}</TableCell>
                                        <TableCell className="text-right tabular-nums">{item.raw_material_details.unit === 'kg' ? Number(item.piece_count).toLocaleString() : '—'}</TableCell>
                                        <TableCell className="text-right tabular-nums"><DualCurrencyAmount afn={item.material_cost_afn} rate={process.usd_to_afn_rate} /></TableCell>
                                        <TableCell className="min-w-[18rem]">
                                            {item.purchase_sources.length === 0 ? (
                                                <span className="text-muted-foreground">—</span>
                                            ) : (
                                                <div className="space-y-2">
                                                    {item.purchase_sources.map((source) => (
                                                        <div key={source.purchase_item || 'stock'} className="border-b pb-2 last:border-0 last:pb-0">
                                                            <p className="font-medium">{source.source === 'stock' ? t('rawMaterialProcesses.stockSource') : source.purchase_invoice_number}</p>
                                                            <p className="text-xs text-muted-foreground">{t('rawMaterialProcesses.supplierBill')}: {source.supplier_bill_number || '—'}</p>
                                                            <p className="text-xs text-muted-foreground">{t('rawMaterialProcesses.allocatedQuantity')}: {amount(source.quantity)} {item.raw_material_details.unit}{source.piece_count ? `, ${source.piece_count} ${t('rawMaterialProcesses.pieceCountToUse')}` : ''}</p>
                                                            <p className="text-xs text-muted-foreground"><DualCurrencyAmount afn={source.unit_cost_afn} rate={process.usd_to_afn_rate} /> / {item.raw_material_details.unit} · {t('rawMaterialProcesses.totalCost')}: <DualCurrencyAmount afn={source.total_cost_afn} rate={process.usd_to_afn_rate} /></p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                <TableRow>
                                    <TableCell className="font-medium">{t('rawMaterialProcesses.water')}</TableCell>
                                    <TableCell className="text-right tabular-nums">{amount(process.water_quantity_kg)} kg</TableCell>
                                    <TableCell className="text-right">—</TableCell>
                                    <TableCell className="text-right tabular-nums"><DualCurrencyAmount afn={0} rate={process.usd_to_afn_rate} /></TableCell>
                                    <TableCell>—</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {process.status === 'moved_to_storage' && <Card>
                <CardHeader><CardTitle>{t('rawMaterialProcesses.storageTankTransfers')}</CardTitle></CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader><TableRow>
                                <TableHead>{t('rawMaterialProcesses.storageTankName')}</TableHead>
                                <TableHead className="text-right">{t('rawMaterialProcesses.transferQuantity')}</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                                {process.storage_transfers.length ? process.storage_transfers.map((transfer) => (
                                    <TableRow key={transfer.id}>
                                        <TableCell className="font-medium">{transfer.storage_tank_name}</TableCell>
                                        <TableCell className="text-right tabular-nums">{amount(transfer.quantity_kg)} kg</TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={2} className="text-muted-foreground">{t('rawMaterialProcesses.noStorageTransfers')}</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>}
        </div>
    );
};

export default RawMaterialProcessDetails;
