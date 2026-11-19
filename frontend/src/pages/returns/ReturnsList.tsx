import React, { useState, useEffect } from 'react';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { AdvancedFilter, FilterField, FilterValue } from '@/components/ui/advanced-filter';
import { RefreshCw } from 'lucide-react';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { Return } from '@/types/return';
import { CurrencyAmount } from '@/components/display/CurrencyAmount';
import { ListDate } from '@/components/display/ListDate';
import AddReturn from './AddReturn';
import EditReturn from './EditReturn';

export const ReturnsList: React.FC = () => {
  const { t } = useLanguage();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editFormOpen, setEditFormOpen] = useState(false);
  const [editingReturn, setEditingReturn] = useState<Return | null>(null);
  const [filters, setFilters] = useState<FilterValue>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const params: Record<string, any> = {
    page: currentPage,
    page_size: pageSize,
  };

  if (searchTerm) params.search = searchTerm;
  if (filters.sales) params.sales = filters.sales;

  const {
    data: returnsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useFetchObjects<{
    count: number;
    next: string | null;
    previous: string | null;
    results: Return[];
  }>({
    queryKey: [
      "returns",
      searchTerm,
      JSON.stringify(filters),
      currentPage.toString(),
      pageSize.toString(),
    ],
    endpoint: "returns/",
    params,
    options: {
      keepPreviousData: true,
      staleTime: 5000,
    },
  });

  const returns = returnsData?.results || [];
  const totalCount = returnsData?.count || 0;

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ["returns"],
  });

  const { data: salesData } = useFetchObjects({
    queryKey: ["sales"],
    endpoint: "sales/",
  });

  const sales = salesData?.results || [];

  useEffect(() => {
    if (isError && error) {
      toast({
        title: t("returns.errorLoading"),
        description: error.message || t("common.unknownError"),
        variant: "destructive",
        action: (
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            {t("common.retry")}
          </Button>
        ),
      });
    }
  }, [isError, error, toast, t, refetch]);

  const filterFields: FilterField[] = [
    {
      key: "sales",
      label: t("returns.sales"),
      type: "select",
      options: sales.map((sale: any) => ({ 
        value: sale.id, 
        label: `${sale.invoice_number} - ${sale.customer_details?.name || 'N/A'}` 
      })),
    },
  ];

  const columns = [
    {
      key: 'return_number' as keyof Return,
      header: t('returns.returnNumber'),
      render: (value: string) => (
        <span className="font-medium text-primary">{value}</span>
      ),
    },
    {
      key: 'sales_details' as keyof Return,
      header: t('returns.sales'),
      render: (value: any) => (
        <div>
          <div className="font-medium">{value?.invoice_number || 'N/A'}</div>
          <div className="text-sm text-muted-foreground">{value?.customer_name || 'N/A'}</div>
        </div>
      ),
    },
    {
      key: 'return_date' as keyof Return,
      header: t('returns.returnDate'),
      render: (value: string) => <ListDate value={value} />,
    },
    {
      key: 'reason' as keyof Return,
      header: t('returns.reason'),
      render: (value?: string | null) => (
        <Badge variant="outline">
          {value || "-"}
        </Badge>
      ),
    },
    {
      key: 'refund_amount' as keyof Return,
      header: t('returns.refundAmount'),
      render: (value: number, row: Return) => (
        <CurrencyAmount amount={value} currency={row.currency_details} className="font-mono" showCode />
      ),
    },
  ];

  const handleAdd = () => {
    setFormOpen(true);
  };

  const handleEdit = (returnItem: Return) => {
    setEditingReturn(returnItem);
    setEditFormOpen(true);
  };

  const handleDeleteReturn = (returnItem: Return) => {
    handleDelete(returnItem.id, `Return ${returnItem.return_number}`);
  };

  const handlePageChange = (page: number | string) => {
    setCurrentPage(typeof page === "string" ? parseInt(page, 10) : page);
  };

  const handlePageSizeChange = (size: number | string) => {
    const newSize = typeof size === "string" ? parseInt(size, 10) : size;
    setPageSize(newSize);
    setCurrentPage(1);
  };

  return (
    <>
      <DataTable
        data={
          returnsData || {
            count: 0,
            next: null,
            previous: null,
            results: [],
          }
        }
        columns={columns}
        title={t('returns.title')}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDeleteReturn}
        searchable
        filterable
        loading={isLoading}
        customFilter={
          <AdvancedFilter
            fields={filterFields}
            onApplyFilters={setFilters}
            onClearFilters={() => setFilters({})}
            currentFilters={filters}
          />
        }
        onSearch={setSearchTerm}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        currentPage={currentPage}
        pageSize={pageSize}
        totalCount={totalCount}
        enablePagination={true}
      />
      <AddReturn isOpen={formOpen} onClose={() => setFormOpen(false)} />
      <EditReturn
        isOpen={editFormOpen}
        onClose={() => setEditFormOpen(false)}
        returnItem={editingReturn}
      />
      <ConfirmDialog />
    </>
  );
};

export default ReturnsList;