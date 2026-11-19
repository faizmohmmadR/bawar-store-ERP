import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Calendar, Edit, Eye, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import DataTable, { TableAction, TableColumn } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { toApiList } from '@/lib/utils';
import { formatJournalDate, journalSourceLabel } from '@/lib/journalLabels';
import { listBadgeClass } from '@/lib/listTableFormat';

const JournalEntryList = () => {
  const { t, language } = useLanguage();
  const { calendar } = useCalendarPreference();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: entriesData, isLoading } = useFetchObjects({
    queryKey: ['journal-entries', currentPage.toString(), pageSize.toString(), searchTerm],
    endpoint: 'journal-entries',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
    },
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['journal-entries'],
    endpoint: 'journal-entries',
  });

  const entries = toApiList(entriesData);
  const totalItems = typeof entriesData === 'object' && entriesData && 'count' in entriesData
    ? (entriesData as { count: number }).count
    : entries.length;

  const columns: TableColumn[] = [
    {
      key: 'entry_date',
      title: t('accounts.date'),
      width: '8rem',
      className: 'whitespace-nowrap',
      render: (value) => (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
          <span>{formatJournalDate(value, language, { calendar })}</span>
        </div>
      ),
    },
    {
      key: 'reference_number',
      title: t('accounts.reference'),
      width: '8rem',
      className: 'max-w-[8rem]',
      render: (value) => <span className="block truncate" title={value || '-'}>{value || '-'}</span>,
    },
    {
      key: 'description',
      title: t('accounts.description'),
      width: '14rem',
      className: 'max-w-[14rem]',
      render: (value) => <span className="block truncate" title={value || '-'}>{value || '-'}</span>,
    },
    {
      key: 'source_model',
      title: t('accounts.source'),
      width: '9rem',
      className: 'max-w-[9rem]',
      render: (value, record) => (
        <span className="inline-flex max-w-full flex-wrap items-center gap-1">
          <Badge variant="outline" className={listBadgeClass}>{journalSourceLabel(value, t)}</Badge>
          {record.is_auto && (
            <Badge variant="secondary" className={listBadgeClass}>{t('accounts.autoEntry')}</Badge>
          )}
        </span>
      ),
    },
    {
      key: 'native_currency',
      title: t('accounts.currency'),
      width: '5rem',
      className: 'whitespace-nowrap',
      render: (value, record) => {
        const mixed = record.is_mixed_currency || value?.code === 'MIXED';
        return (
          <Badge variant="secondary" className={listBadgeClass}>
            {mixed
              ? t('accounts.mixedCurrencies', 'Mixed')
              : value?.code || '—'}
          </Badge>
        );
      },
    },
    {
      key: 'total_debit',
      title: t('accounts.debit'),
      width: '7.5rem',
      className: 'whitespace-nowrap tabular-nums',
      render: (value, record) => {
        const mixed = record.is_mixed_currency || record.native_currency?.code === 'MIXED';
        if (mixed) {
          return (
            <span className="text-xs text-muted-foreground">
              {Number(record.total_base_debit || 0).toLocaleString()} AFN
            </span>
          );
        }
        const code = record.native_currency?.code || '';
        return (
          <span>
            {Number(value || 0).toLocaleString()}
            {code ? ` ${code}` : ''}
          </span>
        );
      },
    },
    {
      key: 'total_credit',
      title: t('accounts.credit'),
      width: '7.5rem',
      className: 'whitespace-nowrap tabular-nums',
      render: (value, record) => {
        const mixed = record.is_mixed_currency || record.native_currency?.code === 'MIXED';
        if (mixed) {
          return (
            <span className="text-xs text-muted-foreground">
              {Number(record.total_base_credit || 0).toLocaleString()} AFN
            </span>
          );
        }
        const code = record.native_currency?.code || '';
        return (
          <span>
            {Number(value || 0).toLocaleString()}
            {code ? ` ${code}` : ''}
          </span>
        );
      },
    },
    {
      key: 'total_base_debit',
      title: t('accounts.afnEquivalentReporting'),
      render: (_, record) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {Number(record.total_base_debit || 0).toLocaleString()} /{' '}
          {Number(record.total_base_credit || 0).toLocaleString()} AFN
        </span>
      ),
    },
  ];

  const rowActions: TableAction[] = [
    {
      key: 'view',
      label: t('accounts.viewDetails'),
      icon: <Eye className="h-4 w-4" />,
      onClick: (row) => navigate(`/journal-entries/${row.id}`),
      variant: 'ghost',
      tooltip: t('accounts.viewDetails'),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: (row) => navigate(`/journal-entries/${row.id}/edit`),
      variant: 'ghost',
      tooltip: t('accounts.editJournalEntry'),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (row) => handleDelete(row.id, row.reference_number || `JE-${row.id}`),
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('accounts.deleteJournalEntry'),
    },
  ];

  return (
    <div className="page-container">
      <DataTable
        title={t('accounts.journalEntries')}
        subtitle={t('accounts.journalEntriesDesc')}
        icon={<BookOpen className="h-5 w-5" />}
        data={entries}
        columns={columns}
        rowActions={rowActions}
        searchPlaceholder={t('accounts.searchJournalEntries')}
        searchValue={searchTerm}
        onSearch={(value) => {
          setSearchTerm(value);
          setCurrentPage(1);
        }}
        pagination={{
          current: currentPage,
          pageSize,
          total: totalItems,
          onPageChange: setCurrentPage,
          showSizeChanger: true,
          onPageSizeChange: (size) => {
            setPageSize(size);
            setCurrentPage(1);
          },
        }}
        loading={isLoading}
        loadingText={t('common.loading')}
        emptyTitle={t('accounts.noJournalEntries')}
        emptyDescription={t('accounts.noJournalEntriesDesc')}
        headerActions={
          <Button onClick={() => navigate('/journal-entries/add')}>
            <Plus className="h-4 w-4" />
            {t('accounts.addJournalEntry')}
          </Button>
        }
      />
      <ConfirmDialog />
    </div>
  );
};

export default JournalEntryList;
