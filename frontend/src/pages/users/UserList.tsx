import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Eye, Users, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import DataTable, { TableColumn, TableAction, FilterOption } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionContext';
import { PermissionGuard } from '@/components/ui/permission-guard';
import { isHqAdminUser } from '@/lib/apps';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';

export const UserList = () => {
  const { t } = useLanguage();
  const { user: authUser } = useAuth();
  const navigate = useNavigate();
  const { hasPermission, hasAnyPermission } = usePermissions();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const isHqAdmin = isHqAdminUser(authUser);

  const { data: usersData, isLoading } = useFetchObjects<{
    results: any[];
    count: number;
    next: string | null;
    previous: string | null;
  }>({
    queryKey: ['users', currentPage.toString(), pageSize.toString(), searchTerm, roleFilter, statusFilter],
    endpoint: 'users',
    params: {
      page: currentPage,
      page_size: pageSize,
      ...(searchTerm && { search: searchTerm }),
      ...(roleFilter !== 'all' && { role: roleFilter }),
      ...(statusFilter !== 'all' && { is_active: statusFilter === 'active' }),
    }
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['users'],
    endpoint: 'users'
  });

  const users = usersData?.results || [];
  const totalItems = usersData?.count || 0;

  const handleEdit = (user: any) => {
    navigate(`/users/${user.id}/edit`);
  };

  const handleDetails = (user: any) => {
    navigate(`/users/${user.id}`);
  };

  const getRoleColor = (role: string) => {
    switch (role.toLowerCase()) {
      case 'admin':
        return 'destructive';
      case 'staff':
        return 'default';
      case 'employee':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const columns: TableColumn[] = [
    {
      key: 'profile',
      title: t('user.user'),
      width: '14rem',
      className: 'max-w-[14rem]',
      render: (value, record) => {
        const name = record.first_name && record.last_name
          ? `${record.first_name} ${record.last_name}`
          : record.email;
        return (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={record.profile_picture} />
              <AvatarFallback>
                {(record.first_name?.[0] || record.email?.[0] || '?').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate font-medium" title={name}>{name}</div>
              <div className="truncate text-sm text-muted-foreground" title={record.email}>{record.email}</div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'phone',
      title: t('user.phone'),
      width: '8rem',
      className: 'whitespace-nowrap',
      render: (value) => value || '-',
    },
    {
      key: 'role',
      title: t('user.role'),
      width: '7rem',
      className: 'max-w-[7rem]',
      render: (value) => (
        <Badge variant={getRoleColor(value)} className="max-w-full truncate">
          {t(`user.roles.${value}`)}
        </Badge>
      ),
    },
    {
      key: 'is_active',
      title: t('user.status'),
      width: '5.5rem',
      className: 'max-w-[5.5rem]',
      render: (value) => (
        <Badge variant={value ? 'default' : 'secondary'}>
          {value ? t('user.active') : t('user.inactive')}
        </Badge>
      ),
    },
  ];

  const rowActions: TableAction[] = [
    hasPermission('view_users') && {
      key: 'view',
      label: t('user.viewDetails'),
      icon: <Eye className="h-4 w-4" />,
      onClick: handleDetails,
      tooltip: t('user.viewDetails')
    },
    hasPermission('edit_users') && {
      key: 'edit',
      label: t('common.edit'),
      icon: <Edit className="h-4 w-4" />,
      onClick: handleEdit,
      tooltip: t('user.editUserAction')
    },
    hasAnyPermission(['view_permissions', 'edit_permissions']) && {
      key: 'permissions',
      label: t('user.permissions'),
      icon: <Shield className="h-4 w-4" />,
      onClick: (record) => navigate(`/users/${record.id}/permissions`),
      tooltip: t('user.managePermissions')
    },
    hasPermission('delete_users') && {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (record) => {
        const displayName = record.first_name && record.last_name
          ? `${record.first_name} ${record.last_name}`
          : record.email;
        handleDelete(record.id, displayName);
      },
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      tooltip: t('user.deleteUser')
    }
  ].filter(Boolean) as TableAction[];

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const filters: FilterOption[] = [
    {
      key: 'role',
      label: t('user.role'),
      placeholder: t('user.filterByRole'),
      width: 'sm:w-40',
      options: isHqAdmin
        ? [
          { value: 'admin', label: t('user.roles.admin') },
          { value: 'staff', label: t('user.roles.staff') },
          { value: 'employee', label: t('user.roles.employee') },
          { value: 'customer', label: t('user.roles.customer') },
          { value: 'vendor', label: t('user.roles.vendor') },
        ]
        : [
          { value: 'staff', label: t('user.roles.staff') },
          { value: 'employee', label: t('user.roles.employee') },
        ],
    },
    {
      key: 'status',
      label: t('common.status'),
      placeholder: t('user.filterByStatus'),
      width: 'sm:w-40',
      options: [
        { value: 'active', label: t('common.active') },
        { value: 'inactive', label: t('common.inactive') }
      ]
    },
  ];

  const filterValues = {
    role: roleFilter,
    status: statusFilter,
  };

  const handleFilterChange = (key: string, value: string) => {
    if (key === 'role') {
      setRoleFilter(value);
      setCurrentPage(1);
    } else if (key === 'status') {
      setStatusFilter(value);
      setCurrentPage(1);
    }
  };

  const handleClearFilters = () => {
    setRoleFilter('all');
    setStatusFilter('all');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const hasActiveFilters =
    roleFilter !== 'all' ||
    statusFilter !== 'all' ||
    searchTerm ||
    false;

  const listSubtitle = t('user.manageUsers');

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={users}
        columns={columns}
        loading={isLoading}
        title={
          isHqAdmin
            ? t('user.userManagement')
            : t('user.userManagement')
        }
        subtitle={listSubtitle}
        icon={<Users className="h-5 w-5" />}
        headerActions={
          <div className="flex flex-wrap items-center gap-2">
            <PermissionGuard permission="add_users">
              <Button onClick={() => navigate('/users/add')}>
                <Plus className="h-4 w-4" />
                {t('user.addUserButton')}
              </Button>
            </PermissionGuard>
          </div>
        }
        searchable
        searchPlaceholder={t('user.searchUsers')}
        searchValue={searchTerm}
        onSearch={handleSearch}
        filters={filters}
        filterValues={filterValues}
        onFilterChange={handleFilterChange}
        showClearFilters={hasActiveFilters}
        clearFiltersLabel={t('user.clearFilters')}
        onClearFilters={handleClearFilters}
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
          }
        }}
        emptyIcon={<Users className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('user.noUsersFound')}
        emptyDescription={searchTerm ? t('user.tryAdjustingSearch') : t('user.addFirstUser')}
        loadingText={t('user.loadingUsers')}
        maxHeight="75vh"
        stickyHeader={true}
      />

      <ConfirmDialog />
    </div>
  );
};