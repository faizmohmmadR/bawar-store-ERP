import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionContext';
import api from '@/api/client';
import useAdd from '@/api/useAdd';
import { ArrowLeft, Save, Shield, Search, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { notifySuccess } from '@/lib/notify';
import { cn } from '@/lib/utils';
import {
  CRUD_ACTIONS,
  PERMISSION_CATALOG,
  type CrudAction,
  type PermissionGroupDef,
  type PermissionRowDef,
  groupCodenames,
  rowCodenames,
} from '@/lib/permissionCatalog';

interface Permission {
  id: number | string;
  name: string;
  codename: string;
  module: string;
  description: string;
  granted: boolean;
}

interface User {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
}

const syncLinkedPermissions = (list: Permission[]): Permission[] => {
  const byCode = new Map(list.map((p) => [p.codename, p]));
  const saleView = byCode.get('view_sale_payments')?.granted ?? false;
  const purchaseView = byCode.get('view_purchase_payments')?.granted ?? false;
  const wantPaymentsView = saleView || purchaseView;

  return list.map((p) => {
    if (p.codename === 'view_payments' && p.granted !== wantPaymentsView) {
      return { ...p, granted: wantPaymentsView };
    }
    return p;
  });
};

export const UserPermissions: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user: authUser } = useAuth();
  const { hasPermission } = usePermissions();
  const canEditPermissions = hasPermission('edit_permissions');
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'granted' | 'denied'>('all');

  const {
    handleAdd: initializePermissions,
    loading: initializingPermissions,
    isSuccess: initSuccess,
  } = useAdd({
    queryKey: ['permissions'],
    endpoint: 'permissions/initialize_defaults/',
    customSuccessMessage: t('user.permissionsInitializedSuccess'),
    customErrorMessage: t('user.permissionsInitializedFailed'),
  });

  const fetchUserAndPermissions = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [userResponse, permissionsResponse] = await Promise.all([
        api.get(`/users/${id}/`),
        api.get(`/users/${id}/permissions/user-permissions/`),
      ]);
      setUser(userResponse.data);
      setPermissions(syncLinkedPermissions(permissionsResponse.data));
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        t('user.failedToLoadPermissions');
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    fetchUserAndPermissions();
  }, [fetchUserAndPermissions]);

  useEffect(() => {
    if (initSuccess) fetchUserAndPermissions();
  }, [initSuccess, fetchUserAndPermissions]);

  const byCodename = useMemo(() => {
    const map = new Map<string, Permission>();
    for (const perm of permissions) {
      map.set(perm.codename, perm);
    }
    return map;
  }, [permissions]);

  const setCodenamesGranted = useCallback(
    (codenames: string[], granted: boolean) => {
      if (!canEditPermissions || codenames.length === 0) return;
      const codeSet = new Set(codenames);
      setPermissions((prev) =>
        syncLinkedPermissions(
          prev.map((perm) =>
            codeSet.has(perm.codename) ? { ...perm, granted } : perm,
          ),
        ),
      );
    },
    [canEditPermissions],
  );

  const isActionGranted = useCallback(
    (row: PermissionRowDef, action: CrudAction): boolean | 'missing' => {
      const codes = row.actions[action];
      if (!codes || codes.length === 0) return 'missing';
      const known = codes
        .map((c) => byCodename.get(c))
        .filter((p): p is Permission => Boolean(p));
      if (known.length === 0) return 'missing';
      return known.every((p) => p.granted);
    },
    [byCodename],
  );

  const isActionPartial = useCallback(
    (row: PermissionRowDef, action: CrudAction): boolean => {
      const codes = row.actions[action];
      if (!codes || codes.length === 0) return false;
      const known = codes
        .map((c) => byCodename.get(c))
        .filter((p): p is Permission => Boolean(p));
      if (known.length <= 1) return false;
      const some = known.some((p) => p.granted);
      const all = known.every((p) => p.granted);
      return some && !all;
    },
    [byCodename],
  );

  const rowKnownPermissions = useCallback(
    (row: PermissionRowDef): Permission[] =>
      rowCodenames(row)
        .map((c) => byCodename.get(c))
        .filter((p): p is Permission => Boolean(p)),
    [byCodename],
  );

  const isRowAllSelected = (row: PermissionRowDef) => {
    const known = rowKnownPermissions(row);
    return known.length > 0 && known.every((p) => p.granted);
  };

  const isRowPartial = (row: PermissionRowDef) => {
    const known = rowKnownPermissions(row);
    if (known.length === 0) return false;
    const some = known.some((p) => p.granted);
    const all = known.every((p) => p.granted);
    return some && !all;
  };

  const isGroupAllSelected = (group: PermissionGroupDef) => {
    const codes = groupCodenames(group)
      .map((c) => byCodename.get(c))
      .filter((p): p is Permission => Boolean(p));
    return codes.length > 0 && codes.every((p) => p.granted);
  };

  const isGroupPartial = (group: PermissionGroupDef) => {
    const codes = groupCodenames(group)
      .map((c) => byCodename.get(c))
      .filter((p): p is Permission => Boolean(p));
    if (codes.length === 0) return false;
    const some = codes.some((p) => p.granted);
    const all = codes.every((p) => p.granted);
    return some && !all;
  };

  const handleSave = async () => {
    if (!id || !canEditPermissions) return;
    try {
      setSaving(true);
      const synced = syncLinkedPermissions(permissions);
      await api.post(`/users/${id}/permissions/bulk-update/`, {
        permissions: synced.map((perm) => ({
          permission_id: perm.id,
          granted: perm.granted,
        })),
      });
      notifySuccess(t('user.permissionsUpdatedSuccess'), {
        title: t('common.success'),
        dismissLabel: t('common.dismiss'),
      });
      await fetchUserAndPermissions();
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        t('user.failedToSavePermissions');
      toast.error(t('common.error', 'Error'), {
        description: String(message),
        duration: 4000,
        position: 'top-right',
        action: {
          label: t('common.dismiss'),
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const labelFor = useCallback(
    (key: string) => {
      const value = t(key);
      if (value && value !== key) return value;
      const tail = key.split('.').pop() || key;
      return tail.replace(/_/g, ' ');
    },
    [t],
  );

  const visibleGroups = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return PERMISSION_CATALOG.map((group) => {
      const rows = group.rows.filter((row) => {
        const known = rowKnownPermissions(row);
        const label = labelFor(row.labelKey).toLowerCase();
        const groupLabel = labelFor(group.labelKey).toLowerCase();
        const matchesSearch =
          q === '' ||
          label.includes(q) ||
          groupLabel.includes(q) ||
          row.id.includes(q) ||
          known.some(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.codename.toLowerCase().includes(q) ||
              p.description.toLowerCase().includes(q),
          );
        if (!matchesSearch) return false;

        if (filterStatus === 'granted') return known.some((p) => p.granted);
        if (filterStatus === 'denied') return known.some((p) => !p.granted) || known.length === 0;
        return true;
      });
      return { ...group, rows };
    }).filter((group) => group.rows.length > 0);
  }, [searchTerm, filterStatus, rowKnownPermissions, labelFor]);

  const grantedCount = useMemo(
    () => permissions.filter((p) => p.granted).length,
    [permissions],
  );
  const sectionCount = useMemo(
    () => visibleGroups.reduce((n, g) => n + g.rows.length, 0),
    [visibleGroups],
  );
  const hasNoSectionAccess = permissions.length > 0 && grantedCount === 0;

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <p className="mt-4 text-sm text-muted-foreground">{t('user.loadingPermissions')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => navigate('/users')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold sm:text-2xl">{t('user.userPermissions')}</h1>
            </div>
            {user && (
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {user.first_name} {user.last_name}
                <span className="mx-1.5 text-border">·</span>
                {user.email}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {authUser?.is_superuser && (
            <Button
              type="button"
              variant="outline"
              onClick={() => initializePermissions({})}
              disabled={initializingPermissions}
            >
              <RefreshCw
                className={cn('me-2 h-4 w-4', initializingPermissions && 'animate-spin')}
              />
              {t('user.initializePermissions')}
            </Button>
          )}
          {canEditPermissions && (
            <Button onClick={handleSave} disabled={saving}>
              <Save className="me-2 h-4 w-4" />
              {saving ? t('user.saving') : t('user.saveChanges')}
            </Button>
          )}
        </div>
      </div>

      {hasNoSectionAccess && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-semibold">{t('user.noSectionAccessTitle')}</p>
          <p className="mt-1 opacity-90">{t('user.noSectionAccessHelp')}</p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('user.searchPermissions')}
            className="ps-9"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFilterStatus('all')}
            className={cn('h-8 px-3 text-xs', filterStatus === 'all' && 'bg-background shadow-sm')}
          >
            {t('user.filterAll')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFilterStatus('granted')}
            className={cn('h-8 px-3 text-xs', filterStatus === 'granted' && 'bg-background shadow-sm')}
          >
            {t('user.filterGranted')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFilterStatus('denied')}
            className={cn('h-8 px-3 text-xs', filterStatus === 'denied' && 'bg-background shadow-sm')}
          >
            {t('user.filterDenied')}
          </Button>
        </div>
        <div className="whitespace-nowrap text-xs text-muted-foreground">
          {grantedCount} {t('user.granted')} · {sectionCount} {t('user.permissionSection').toLowerCase()}
        </div>
      </div>

      {permissions.length === 0 ? (
        <div className="rounded-xl border py-16 text-center">
          <Shield className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{t('user.noPermissionsFound')}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {t('user.noPermissionsAvailable')}
          </p>
          {authUser?.is_superuser && (
            <Button
              className="mt-6"
              onClick={() => initializePermissions({})}
              disabled={initializingPermissions}
            >
              <RefreshCw
                className={cn('me-2 h-4 w-4', initializingPermissions && 'animate-spin')}
              />
              {t('user.initializePermissions')}
            </Button>
          )}
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="rounded-xl border py-16 text-center">
          <Search className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{t('user.noPermissionsMatch')}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t('user.tryAdjustingSearch')}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSearchTerm('')}>
              {t('user.clearSearch')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setFilterStatus('all')}>
              {t('user.filterAll')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="max-h-[75vh] overflow-x-auto overflow-y-auto">
            {/*
              Section is capped; All/View/Add/Edit/Delete share the rest equally
              so checkboxes are not shoved to the far right edge.
            */}
            <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[34%]" />
                <col className="w-[13.2%]" />
                <col className="w-[13.2%]" />
                <col className="w-[13.2%]" />
                <col className="w-[13.2%]" />
                <col className="w-[13.2%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 border-b bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
                <tr>
                  <th className="h-11 px-4 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('user.permissionSection')}
                  </th>
                  <th className="h-11 border-s border-border/50 px-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('user.crudAll', 'All')}
                  </th>
                  {CRUD_ACTIONS.map((action) => (
                    <th
                      key={action}
                      className="h-11 border-s border-border/40 px-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {t(`user.crud.${action}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleGroups.map((group) => {
                  const groupAll = isGroupAllSelected(group);
                  const groupPartial = isGroupPartial(group);
                  return (
                    <React.Fragment key={group.id}>
                      <tr className="border-b border-border/70 bg-muted/55">
                        <td className="h-10 px-4 align-middle">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-[11px] font-bold uppercase tracking-wider text-foreground">
                              {labelFor(group.labelKey)}
                            </span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              ({group.rows.length})
                            </span>
                          </div>
                        </td>
                        <td className="h-10 border-s border-border/50 px-2 text-center align-middle">
                          <div className="flex flex-col items-center justify-center gap-0.5">
                            <Checkbox
                              checked={groupAll ? true : groupPartial ? 'indeterminate' : false}
                              disabled={!canEditPermissions}
                              onCheckedChange={(checked) =>
                                setCodenamesGranted(groupCodenames(group), checked === true)
                              }
                              aria-label={`${t('user.grantGroup')} ${labelFor(group.labelKey)}`}
                            />
                          </div>
                        </td>
                        <td
                          colSpan={4}
                          className="h-10 border-s border-border/40 px-3 text-[11px] text-muted-foreground align-middle"
                        >
                          {t('user.grantGroup')}
                        </td>
                      </tr>
                      {group.rows.map((row) => {
                        const known = rowKnownPermissions(row);
                        const total = known.length || rowCodenames(row).length;
                        const grantedInRow = known.filter((p) => p.granted).length;
                        const rowAll = isRowAllSelected(row);
                        const rowPartial = isRowPartial(row);
                        return (
                          <tr
                            key={row.id}
                            className="border-b border-border/50 hover:bg-muted/25 transition-colors"
                          >
                            <td className="h-11 px-4 ps-5 align-middle">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-medium text-foreground">
                                  {labelFor(row.labelKey)}
                                </span>
                                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                                  {grantedInRow}/{total}
                                </span>
                              </div>
                            </td>
                            <td className="h-11 border-s border-border/50 bg-muted/15 px-2 text-center align-middle">
                              <div className="flex justify-center">
                                <Checkbox
                                  checked={rowAll ? true : rowPartial ? 'indeterminate' : false}
                                  disabled={!canEditPermissions || known.length === 0}
                                  onCheckedChange={(checked) =>
                                    setCodenamesGranted(rowCodenames(row), checked === true)
                                  }
                                  aria-label={`${t('user.selectAll')} ${labelFor(row.labelKey)}`}
                                />
                              </div>
                            </td>
                            {CRUD_ACTIONS.map((action) => {
                              const state = isActionGranted(row, action);
                              if (state === 'missing') {
                                return (
                                  <td
                                    key={action}
                                    className="h-11 border-s border-border/40 px-2 text-center align-middle text-muted-foreground/35"
                                  >
                                    —
                                  </td>
                                );
                              }
                              const partial = isActionPartial(row, action);
                              const codes = row.actions[action] ?? [];
                              return (
                                <td
                                  key={action}
                                  className="h-11 border-s border-border/40 px-2 text-center align-middle"
                                >
                                  <div className="flex justify-center">
                                    <Checkbox
                                      checked={
                                        state ? true : partial ? 'indeterminate' : false
                                      }
                                      disabled={!canEditPermissions}
                                      onCheckedChange={(checked) =>
                                        setCodenamesGranted(codes, checked === true)
                                      }
                                      aria-label={`${labelFor(row.labelKey)} ${t(`user.crud.${action}`)}`}
                                    />
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
