import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { notifySuccess } from '@/lib/notify';
import useFetchObjects from '@/api/useFetchObjects';
import api from '@/api/client';
import DataTable, { TableAction, TableColumn } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface TrashItem {
  id: number;
  model: string;
  model_label: string;
  label: string;
  deleted_at: string;
  deleted_by: number | null;
  deleted_by_name: string | null;
  branch_id: number | null;
  branch_name: string | null;
  purge_at: string;
  days_until_purge: number;
}

interface TrashResponse {
  retention_days: number;
  count: number;
  results: TrashItem[];
}

const TRASH_MODEL_KEYS = [
  'equipment',
  'expenses',
  'customers',
  'vendors',
  'packing-runs',
  'products',
  'employees',
  'payrolls',
  'sales',
  'returns',
  'payments',
  'withdrawals',
  'loans',
  'stocks',
  'accounts',
  'currency-exchanges',
  'fx-revaluations',
] as const;

export const TrashPage = () => {
  const { t } = useLanguage();
  const { formatDateTime } = useFormatAppDate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [modelFilter, setModelFilter] = useState('all');
  const [dialogMode, setDialogMode] = useState<'restore' | 'permanent' | null>(null);
  const [selectedItems, setSelectedItems] = useState<TrashItem[]>([]);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [actionErrors, setActionErrors] = useState<string[]>([]);

  const { data, isLoading, refetch } = useFetchObjects<TrashResponse>({
    queryKey: ['trash', searchTerm, modelFilter],
    endpoint: 'trash/',
    params: {
      ...(searchTerm ? { search: searchTerm } : {}),
      ...(modelFilter !== 'all' ? { model: modelFilter } : {}),
    },
  });

  const modelLabel = useCallback((key: string, fallback: string) => {
    const translated = t(`trash.modelTypes.${key}`);
    return translated !== `trash.modelTypes.${key}` ? translated : fallback;
  }, [t]);

  const actionMutation = useMutation({
    mutationFn: async ({ items, mode }: { items: TrashItem[]; mode: 'restore' | 'permanent' }) => {
      const response = await api.post<{
        results: { model: string; id: number }[];
        errors: { model: string; id: number; detail: string }[];
        succeeded: number;
        failed: number;
      }>(mode === 'restore' ? 'trash/restore/' : 'trash/permanent-delete/', {
        items: items.map(({ model, id }) => ({ model, id })),
      });
      return response.data;
    },
    onSuccess: (result, { items, mode }) => {
      const completed = new Set(result.results.map((item) => `${item.model}-${item.id}`));
      setSelectedRows((previous) => previous.filter((key) => !completed.has(key)));
      setActionErrors(result.errors.map((error) => {
        const label = items.find((item) => item.model === error.model && item.id === error.id)?.label;
        return `${label || `${error.model} #${error.id}`}: ${error.detail}`;
      }));
      if (result.succeeded) {
        notifySuccess(`${result.succeeded} — ${t(mode === 'restore' ? 'trash.restoreSuccess' : 'trash.permanentDeleteSuccess')}`);
      }
      if (result.failed) toast.error(t('trash.bulkFailed').replace('{{count}}', String(result.failed)));
      queryClient.invalidateQueries();
      closeDialog();
      refetch();
    },
    onError: (error: AxiosError<{ detail?: string }>, { mode }) => {
      toast.error(error.response?.data?.detail || t(mode === 'restore' ? 'trash.restoreFailed' : 'trash.permanentDeleteFailed'));
    },
  });

  const openDialog = (item: TrashItem | TrashItem[], mode: 'restore' | 'permanent') => {
    if (actionMutation.isPending) return;
    const selection = Array.isArray(item) ? item : [item];
    if (!selection.length) return;
    if (selection.length > 100) {
      toast.error(t('trash.batchLimit'));
      return;
    }
    setActionErrors([]);
    setSelectedItems(selection);
    setDialogMode(mode);
  };

  const closeDialog = () => {
    setDialogMode(null);
    setSelectedItems([]);
  };

  const confirmAction = () => {
    if (!selectedItems.length || !dialogMode || actionMutation.isPending) return;
    actionMutation.mutate({ items: selectedItems, mode: dialogMode });
  };

  const items = useMemo(() => data?.results ?? [], [data]);
  useEffect(() => {
    const visible = new Set(items.map((item) => `${item.model}-${item.id}`));
    setSelectedRows((previous) => {
      const remaining = previous.filter((key) => visible.has(key));
      return remaining.length === previous.length ? previous : remaining;
    });
  }, [items]);
  const retentionDays = data?.retention_days ?? 30;

  const modelFilterOptions = useMemo(
    () =>
      TRASH_MODEL_KEYS.map((key) => ({
        value: key,
        label: modelLabel(key, key),
      })),
    [modelLabel],
  );

  const columns: TableColumn<TrashItem>[] = [
    {
      key: 'label',
      title: t('trash.item'),
      render: (_value, row) => <span className="font-medium">{row.label}</span>,
    },
    {
      key: 'model',
      title: t('trash.type'),
      render: (_value, row) => (
        <Badge variant="outline">{modelLabel(row.model, row.model_label)}</Badge>
      ),
    },
    {
      key: 'deleted_at',
      title: t('trash.deletedAt'),
      render: (value) => formatDateTime(value),
    },
    {
      key: 'deleted_by_name',
      title: t('trash.deletedBy'),
      render: (value) => value || '—',
    },
    {
      key: 'branch_name',
      title: t('trash.branch'),
      render: (value) => value || '—',
    },
    {
      key: 'days_until_purge',
      title: t('trash.daysLeft'),
      render: (value: number) =>
        value <= 0 ? (
          <Badge variant="destructive">{t('trash.purgeToday')}</Badge>
        ) : (
          <Badge variant="secondary">{t('trash.daysLeftValue').replace('{{days}}', String(value))}</Badge>
        ),
    },
  ];

  const rowActions: TableAction<TrashItem>[] = [
    {
      key: 'restore',
      label: t('trash.restore'),
      icon: <RotateCcw className="h-4 w-4" />,
      onClick: (item) => openDialog(item, 'restore'),
      tooltip: t('trash.restoreItem'),
    },
    {
      key: 'permanent-delete',
      label: t('trash.deletePermanently'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (item) => openDialog(item, 'permanent'),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('trash.deletePermanently'),
    },
  ];

  const dialogTitle =
    dialogMode === 'restore' ? t('trash.restoreDialogTitle') : t('trash.permanentDeleteDialogTitle');
  const dialogMessage = selectedItems.length > 1
    ? t(dialogMode === 'restore' ? 'trash.bulkRestoreMessage' : 'trash.bulkDeleteMessage')
      .replace('{{count}}', String(selectedItems.length))
    : dialogMode === 'restore'
      ? t('trash.restoreDialogMessage').replace('{{item}}', selectedItems[0]?.label ?? '')
      : t('trash.permanentDeleteDialogMessage').replace('{{item}}', selectedItems[0]?.label ?? '');


  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {t('trash.retentionHint').replace('{{days}}', String(retentionDays))}
      </div>

      {actionErrors.length > 0 && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <ul className="list-disc space-y-1 ps-4">{actionErrors.map((error, index) => <li key={index}>{error}</li>)}</ul>
        </div>
      )}
      <DataTable
        selectable
        selectedRows={selectedRows}
        onSelectionChange={(rows) => !actionMutation.isPending && setSelectedRows(rows.map(String))}
        bulkActions={[
          { key: 'bulk-restore', label: t('trash.restoreSelected'), icon: <RotateCcw className="h-4 w-4" />, onClick: (rows) => openDialog(rows, 'restore') },
          { key: 'bulk-delete', label: t('trash.deleteSelected'), icon: <Trash2 className="h-4 w-4" />, variant: 'destructive', onClick: (rows) => openDialog(rows, 'permanent') },
        ]}
        data={items}
        columns={columns}
        loading={isLoading}
        title={t('trash.title')}
        subtitle={t('trash.subtitle')}
        icon={<Trash2 className="h-5 w-5" />}
        searchable
        searchPlaceholder={t('trash.searchPlaceholder')}
        searchValue={searchTerm}
        onSearch={setSearchTerm}
        showClearFilters={searchTerm !== '' || modelFilter !== 'all'}
        onClearFilters={() => {
          setSearchTerm('');
          setModelFilter('all');
        }}
        filters={[
          {
            key: 'model',
            label: t('trash.filterByType'),
            placeholder: t('trash.filterByType'),
            options: modelFilterOptions,
          },
        ]}
        filterValues={{ model: modelFilter }}
        onFilterChange={(_key, value) => setModelFilter(value)}
        rowActions={rowActions}
        emptyIcon={<Trash2 className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('trash.emptyTitle')}
        emptyDescription={searchTerm || modelFilter !== 'all' ? t('trash.tryAdjustingSearch') : t('trash.emptyDescription')}
        loadingText={t('trash.loading')}
        maxHeight="75vh"
        stickyHeader
        rowKey={(row) => `${row.model}-${row.id}`}
      />

      <AlertDialog open={dialogMode !== null} onOpenChange={(open) => !open && !actionMutation.isPending && closeDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div
                className={`p-2 rounded-full ${
                  dialogMode === 'restore' ? 'bg-emerald-100' : 'bg-red-100'
                }`}
              >
                {dialogMode === 'restore' ? (
                  <RotateCcw className="h-6 w-6 text-emerald-700" />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                )}
              </div>
              <AlertDialogTitle className="text-xl">{dialogTitle}</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base">{dialogMessage}</AlertDialogDescription>
            {selectedItems.length > 1 && (
              <ul className="max-h-48 overflow-y-auto rounded border p-3 text-start text-sm space-y-2">
                {selectedItems.map((item) => <li key={`${item.model}-${item.id}`}>
                  <span className="font-medium">{item.label}</span>
                  <span className="ms-2 text-muted-foreground">{modelLabel(item.model, item.model_label)}</span>
                </li>)}
              </ul>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionMutation.isPending}>{t('trash.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionMutation.isPending}
              onClick={(event) => { event.preventDefault(); confirmAction(); }}
              className={
                dialogMode === 'restore'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-red-600 hover:bg-red-700'
              }
            >
              {dialogMode === 'restore' ? t('trash.restore') : t('trash.deletePermanently')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TrashPage;
