import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid, Search, ShieldAlert, Sparkles, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionContext';
import { ERP_APPS, canAccessApp, getAppLandingPath, isHqAdminUser } from '@/lib/apps';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

export const AppsHome = () => {
  const { t, direction } = useLanguage();
  const { user } = useAuth();
  const { hasPermission, hasAnyPermission } = usePermissions();
  const [searchQuery, setSearchQuery] = useState('');
  const isCustomer = user?.role === 'customer';
  const isHq = isHqAdminUser(user) || !!user?.is_superuser;
  const firstName = user?.name?.trim().split(' ')[0] || user?.email?.split('@')[0] || 'there';

  const permissionOpts = useMemo(() => ({
    isCustomer,
    hasPermission,
    hasAnyPermission,
    isSuperUser: !!user?.is_superuser,
    isAdmin: isHqAdminUser(user),
  }), [hasAnyPermission, hasPermission, isCustomer, user]);

  const visibleApps = useMemo(() => ERP_APPS.filter((app) => {
    if (!canAccessApp(app, permissionOpts)) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return t(`core.navigation.${app.key}`, app.key).toLowerCase().includes(query);
  }), [permissionOpts, searchQuery, t]);

  const noAccess = visibleApps.length === 0 && !searchQuery.trim() && !isHq && !isCustomer;
  const isRtl = direction === 'rtl';

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_90%_0%,hsl(var(--primary)/.12),transparent_24rem),hsl(var(--muted)/.35)]">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_18px_45px_-30px_rgba(0,0,0,.45)]">
          <div
            className="relative overflow-hidden border-b border-border px-5 py-6 text-white sm:px-7 sm:py-7"
            style={{ background: 'linear-gradient(120deg, #000000 0%, #050B16 40%, #0E4EC9 100%)' }}
          >
            <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-primary/25 blur-3xl" />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-amber-200"><Sparkles className="h-3.5 w-3.5 text-amber-300" />{BRAND.shortName} · {BRAND.subtitle}</div>
                <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">{t('core.apps.welcome', 'Welcome')}, <span className="text-amber-300">{firstName}</span></h1>
                <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-100">{t('core.apps.subtitle', 'Choose an application to get started. You can return here anytime from the Apps button in the header.')}</p>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-white"><LayoutGrid className="h-4 w-4 text-amber-300" />{visibleApps.length} {t('core.apps.launcher', 'Apps')}</div>
            </div>
          </div>

          <div className="border-b border-border/80 bg-muted/25 px-4 py-3 sm:px-5">
            <div className="relative mx-auto w-full max-w-md">
              <Search className={cn('pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground', isRtl ? 'right-3' : 'left-3')} />
              <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t('core.apps.search', 'Search apps...')} className={cn('h-10 rounded-xl border-border/70 bg-background shadow-sm', isRtl ? 'pr-9 pl-9' : 'pl-9 pr-9')} />
              {searchQuery && <button type="button" onClick={() => setSearchQuery('')} className={cn('absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground', isRtl ? 'left-3' : 'right-3')} aria-label="Clear search"><X className="h-4 w-4" /></button>}
            </div>
          </div>

          {visibleApps.length === 0 ? (
            <div className="px-6 py-16 text-center">
              {noAccess ? <><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted"><ShieldAlert className="h-5 w-5 text-muted-foreground" /></div><p className="mt-4 font-medium">{t('core.apps.noPermissionsTitle', 'No applications available')}</p><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t('core.apps.noPermissions', 'Your account has no section permissions yet. Ask an administrator to grant access.')}</p></> : <p className="text-sm text-muted-foreground">{t('core.apps.noResults', 'No applications match your search or permissions.')}</p>}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 p-3 min-[480px]:grid-cols-3 sm:gap-3 sm:p-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {visibleApps.map((app) => {
                const Icon = app.icon;
                return <Link key={app.key} to={getAppLandingPath(app, permissionOpts)} className="group relative flex min-h-32 flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-border/70 bg-background px-2 py-4 text-center shadow-sm transition duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-36">
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary-dark to-brand-lime opacity-0 transition group-hover:opacity-100" />
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-950 text-primary shadow-md ring-1 ring-black/10 transition duration-200 group-hover:scale-105 group-hover:bg-neutral-900 group-hover:shadow-[0_12px_25px_-12px_hsl(var(--primary)/.75)] sm:h-16 sm:w-16"><Icon className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={1.7} /></div>
                  <span className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800 transition-colors group-hover:text-primary dark:text-slate-100">{t(`core.navigation.${app.key}`, app.key)}</span>
                </Link>;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AppsHome;
