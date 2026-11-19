import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Edit, FileText, ShoppingCart } from 'lucide-react';
import { ReloadIcon } from '@radix-ui/react-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import useFetchObjects from '@/api/useFetchObjects';
import { ListDate } from '@/components/display/ListDate';
import { useLanguage } from '@/contexts/LanguageContext';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';
import { formatOrderNumeric } from '@/lib/orderNumeric';
import type { RawMaterialPurchase } from '@/types/raw-material';
import OrderPaymentSection from '@/components/payments/OrderPaymentSection';
import JournalEntriesSection from '@/components/accounting/JournalEntriesSection';

type PurchaseDetails = RawMaterialPurchase & {
    vendor_details?: { name?: string; phone?: string; email?: string; address?: string };
    currency_details?: { code?: string; symbol?: string };
    remaining_amount?: string | number;
};

const RawMaterialPurchaseDetails = () => {
    const { t, direction } = useLanguage();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const BackIcon = direction === 'rtl' ? ArrowRight : ArrowLeft;
    const { data: purchase, isLoading, isError, refetch } = useFetchObjects<PurchaseDetails>({
        queryKey: ['raw-material-purchase', id],
        endpoint: `raw-material-purchases/${id}`,
        enabled: !!id,
    });

    if (isLoading) {
        return <div className="flex justify-center py-16" role="status" aria-label={t('common.loading', 'Loading…')}>
            <ReloadIcon className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>;
    }
    if (!purchase) {
        return <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
            <p className="text-muted-foreground">{isError ? t('rawMaterialPurchases.loadError', 'Unable to load purchase details.') : t('rawMaterialPurchases.purchaseNotFound')}</p>
            <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate('/raw-material-purchases')}><BackIcon className="me-2 h-4 w-4" />{t('common.back')}</Button>
                {isError && <Button onClick={() => refetch()}>{t('common.retry', 'Retry')}</Button>}
            </div>
        </div>;
    }

    const items = purchase.items || [];
    const isFree = purchase.transaction_type === 'free';
    const isForeign = Number(purchase.currency) !== 1;
    const symbol = purchase.currency_details?.symbol || resolveCurrencySymbol(purchase.currency);
    const currencyCode = purchase.currency_details?.code || purchase.currency_name || String(purchase.currency);
    const money = (value: unknown) => `${formatOrderNumeric(Number(value) || 0)} ${symbol}`;
    const baseMoney = (value: unknown) => `${formatOrderNumeric(Number(value) || 0)} ${resolveCurrencySymbol(1)}`;
    const total = Number(purchase.final_total ?? purchase.total_amount) || 0;
    const paid = Number(purchase.paid_amount) || 0;
    const due = Number(purchase.remaining_amount ?? Math.max(0, total - paid)) || 0;
    const hasPieces = items.some(item => item.raw_material_details?.unit === 'kg' && Number(item.piece_count) > 0);
    const hasNotes = items.some(item => item.notes?.trim());
    const paymentLabel = isFree ? t('common.free', 'Free')
        : due <= 0 ? t('common.paid', 'Paid')
        : paid > 0 ? t('rawMaterialPurchases.partiallyPaid', 'Partially paid') : t('rawMaterialPurchases.unpaid', 'Unpaid');
    const metadata = [
        { label: t('rawMaterialPurchases.billNumber'), value: purchase.bill_number || '—' },
        { label: t('rawMaterialPurchases.purchaseDate'), value: <ListDate value={purchase.purchase_date} /> },
        { label: t('rawMaterialPurchases.currency'), value: currencyCode },
        { label: t('common.transactionType', 'Type'), value: isFree ? t('common.free', 'Free') : t('common.paid', 'Paid') },
    ];

    return <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
                <Button variant="outline" size="icon" className="shrink-0" aria-label={t('common.back')} onClick={() => navigate('/raw-material-purchases')}>
                    <BackIcon className="h-4 w-4" />
                </Button>
                <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{t('rawMaterialPurchases.viewPurchase')}</p>
                    <h1 className="break-words text-xl font-semibold tracking-tight sm:text-2xl">{purchase.invoice_number || `#${purchase.id}`}</h1>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Badge variant={purchase.status === 'cancelled' ? 'destructive' : 'secondary'}>
                    {t(`rawMaterialPurchases.status.${purchase.status}`, purchase.status)}
                </Badge>
                {purchase.status === 'received' && <Badge variant="outline" className={isFree ? 'border-blue-200 text-blue-700 dark:text-blue-300' : due > 0 ? 'border-amber-200 text-amber-700 dark:text-amber-300' : 'border-emerald-200 text-emerald-700 dark:text-emerald-300'}>{paymentLabel}</Badge>}
                <Button variant="outline" onClick={() => navigate(`/raw-material-purchases/${id}/edit`)}><Edit className="me-2 h-4 w-4" />{t('common.edit')}</Button>
            </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
            {[
                { label: t('rawMaterialPurchases.totalAmount'), value: total, color: '', secondary: isForeign ? baseMoney(purchase.total_amount_base) : currencyCode },
                { label: t('rawMaterialPurchases.paidAmount'), value: paid, color: 'text-emerald-700 dark:text-emerald-300', secondary: t('rawMaterialPurchases.paymentStatus', 'Payment status') + ': ' + paymentLabel },
                { label: t('rawMaterialPurchases.dueAmount'), value: due, color: due > 0 ? 'text-amber-700 dark:text-amber-300' : '', secondary: isFree ? t('rawMaterialPurchases.freeNoBalance', 'Free purchase · no amount payable') : currencyCode },
            ].map(summary => <Card key={summary.label} className="shadow-none">
                <CardContent className="space-y-2 p-4 sm:p-5">
                    <p className="text-sm text-muted-foreground">{summary.label}</p>
                    <p className={`break-words text-2xl font-semibold tabular-nums ${summary.color}`}><bdi>{money(summary.value)}</bdi></p>
                    <p className="text-xs text-muted-foreground">{summary.secondary}</p>
                </CardContent>
            </Card>)}
        </div>

        <Card className="shadow-none">
            <CardContent className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <div className="min-w-0 space-y-1.5 border-b pb-4 lg:border-b-0 lg:border-e lg:pb-0 lg:pe-5">
                    <p className="text-xs font-medium text-muted-foreground">{t('rawMaterialPurchases.vendor')}</p>
                    <p className="break-words text-base font-semibold">{purchase.vendor_details?.name || purchase.vendor_name || t('common.notAvailable')}</p>
                    {purchase.vendor_details?.phone && <p className="text-sm text-muted-foreground"><bdi>{purchase.vendor_details.phone}</bdi></p>}
                    {purchase.vendor_details?.email && <p className="break-all text-sm text-muted-foreground">{purchase.vendor_details.email}</p>}
                    {purchase.vendor_details?.address && <p className="break-words text-sm text-muted-foreground">{purchase.vendor_details.address}</p>}
                </div>
                <dl className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {metadata.map(field => <div key={field.label} className="min-w-0 space-y-1.5">
                        <dt className="text-xs text-muted-foreground">{field.label}</dt>
                        <dd className="break-words text-sm font-medium">{field.value}</dd>
                    </div>)}
                    {isForeign && <div className="space-y-1.5 sm:col-span-2 xl:col-span-4">
                        <dt className="text-xs text-muted-foreground">{t('common.exchangeRate', 'Exchange rate')}</dt>
                        <dd className="text-sm"><bdi>1 {currencyCode} = {baseMoney(purchase.exchange_rate)}</bdi><span className="ms-2 text-xs text-muted-foreground">{t('costs.savedRate', 'Saved rate')}</span></dd>
                    </div>}
                </dl>
            </CardContent>
        </Card>

        <Card className="overflow-hidden shadow-none">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b bg-muted/20 px-4 py-4 sm:px-5">
                <CardTitle className="flex items-center gap-2 text-base"><ShoppingCart className="h-4 w-4 text-muted-foreground" />{t('rawMaterialPurchases.items')}</CardTitle>
                <Badge variant="secondary" className="tabular-nums">{formatOrderNumeric(items.length)}</Badge>
            </CardHeader>
            <CardContent className="p-0">
                {items.length ? <Table className="min-w-[640px] text-start">
                    <TableHeader><TableRow className="hover:bg-transparent">
                        <TableHead className="w-12 text-start">#</TableHead>
                        <TableHead className="min-w-[190px] text-start">{t('rawMaterials.name')}</TableHead>
                        <TableHead className="text-start">{t('rawMaterialPurchases.quantity')}</TableHead>
                        {hasPieces && <TableHead className="text-start">{t('rawMaterialPurchases.pieceCount')}</TableHead>}
                        <TableHead className="text-start">{t('rawMaterialPurchases.pricePerUnit')}</TableHead>
                        <TableHead className="text-start">{t('rawMaterialPurchases.totalPrice')}</TableHead>
                        {hasNotes && <TableHead className="text-start">{t('rawMaterialPurchases.notes')}</TableHead>}
                    </TableRow></TableHeader>
                    <TableBody>{items.map((item, index) => <TableRow key={item.id}>
                        <TableCell className="align-top text-start text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="align-top text-start">
                            <p className="font-medium">{item.raw_material_details?.name || item.raw_material_name || `#${item.raw_material}`}</p>
                            {item.raw_material_details?.category_name && <p className="mt-1 text-xs text-muted-foreground">{item.raw_material_details.category_name}</p>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap align-top text-start tabular-nums"><bdi>{formatOrderNumeric(Number(item.quantity))} {item.raw_material_details?.unit || ''}</bdi></TableCell>
                        {hasPieces && <TableCell className="align-top text-start tabular-nums">{item.raw_material_details?.unit === 'kg' && Number(item.piece_count) > 0 ? formatOrderNumeric(Number(item.piece_count)) : '—'}</TableCell>}
                        <TableCell className="whitespace-nowrap align-top text-start tabular-nums">
                            <bdi>{money(item.price_per_unit)}</bdi>
                            {isForeign && <p className="mt-1 text-xs text-muted-foreground"><bdi>{baseMoney(item.price_per_unit_base)}</bdi></p>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap align-top text-start tabular-nums">
                            <bdi className="font-semibold">{money(item.total_price)}</bdi>
                            {isForeign && <p className="mt-1 text-xs text-muted-foreground"><bdi>{baseMoney(item.total_price_base)}</bdi></p>}
                        </TableCell>
                        {hasNotes && <TableCell className="max-w-xs whitespace-pre-wrap break-words align-top text-start text-sm text-muted-foreground">{item.notes || '—'}</TableCell>}
                    </TableRow>)}</TableBody>
                </Table> : <p className="py-10 text-center text-sm text-muted-foreground">{t('common.noDataFound')}</p>}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-4 sm:px-5">
                    <span className="text-sm font-medium">{t('rawMaterialPurchases.totalAmount')}</span>
                    <div className="text-start tabular-nums"><bdi className="text-lg font-semibold">{money(total)}</bdi>{isForeign && <p className="text-xs text-muted-foreground"><bdi>{baseMoney(purchase.total_amount_base)}</bdi></p>}</div>
                </div>
            </CardContent>
        </Card>

        {purchase.notes?.trim() && <Card className="shadow-none">
            <CardHeader className="px-4 pb-2 pt-4 sm:px-5"><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-muted-foreground" />{t('rawMaterialPurchases.notes')}</CardTitle></CardHeader>
            <CardContent className="whitespace-pre-wrap break-words px-4 pb-4 text-sm leading-relaxed sm:px-5">{purchase.notes}</CardContent>
        </Card>}
        {purchase.status === 'received' && id && <OrderPaymentSection allowPayment={!isFree} type="purchase" orderId={id} totalAmount={total} currencySymbol={symbol} />}
        {id && <JournalEntriesSection model="rawmaterialpurchase" objectId={id} includeRelated />}
    </div>;
};

export default RawMaterialPurchaseDetails;
