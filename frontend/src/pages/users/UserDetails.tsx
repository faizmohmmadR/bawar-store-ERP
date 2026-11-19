import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import { ArrowLeft, Edit, Shield, Mail, Phone, MapPin, Calendar, User as UserIcon, Plus, Trash2, Eye, Settings, MoreVertical, Building2 } from 'lucide-react';
import { ReloadIcon } from '@radix-ui/react-icons';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { PermissionGuard } from '@/components/ui/permission-guard';

interface User {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  role: string;
  address?: string;
  is_active: boolean;
  profile_picture?: string;
  created_at: string;
  updated_at: string;
}

export const UserDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { formatDate, formatDateLong } = useFormatAppDate();

  const { data: user, isLoading } = useFetchObjects<User>({
    queryKey: ['user', id],
    endpoint: `users/${id}/`,
    enabled: !!id,
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['users'],
    endpoint: 'users'
  });

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

  const handleDeleteUser = () => {
    if (!user) return;
    const displayName = user.first_name && user.last_name
      ? `${user.first_name} ${user.last_name}`
      : user.email;
    handleDelete(user.id, displayName).then(() => {
      navigate('/users');
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 flex justify-center">
        <ReloadIcon className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto py-6">
        <p>User not found</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Enhanced Header */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-lg"></div>
        <div className="relative p-6">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/users')}
              className="flex items-center gap-2 hover:bg-white/50"
            >
              <ArrowLeft size={16} />
              {t('user.backToUsers')}
            </Button>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="relative">
                <Avatar className="h-20 w-20 border-4 border-white shadow-lg">
                  <AvatarImage src={user.profile_picture} />
                  <AvatarFallback className="text-2xl font-bold bg-primary/10">
                    {(user.first_name?.[0] || user.email?.[0] || '?').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-2 border-white ${user.is_active ? 'bg-primary/100' : 'bg-gray-400'
                  }`}></div>
              </div>

              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-foreground">
                  {user.first_name && user.last_name
                    ? `${user.first_name} ${user.last_name}`
                    : user.email}
                </h1>
                <div className="flex items-center gap-3">
                  <p className="text-lg text-muted-foreground">{user.email}</p>
                  <Badge variant={getRoleColor(user.role)} className="capitalize">
                    {t(`user.roles.${user.role}`)}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar size={14} />
                  {t('user.memberSince')} {formatDate(user.created_at)}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <PermissionGuard permission="add_users">
                <Button
                  onClick={() => navigate('/users/add')}
                  className="flex items-center gap-2"
                >
                  <Plus size={16} />
                  {t('user.addUser')}
                </Button>
              </PermissionGuard>
              <PermissionGuard permission="edit_users">
                <Button
                  variant="outline"
                  onClick={() => navigate(`/users/${user.id}/edit`)}
                  className="flex items-center gap-2"
                >
                  <Edit size={16} />
                  {t('user.editUser')}
                </Button>
              </PermissionGuard>
              <PermissionGuard permissions={['view_permissions', 'edit_permissions']}>
                <div className="flex flex-col gap-1">
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/users/${user.id}/permissions`)}
                    className="flex items-center gap-2"
                  >
                    <Shield size={16} />
                    {t('user.managePermissions')}
                  </Button>
                  <p className="text-xs text-muted-foreground max-w-[16rem]">
                    {t(
                      'user.permissionsRequiredHint',
                      'Users need explicit section permissions before they can open ERP apps.',
                    )}
                  </p>
                </div>
              </PermissionGuard>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <MoreVertical size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate(`/users/${user.id}`)}>
                    <Eye size={16} className="mr-2" />
                    {t('user.viewDetails')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/users/${user.id}/settings`)}>
                    <Settings size={16} className="mr-2" />
                    {t('user.settings')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <PermissionGuard permission="delete_users">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-600">
                          <Trash2 size={16} className="mr-2" />
                          {t('user.deleteUser')}
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('user.confirmDelete')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('user.deleteConfirmation', { name: user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.email })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteUser()} className="bg-red-600 hover:bg-red-700">
                            {t('user.delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </PermissionGuard>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* User Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mt-8">
        {/* Personal Information */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="bg-gradient-to-r from-primary/10 to-accent/10 dark:from-primary/20 dark:to-accent/20">
            <CardTitle className="flex items-center gap-2 text-primary dark:text-primary">
              <UserIcon size={20} />
              {t('user.personalInformation')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-6">
            <div className="grid grid-cols-1 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <label className="text-sm font-medium text-muted-foreground">{t('user.email')}</label>
                <p className="font-semibold text-lg mt-1">{user.email}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('user.firstName')}</label>
                  <p className="font-medium mt-1">{user.first_name || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('user.lastName')}</label>
                  <p className="font-medium mt-1">{user.last_name || '-'}</p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t('user.contactInformation')}</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <Mail size={18} className="text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t('user.email')}</p>
                    <p className="font-medium">{user.email}</p>
                  </div>
                </div>
                {user.phone && (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <Phone size={18} className="text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">{t('user.phone')}</p>
                      <p className="font-medium">{user.phone}</p>
                    </div>
                  </div>
                )}
                {user.address && (
                  <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <MapPin size={18} className="text-red-500 mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">{t('user.address')}</p>
                      <p className="font-medium">{user.address}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t('user.accountStatus')}</label>
                <div className="mt-1">
                  <Badge variant={user.is_active ? 'default' : 'secondary'} className="text-sm">
                    {user.is_active ? t('user.active') : t('user.inactive')}
                  </Badge>
                </div>
              </div>
              <div className={`h-3 w-3 rounded-full ${user.is_active ? 'bg-primary/100 animate-pulse' : 'bg-gray-400'
                }`}></div>
            </div>
          </CardContent>
        </Card>

        {/* Account Information */}
        <Card className="xl:col-span-1 hover:shadow-lg transition-shadow">
          <CardHeader className="bg-gradient-to-r from-accent/10 to-primary/10 dark:from-accent/20 dark:to-primary/10">
            <CardTitle className="flex items-center gap-2 text-accent dark:text-accent">
              <Calendar size={20} />
              {t('user.accountInformation')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-6">
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-l-4 border-accent">
                <label className="text-sm font-medium text-muted-foreground">{t('user.accountCreated')}</label>
                <p className="font-semibold text-lg mt-1">
                  {formatDateLong(user.created_at)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {new Date(user.created_at).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-l-4 border-primary">
                <label className="text-sm font-medium text-muted-foreground">{t('user.lastUpdated')}</label>
                <p className="font-semibold text-lg mt-1">
                  {formatDateLong(user.updated_at)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {new Date(user.updated_at).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>

              <div className="p-4 bg-gradient-to-r from-accent/10 to-primary/10 dark:from-accent/20 dark:to-primary/20 rounded-lg border border-accent/30 dark:border-accent/40">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">{t('user.userRole')}</label>
                    <p className="font-semibold text-lg mt-1 capitalize">{t(`user.roles.${user.role}`)}</p>
                  </div>
                  <Badge variant={getRoleColor(user.role)} className="text-sm px-3 py-1">
                    {t(`user.roles.${user.role}`)}
                  </Badge>
                </div>
              </div>

            </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog />
    </div>
  );
};