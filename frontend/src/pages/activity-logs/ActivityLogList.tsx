import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Autocomplete } from '@/components/ui/autocomplete';
import { Input } from '@/components/ui/input';
import DataTable, { TableColumn } from '@/components/ui/data-table';
import { ActivityLog } from '@/types/activity-log';
import useFetchObjects from '@/api/useFetchObjects';
import { formatListContactLine, listBadgeClass, listTextClass } from '@/lib/listTableFormat';
import { ListDate } from '@/components/display/ListDate';
import { Activity } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

const ActivityLogList = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: logsData, isLoading } = useFetchObjects<{
    results: ActivityLog[];
    count: number;
  }>({
    queryKey: ['activity-logs', currentPage.toString(), pageSize.toString(), searchTerm, actionFilter, modelFilter, userFilter],
    endpoint: 'activity-logs',
    params: {
      page: currentPage,
      page_size: pageSize,
      search: searchTerm,
      ...(actionFilter && { action: actionFilter }),
      ...(modelFilter && { model_name: modelFilter }),
      ...(userFilter && { user: userFilter }),
    },
  });

  const logs = logsData?.results || [];
  const totalItems = logsData?.count || 0;

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      create: 'bg-primary/100',
      update: 'bg-primary/100',
      delete: 'bg-red-500',
      login: 'bg-accent/100',
      logout: 'bg-gray-500',
      view: 'bg-primary',
      export: 'bg-accent/100',
      payment: 'bg-yellow-500',
    };
    return colors[action] || 'bg-gray-500';
  };

  const columns: TableColumn[] = [
    {
      key: 'created_at',
      title: t('activityLogs.dateTime'),
      className: 'whitespace-nowrap',
      render: (value) => <ListDate value={value} />,
    },
    {
      key: 'user_name',
      title: t('activityLogs.user'),
      className: 'max-w-[180px]',
      render: (value, record) => {
        const line = formatListContactLine(value, record.user_email);
        return (
          <span className={`${listTextClass} truncate block`} title={line}>
            {line}
          </span>
        );
      },
    },
    {
      key: 'user_role',
      title: t('activityLogs.role'),
      width: '6.5rem',
      className: 'max-w-[6.5rem]',
      render: (value) => <Badge variant="outline" className={`${listBadgeClass} max-w-full truncate`}>{value}</Badge>
    },
    {
      key: 'action',
      title: t('activityLogs.action'),
      width: '7rem',
      className: 'max-w-[7rem]',
      render: (value) => {
        const label = t(`activityLogs.actions.${value}`) || value;
        return (
          <Badge className={`${getActionColor(value)} max-w-full truncate`} title={label}>
            {label}
          </Badge>
        );
      }
    },
    {
      key: 'model_name',
      title: t('activityLogs.model'),
      width: '8rem',
      className: 'max-w-[8rem]',
      render: (value) => {
        const label = String(value || '')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        return (
          <span className="block truncate font-mono text-sm" title={label}>
            {label}
          </span>
        );
      }
    },
    {
      key: 'description',
      title: t('activityLogs.description'),
      width: '14rem',
      className: 'max-w-[14rem]',
      render: (value) => (
        <div className="truncate" title={value}>{value}</div>
      )
    },
    {
      key: 'ip_address',
      title: t('activityLogs.ipAddress'),
      render: (value) => (
        <span className="text-sm text-muted-foreground">{value || '-'}</span>
      )
    }
  ];

  const customFilters = [
    {
      key: 'action',
      label: t('activityLogs.action'),
      component: (
        <Autocomplete
          options={[
            { value: 'create', label: t('activityLogs.actions.create') },
            { value: 'update', label: t('activityLogs.actions.update') },
            { value: 'delete', label: t('activityLogs.actions.delete') },
            { value: 'login', label: t('activityLogs.actions.login') },
            { value: 'logout', label: t('activityLogs.actions.logout') },
            { value: 'view', label: t('activityLogs.actions.view') },
            { value: 'export', label: t('activityLogs.actions.export') },
            { value: 'payment', label: t('activityLogs.actions.payment') },
          ]}
          value={actionFilter}
          onChange={(value) => {
            setActionFilter(value == null ? '' : String(value));
            setCurrentPage(1);
          }}
          placeholder={t('activityLogs.filterByAction')}
        />
      )
    },
    {
      key: 'model',
      label: t('activityLogs.model'),
      component: (
        <Input
          value={modelFilter}
          onChange={(e) => {
            setModelFilter(e.target.value);
            setCurrentPage(1);
          }}
          placeholder={t('activityLogs.filterByModel')}
        />
      )
    },
    {
      key: 'user',
      label: t('activityLogs.user'),
      component: (
        <Autocomplete
          endpoint="users"
          getOptionLabel={(u) => `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || u.username}
          getOptionValue={(u) => u.id.toString()}
          value={userFilter}
          onChange={(value) => {
            setUserFilter(value == null ? '' : String(value));
            setCurrentPage(1);
          }}
          placeholder={t('activityLogs.filterByUser')}
        />
      )
    }
  ];

  const handleClearFilters = () => {
    setActionFilter('');
    setModelFilter('');
    setUserFilter('');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const hasActiveFilters = actionFilter || modelFilter || userFilter || searchTerm;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={logs}
        columns={columns}
        loading={isLoading}
        title={t('activityLogs.title')}
        subtitle={t('activityLogs.subtitle')}
        icon={<Activity className="h-5 w-5" />}
        searchable
        searchPlaceholder={t('common.search')}
        searchValue={searchTerm}
        onSearch={(value) => {
          setSearchTerm(value);
          setCurrentPage(1);
        }}
        customFilters={customFilters}
        showClearFilters={hasActiveFilters}
        clearFiltersLabel={t('common.clearFilters')}
        onClearFilters={handleClearFilters}
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
          }
        }}
        emptyIcon={<Activity className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('activityLogs.noLogsFound')}
        emptyDescription={searchTerm ? t('common.noSearchResults') : t('activityLogs.noActivitiesLogged')}
        loadingText={t('activityLogs.loadingLogs')}
        maxHeight="75vh"
        stickyHeader={true}
      />
    </div>
  );
};

export default ActivityLogList;
