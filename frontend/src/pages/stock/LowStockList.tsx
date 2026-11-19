import { formatPrice } from '@/lib/formatNumber';
import { getCurrencySymbol } from '@/lib/currencies';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit, Trash2, Eye, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Autocomplete } from '@/components/ui/autocomplete';
import DataTable, { TableColumn, TableAction } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import {
  DEFAULT_PIECES_PER_CARTON,
  cartonsFromPieces,
  remainderPieces,
} from '@/lib/packaging';
import { stockPieces } from '@/lib/stockApi';

const LowStockList = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: stocksData, isLoading } = useFetchObjects<{
    results: any[];
    count: number;
  }>({
    queryKey: ['stocks-low', currentPage.toString(), pageSize.toString(), searchTerm, productFilter],
    endpoint: 'stocks/',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      stock_status: 'low_stock',
      condition: 'good',
      ...(productFilter && { product: productFilter }),
    },
  });

  const { handleDelete, ConfirmDialog } = useDelete({ queryKey: ['stocks'], endpoint: 'stocks' });

  const stocks = stocksData?.results || [];
  const totalItems = stocksData?.count || 0;

  const columns: TableColumn[] = [
    {
      key: 'product_details',
      title: t('stock.product'),
      width: '11rem',
      className: 'max-w-[11rem]',
      render: (value) => {
        const name = value?.name || t('stock.notAvailable');
        return <span className="block truncate font-medium" title={name}>{name}</span>;
      },
    },
    {
      key: 'carton_amount',
      title: t('stock.carton', 'Carton'),
      width: '5rem',
      className: 'whitespace-nowrap',
      render: (_value, record) => (
        <span className="font-medium tabular-nums text-accent">
          {cartonsFromPieces(stockPieces(record), Number(record.product_details?.bottles_per_carton) || DEFAULT_PIECES_PER_CARTON)}
        </span>
      ),
    },
    {
      key: 'loose_pieces',
      title: t('stock.piece', 'Pieces'),
      width: '5rem',
      className: 'whitespace-nowrap',
      render: (_value, record) => (
        <span className="font-medium tabular-nums">
          {remainderPieces(stockPieces(record), Number(record.product_details?.bottles_per_carton) || DEFAULT_PIECES_PER_CARTON)}
        </span>
      ),
    },
    {
      key: 'status',
      title: t('common.status', 'Status'),
      width: '6.5rem',
      className: 'max-w-[6.5rem]',
      render: (_value, record) => {
        const pieces = stockPieces(record);
        const isOut = Number(pieces) <= 0;
        const label = isOut ? t('stock.outOfStock', 'Out of Stock') : t('stock.lowStock');
        return (
          <Badge variant={isOut ? 'destructive' : 'secondary'} className="max-w-full truncate text-xs" title={label}>
            {label}
          </Badge>
        );
      },
    },
    {
      key: 'buy_price',
      title: t('stock.price', 'Price'),
      width: '9rem',
      className: 'max-w-[9rem] whitespace-nowrap',
      render: (value, record) => {
        const piecePrice = Number(value) || 0;
        const cartonSize = Number(record.product_details?.bottles_per_carton) || DEFAULT_PIECES_PER_CARTON;
        const cartonPrice = piecePrice * cartonSize;
        const symbol = getCurrencySymbol(record.currency_details);
        return (
          <div className="space-y-0.5 text-sm">
            <div>
              {symbol}{formatPrice(cartonPrice)}
              <span className="text-muted-foreground"> / {t('stock.carton', 'carton')}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {symbol}{formatPrice(piecePrice)} / {t('stock.piece', 'piece')}
            </div>
          </div>
        );
      },
    },
  ];

  const rowActions: TableAction[] = [
    {
      key: 'view',
      label: t('stock.viewDetails'),
      icon: <Eye className="h-4 w-4" />,
      onClick: (record) => navigate(`/stock/${record.id}`),
      tooltip: t('stock.viewDetails'),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: (record) => navigate(`/stock/${record.id}/edit`),
      tooltip: t('stock.editStock'),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => handleDelete(record.id, record.product_details?.name || t('stock.stock')),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('stock.deleteStock'),
    },
  ];

  const customFilters = [
    {
      key: 'product',
      label: t('stock.product'),
      component: (
        <Autocomplete
          endpoint="products"
          getOptionLabel={(p) => p.name}
          getOptionValue={(p) => p.id.toString()}
          value={productFilter}
          onChange={(value) => {
            setProductFilter(value?.toString() || '');
            setCurrentPage(1);
          }}
          placeholder={t('stock.filterByProduct')}
          className="w-48"
        />
      ),
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={stocks}
        columns={columns}
        loading={isLoading}
        title={t('stock.lowStockItems')}
        subtitle={t('stock.stockItemsRunningLow')}
        icon={<TrendingDown className="h-5 w-5" />}
        searchable
        searchPlaceholder={t('stock.searchLowStocks')}
        searchValue={searchTerm}
        onSearch={(value) => {
          setSearchTerm(value);
          setCurrentPage(1);
        }}
        customFilters={customFilters}
        rowActions={rowActions}
        pagination={{
          current: currentPage,
          pageSize,
          total: totalItems,
          onPageChange: setCurrentPage,
          showSizeChanger: true,
          pageSizeOptions: [10, 25, 50, 100],
          onPageSizeChange: (size) => {
            setPageSize(size);
            setCurrentPage(1);
          },
        }}
        emptyIcon={<TrendingDown className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('stock.noLowStockItems')}
        emptyDescription={t('stock.allStockLevelsAdequate')}
        loadingText={t('stock.loadingLowStocks')}
        maxHeight="75vh"
        stickyHeader={true}
      />
      <ConfirmDialog />
    </div>
  );
};

export default LowStockList;
