import { formatPrice } from '@/lib/formatNumber';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Ban, Eye, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DataTable, { type TableAction, type TableColumn } from '@/components/ui/data-table';
import useFetchObjects from '@/api/useFetchObjects';
import { useLanguage } from '@/contexts/LanguageContext';
import { WriteOffStockDialog, type WriteOffTarget } from '@/components/stock/WriteOffStockDialog';
import { useQueryClient } from '@tanstack/react-query';

const DAYS_OPTIONS = [7, 15, 30, 60, 90] as const;
type ExpiryStatusFilter = 'all' | 'expiring' | 'expired';

const ExpiringStockList = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [daysAhead, setDaysAhead] = useState(30);
    const [expiryStatus, setExpiryStatus] = useState<ExpiryStatusFilter>('all');
    const [writeOffTarget, setWriteOffTarget] = useState<WriteOffTarget | null>(null);
    const [writeOffOpen, setWriteOffOpen] = useState(false);

    const { data, isLoading } = useFetchObjects<{ results: any[]; count: number }>({
        queryKey: ['stocks-expiring', page, pageSize, search, daysAhead, expiryStatus],
        endpoint: 'stocks/expiring/',
        params: {
            page,
            page_size: pageSize,
            search,
            days_ahead: daysAhead,
            include_expired: 1,
            ...(expiryStatus !== 'all' ? { expiry_status: expiryStatus } : {}),
        },
    });

    const columns: TableColumn[] = useMemo(() => [
        {
            key: 'batch_number',
            title: t('stock.batchNumber', 'Batch Number'),
            width: '7.5rem',
            className: 'whitespace-nowrap',
            render: (value) => <span className="font-mono text-sm">{value || '—'}</span>,
        },
        {
            key: 'product_details',
            title: t('stock.product'),
            width: '11rem',
            className: 'max-w-[11rem]',
            render: (value) => {
                const name = value?.name || '—';
                return <span className="block truncate font-medium" title={name}>{name}</span>;
            },
        },
        {
            key: 'supplier_details',
            title: t('stock.supplier', 'Supplier'),
            width: '9rem',
            className: 'max-w-[9rem]',
            render: (value) => {
                if (!value?.name) return '—';
                return (
                    <span className="inline-flex max-w-full items-center gap-1.5 text-sm text-muted-foreground">
                        <Truck className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate" title={value.name}>{value.name}</span>
                    </span>
                );
            },
        },
        {
            key: 'cartons_remaining',
            title: t('stock.carton', 'Carton'),
            width: '5rem',
            className: 'whitespace-nowrap',
            render: (value) => <span className="font-medium tabular-nums">{value || 0}</span>,
        },
        {
            key: 'remaining_pieces',
            title: t('stock.piece', 'Pieces'),
            width: '5rem',
            className: 'whitespace-nowrap',
            render: (value) => <span className="font-medium tabular-nums">{value || 0}</span>,
        },
        {
            key: 'unit_cost',
            title: t('stock.unitCost', 'Unit cost'),
            width: '9rem',
            className: 'max-w-[9rem] whitespace-nowrap',
            render: (value, record) => {
                if (value == null || value === '') return '—';
                const piecePrice = Number(value) || 0;
                const cartonPrice = piecePrice * (Number(record.product_details?.bottles_per_carton) || 8);
                return (
                    <div className="space-y-0.5 text-sm tabular-nums">
                        <div>{formatPrice(cartonPrice)} <span className="text-muted-foreground">/ {t('stock.carton', 'carton')}</span></div>
                        <div className="text-xs text-muted-foreground">{formatPrice(piecePrice)} / {t('stock.piece', 'piece')}</div>
                    </div>
                );
            },
        },
        {
            key: 'days_until_expiry',
            title: t('stock.expiry', 'Expiry'),
            width: '7.5rem',
            className: 'max-w-[7.5rem]',
            render: (value) => {
                const days = Number(value);
                if (!Number.isFinite(days)) return '—';
                if (days < 0) {
                    const label = t('stock.expiredDaysAgo', 'Expired {{n}}d ago').replace('{{n}}', String(Math.abs(days)));
                    return <Badge variant="destructive" className="max-w-full truncate" title={label}>{label}</Badge>;
                }
                if (days === 0) return <Badge variant="destructive">{t('stock.expiresToday', 'Expires today')}</Badge>;
                return <Badge variant={days <= 7 ? 'destructive' : 'secondary'}>{days} {t('stock.days', 'days')}</Badge>;
            },
        },
    ], [navigate, t]);

    const actions: TableAction[] = useMemo(() => [
        {
            key: 'view',
            label: t('common.view'),
            icon: <Eye className="h-4 w-4" />,
            onClick: (row) => {
                if (row.stock_id) navigate(`/stock/${row.stock_id}`);
                else navigate('/stock');
            },
        },
        {
            key: 'write_off',
            label: t('stock.writeOff', 'Write Off'),
            icon: <Ban className="h-4 w-4" />,
            onClick: (row) => {
                setWriteOffTarget({
                    batchId: row.id,
                    stockId: row.stock_id || null,
                    productName: row.product_details?.name,
                    availablePieces: Number(row.remaining_pieces) || 0,
                    bottlesPerCarton: Number(row.product_details?.bottles_per_carton) || 8,
                    adjustmentType: 'expired',
                });
                setWriteOffOpen(true);
            },
            show: (row) => Number(row.remaining_pieces) > 0,
            tooltip: t('stock.writeOff', 'Write Off'),
            className: 'text-red-600 hover:text-red-700',
        },
    ], [navigate, t]);

    const customFilters = [
        {
            key: 'expiry_status',
            label: t('stock.expiryStatus', 'Expiry Status'),
            component: (
                <Select value={expiryStatus} onValueChange={(value) => { setExpiryStatus(value as ExpiryStatusFilter); setPage(1); }}>
                    <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('stock.allAttention', 'All (expiring + expired)')}</SelectItem>
                        <SelectItem value="expiring">{t('stock.expiringSoon', 'Expiring Soon')}</SelectItem>
                        <SelectItem value="expired">{t('stock.expiredItems', 'Expired Items')}</SelectItem>
                    </SelectContent>
                </Select>
            ),
        },
        {
            key: 'days_ahead',
            label: t('stock.expiringWithin', 'Expiring within'),
            component: (
                <Select value={String(daysAhead)} onValueChange={(value) => { setDaysAhead(Number(value)); setPage(1); }} disabled={expiryStatus === 'expired'}>
                    <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {DAYS_OPTIONS.map((days) => <SelectItem key={days} value={String(days)}>{days} {t('stock.days', 'days')}</SelectItem>)}
                    </SelectContent>
                </Select>
            ),
        },
    ];

    return (
        <div className="p-4 sm:p-6">
            <DataTable
                data={data?.results || []}
                columns={columns}
                loading={isLoading}
                title={t('core.navigation.expiringStock')}
                subtitle={t('stock.stockItemsExpiringSoon', 'Expiring and expired lots in inventory.')}
                icon={<AlertTriangle className="h-5 w-5" />}
                searchable
                searchValue={search}
                onSearch={(value) => { setSearch(value); setPage(1); }}
                searchPlaceholder={t('stock.searchExpiringStocks', 'Search product, batch, or purchase invoice...')}
                customFilters={customFilters}
                rowActions={actions}
                pagination={{
                    current: page,
                    pageSize,
                    total: data?.count || 0,
                    onPageChange: setPage,
                    showSizeChanger: true,
                    pageSizeOptions: [10, 25, 50, 100],
                    onPageSizeChange: (size) => { setPageSize(size); setPage(1); },
                }}
                emptyTitle={t('stock.noExpiringStocks')}
                emptyDescription={t('stock.noStockItemsExpiringInPeriod', 'No stock items expiring in the selected period')}
                loadingText={t('stock.loadingExpiringStocks')}
                stickyHeader
                maxHeight="75vh"
            />
            <WriteOffStockDialog
                open={writeOffOpen}
                onOpenChange={setWriteOffOpen}
                target={writeOffTarget}
                onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ['stocks-expiring'] });
                    queryClient.invalidateQueries({ queryKey: ['stocks'] });
                }}
            />
        </div>
    );
};

export default ExpiringStockList;
