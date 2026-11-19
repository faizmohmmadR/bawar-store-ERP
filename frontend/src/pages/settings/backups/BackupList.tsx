import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Database, Download, Trash2, RefreshCw, HardDrive, AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import useFetchObjects from '@/api/useFetchObjects';
import useAdd from '@/api/useAdd';
import useDelete from '@/api/useDelete';
import DataTable, { TableColumn, TableAction } from '@/components/ui/data-table';
import api from '@/api/client';
import { useLanguage } from '@/contexts/LanguageContext';
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

interface Backup {
  filename: string;
  size: number;
  created_at: string;
  kind?: 'auto' | 'manual';
}

interface BackupListResponse {
  backups: Backup[];
  settings?: {
    restore_enabled?: boolean;
    activity_log_retention_days?: number;
    backup_retention_days?: number;
  };
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export const BackupList = () => {
  const { t } = useLanguage();
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, refetch } = useFetchObjects<BackupListResponse>({
    queryKey: ['backups', searchTerm],
    endpoint: 'backups/list/',
  });

  // Comes from backend settings.BACKUP_RESTORE_ENABLED — True shows Restore in UI.
  const restoreEnabled = Boolean(data?.settings?.restore_enabled);
  const settingsLoaded = data?.settings !== undefined;

  const { handleAdd: createBackup } = useAdd({
    queryKey: 'backups',
    endpoint: 'backups/create/',
    customSuccessMessage: t('backups.backupCreated'),
    invalidateQueries: false,
  });

  const { handleAdd: restoreBackup } = useAdd({
    queryKey: 'backups',
    endpoint: 'backups/restore/',
    customSuccessMessage: t('backups.backupRestored'),
    invalidateQueries: false,
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['backups'],
    endpoint: 'backups/delete',
    hardDelete: true,
  });

  const handleCreateBackup = () => {
    setIsCreating(true);
    createBackup({});
    setTimeout(() => {
      refetch();
      setIsCreating(false);
    }, 1000);
  };

  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);

  const handleRestore = (backup: Backup) => {
    setSelectedBackup(backup);
    setRestoreDialogOpen(true);
  };

  const confirmRestore = () => {
    if (selectedBackup) {
      restoreBackup({ filename: selectedBackup.filename });
      setTimeout(() => refetch(), 1000);
    }
    setRestoreDialogOpen(false);
    setSelectedBackup(null);
  };

  const handleDownload = async (backup: Backup) => {
    try {
      const response = await api.post('/backups/download/',
        { filename: backup.filename },
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', backup.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const backups = data?.backups || [];
  const filteredBackups = searchTerm
    ? backups.filter(b => b.filename.toLowerCase().includes(searchTerm.toLowerCase()))
    : backups;

  const columns: TableColumn<Backup>[] = [
    {
      key: 'filename',
      title: t('backups.filename'),
      width: '16rem',
      className: 'max-w-[16rem]',
      render: (value) => <span className="block truncate font-medium" title={value || '—'}>{value}</span>,
    },
    {
      key: 'kind',
      title: t('backups.type'),
      width: '7rem',
      className: 'whitespace-nowrap',
      render: (_value, row) => {
        const kind = row.kind || (row.filename?.startsWith('auto_backup_') ? 'auto' : 'manual');
        return (
          <Badge variant={kind === 'auto' ? 'secondary' : 'outline'}>
            {kind === 'auto' ? t('backups.typeAuto') : t('backups.typeManual')}
          </Badge>
        );
      },
    },
    {
      key: 'size',
      title: t('backups.size'),
      width: '6rem',
      className: 'whitespace-nowrap',
      render: (value) => (
        <Badge variant="outline">{formatBytes(value)}</Badge>
      ),
    },
    {
      key: 'created_at',
      title: t('backups.createdAt'),
      width: '9rem',
      className: 'whitespace-nowrap',
    },
  ];

  const rowActions: TableAction<Backup>[] = [
    {
      key: 'download',
      label: t('backups.download'),
      icon: <Download className="h-4 w-4" />,
      onClick: handleDownload,
      tooltip: t('backups.downloadBackup'),
    },
    ...(restoreEnabled
      ? [
          {
            key: 'restore',
            label: t('backups.restore'),
            icon: <RefreshCw className="h-4 w-4" />,
            onClick: handleRestore,
            tooltip: t('backups.restoreBackup'),
          } as TableAction<Backup>,
        ]
      : []),
    {
      key: 'delete',
      label: t('backups.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (backup) => {
        handleDelete({ filename: backup.filename }, backup.filename);
        setTimeout(() => refetch(), 500);
      },
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('backups.deleteBackup'),
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {settingsLoaded && !restoreEnabled && (
        <Alert className="border-muted-foreground/20 bg-muted/40">
          <Info className="h-4 w-4" />
          <AlertTitle>{t('backups.restoreDisabledTitle')}</AlertTitle>
          <AlertDescription className="space-y-2 text-sm">
            <p>{t('backups.restoreDisabledBody')}</p>
            <p className="font-medium text-foreground">{t('backups.restoreDisabledStepsTitle')}</p>
            <ol className="list-none space-y-1 text-muted-foreground">
              <li>{t('backups.restoreDisabledStep1')}</li>
              <li>{t('backups.restoreDisabledStep2')}</li>
              <li>{t('backups.restoreDisabledStep3')}</li>
              <li>{t('backups.restoreDisabledStep4')}</li>
            </ol>
          </AlertDescription>
        </Alert>
      )}

      {settingsLoaded && restoreEnabled && (
        <Alert className="border-orange-300 bg-orange-50 text-orange-950 dark:bg-orange-950/30 dark:text-orange-50">
          <ShieldAlert className="h-4 w-4 text-orange-700" />
          <AlertTitle>{t('backups.restoreEnabledTitle')}</AlertTitle>
          <AlertDescription className="space-y-2 text-sm">
            <p>{t('backups.restoreEnabledBody')}</p>
            <ol className="list-none space-y-1">
              <li>{t('backups.restoreEnabledStep1')}</li>
              <li>{t('backups.restoreEnabledStep2')}</li>
              <li>{t('backups.restoreEnabledStep3')}</li>
            </ol>
          </AlertDescription>
        </Alert>
      )}

      <DataTable
        data={filteredBackups}
        columns={columns}
        loading={isLoading}
        title={t('backups.title')}
        subtitle={t('backups.subtitle')}
        icon={<Database className="h-5 w-5" />}
        headerActions={
          <Button onClick={handleCreateBackup} disabled={isCreating}>
            <HardDrive className="mr-2 h-4 w-4" />
            {isCreating ? t('backups.creating') : t('backups.createBackup')}
          </Button>
        }
        searchable
        searchPlaceholder={t('backups.searchBackups')}
        searchValue={searchTerm}
        onSearch={setSearchTerm}
        showClearFilters={true}
        onClearFilters={() => setSearchTerm('')}
        rowActions={rowActions}
        emptyIcon={<Database className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('backups.noBackupsFound')}
        emptyDescription={searchTerm ? t('backups.tryAdjustingSearch') : t('backups.createFirstBackup')}
        loadingText={t('backups.loadingBackups')}
        maxHeight="75vh"
        stickyHeader={true}
        rowKey="filename"
      />
      <ConfirmDialog />

      {restoreEnabled && (
        <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-accent/15 rounded-full">
                  <AlertTriangle className="h-6 w-6 text-accent" />
                </div>
                <AlertDialogTitle className="text-xl">{t('backups.restoreDialogTitle')}</AlertDialogTitle>
              </div>
              <AlertDialogDescription className="text-base space-y-3">
                <p>
                  {t('backups.restoreDialogMessage')}{' '}
                  <span className="font-semibold">"{selectedBackup?.filename}"</span>?
                </p>
                <div className="p-3 bg-accent/10 border border-orange-200 rounded-lg">
                  <p className="text-sm text-orange-800 font-medium">⚠️ {t('backups.restoreDialogWarning')}</p>
                </div>
                <div className="p-3 bg-muted/60 border rounded-lg">
                  <p className="text-sm text-muted-foreground">{t('backups.restoreDialogHint')}</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('backups.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={confirmRestore} className="bg-orange-600 hover:bg-orange-700">
                {t('backups.restoreDatabase')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
};

export default BackupList;
