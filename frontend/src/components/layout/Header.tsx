import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  User,
  Globe,
  LogOut,
  Settings as SettingsIcon,
  LayoutGrid,
  ChevronDown,
  CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionContext';
import { Language, languageNames } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  ERP_APPS,
  type AppDefinition,
  type AppSubItem,
  canAccessApp,
  findActiveApp,
  getAppLandingPath,
  getVisibleSubItems,
  isHqAdminUser,
} from '@/lib/apps';
import { BRAND } from '@/lib/brand';
import { PermissionGuard } from '@/components/ui/permission-guard';
import { HeaderNotifications } from '@/components/layout/HeaderNotifications';
import { useIsMobile } from '@/hooks/use-mobile';
import { useHoverCapable } from '@/hooks/use-hover-capable';

const HOVER_CLOSE_MS = 250;

const normalizePath = (path: string) =>
  path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;

/** Single best-matching sub-item for the current URL (longest path wins). */
const findBestMatchingSub = (
  pathname: string,
  items: AppSubItem[],
): AppSubItem | null => {
  const path = normalizePath(pathname);
  let best: AppSubItem | null = null;
  for (const sub of items) {
    const subPath = normalizePath(sub.path);
    if (path !== subPath && !path.startsWith(`${subPath}/`)) continue;
    if (!best || subPath.length > normalizePath(best.path).length) {
      best = sub;
    }
  }
  return best;
};

const launcherTileClass = (active?: boolean) =>
  cn(
    'group flex h-full cursor-pointer flex-col items-center gap-2 rounded-lg px-2 py-3 text-center outline-none transition-colors',
    'text-foreground hover:bg-muted hover:text-foreground',
    'focus:bg-muted focus:text-foreground',
    'data-[highlighted]:bg-muted data-[highlighted]:text-foreground',
    active &&
    'bg-primary/15 text-primary ring-1 ring-inset ring-primary/25 hover:bg-primary/15 hover:text-primary focus:bg-primary/15 focus:text-primary data-[highlighted]:bg-primary/15 data-[highlighted]:text-primary',
  );

const launcherLabelClass =
  'w-full text-center text-[11px] font-medium leading-snug sm:text-xs break-words whitespace-normal';

const appsGridClass = 'grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-1.5';
const optionsGridClass = 'grid grid-cols-2 gap-1.5 sm:grid-cols-3';
const appsMenuWidthClass = 'w-[min(22rem,calc(100vw-1.5rem))] p-0 sm:w-[26rem]';
const optionsMenuWidthClass = 'w-[min(24rem,calc(100vw-1.5rem))] p-0 sm:w-[30rem]';

/** Shared ghost icon control — same size/alignment across header actions. */
const headerIconBtnClass =
  'h-9 w-9 shrink-0 rounded-lg p-0 text-muted-foreground hover:bg-muted/70 hover:text-foreground';

const headerToolbarClass =
  'flex items-center gap-0.5 rounded-xl border border-border/50 bg-muted/25 p-0.5 sm:gap-1 sm:p-1';

export const Header: React.FC = () => {
  const { language, changeLanguage, direction, t } = useLanguage();
  const { formatDateLong } = useFormatAppDate();
  const { user, logout } = useAuth();
  const { hasPermission, hasAnyPermission } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const [appsMenuOpen, setAppsMenuOpen] = useState(false);
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const appsCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appsPointerInside = useRef(false);

  const isCustomer = user?.role === 'customer';
  const isHome = location.pathname === '/' || location.pathname === '';
  const activeApp = findActiveApp(location.pathname);
  const isMobile = useIsMobile();
  const hoverCapable = useHoverCapable();
  const useAppsHover = hoverCapable && !isMobile;

  useEffect(() => {
    return () => {
      if (appsCloseTimer.current) clearTimeout(appsCloseTimer.current);
    };
  }, []);

  const clearAppsCloseTimer = () => {
    if (appsCloseTimer.current) {
      clearTimeout(appsCloseTimer.current);
      appsCloseTimer.current = null;
    }
  };

  const openAppsMenu = () => {
    appsPointerInside.current = true;
    clearAppsCloseTimer();
    setSectionMenuOpen(false);
    setAppsMenuOpen(true);
  };

  const scheduleCloseAppsMenu = () => {
    appsPointerInside.current = false;
    clearAppsCloseTimer();
    appsCloseTimer.current = setTimeout(() => {
      // Ignore close if the pointer re-entered trigger/content (open flicker guard)
      if (appsPointerInside.current) return;
      setAppsMenuOpen(false);
    }, HOVER_CLOSE_MS);
  };

  const appsHoverHandlers = useAppsHover
    ? {
      onPointerEnter: openAppsMenu,
      onPointerLeave: scheduleCloseAppsMenu,
    }
    : {};

  const handleAppsOpenChange = (open: boolean) => {
    if (!useAppsHover) {
      setSectionMenuOpen(false);
      setAppsMenuOpen(open);
      if (!open) {
        appsPointerInside.current = false;
      }
      return;
    }
    if (open) {
      openAppsMenu();
      return;
    }
    // Radix can emit close while focus moves into the menu on first open — ignore that.
    if (appsPointerInside.current) return;
    clearAppsCloseTimer();
    setAppsMenuOpen(false);
  };

  const isRtl = direction === 'rtl';

  const userDisplayName =
    user?.name?.trim() ||
    `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
    user?.email ||
    'User';

  const userInitials =
    userDisplayName
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U';

  const userRoleLabel = (() => {
    if (!user?.role) return '';
    const key = `common.roles.${user.role}`;
    const translated = t(key);
    return translated !== key ? translated : user.role;
  })();

  const todayLabel = formatDateLong(new Date());

  const permissionOpts = useMemo(
    () => ({
      isCustomer,
      hasPermission,
      hasAnyPermission,
      isSuperUser: !!user?.is_superuser,
      isAdmin: isHqAdminUser(user),
      isBranchScoped: false,
    }),
    [isCustomer, hasPermission, hasAnyPermission, user],
  );

  const accessibleApps = useMemo(() => {
    return ERP_APPS.filter((app) => canAccessApp(app, permissionOpts));
  }, [permissionOpts]);

  const activeSubItems = useMemo(() => {
    if (!activeApp?.subItems?.length) return [];
    return getVisibleSubItems(activeApp, permissionOpts);
  }, [activeApp, permissionOpts]);

  const activeSubItem = useMemo(
    () => findBestMatchingSub(location.pathname, activeSubItems),
    [activeSubItems, location.pathname],
  );

  const ActiveAppIcon = activeApp?.icon;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const goToPath = (path: string) => {
    clearAppsCloseTimer();
    appsPointerInside.current = false;
    setAppsMenuOpen(false);
    setSectionMenuOpen(false);
    navigate(path);
  };

  const handleAppSelect = (app: AppDefinition) => {
    goToPath(getAppLandingPath(app, permissionOpts));
  };

  const renderAppIcon = (app: AppDefinition, size: 'sm' | 'md' = 'md') => {
    const Icon = app.icon;
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-xl bg-black text-primary shadow-sm ring-1 ring-primary/30 transition-all',
          'group-hover:ring-2 group-hover:ring-accent group-hover:bg-neutral-900',
          size === 'md' ? 'h-12 w-12' : 'h-10 w-10',
          app.color,
        )}
      >
        <Icon
          className={cn(
            'text-primary group-hover:text-accent transition-colors',
            size === 'md' ? 'h-6 w-6' : 'h-5 w-5',
          )}
          strokeWidth={1.75}
        />
      </span>
    );
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/90">
      <div className="mx-auto flex h-14 min-w-0 items-center justify-between gap-3 px-3 sm:h-[3.75rem] sm:px-5 lg:px-6">
        {/* Left: brand + navigation */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link
            to="/"
            className="flex shrink-0 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex h-8 w-auto items-center overflow-hidden rounded-md bg-black sm:h-9">
              <img
                src={BRAND.logo}
                alt={BRAND.name}
                className="h-8 w-auto object-contain sm:h-9"
              />
            </div>
            <div className="hidden min-w-0 ps-2.5 lg:block">
              <p className="truncate text-sm font-heading font-semibold leading-tight text-foreground uppercase tracking-wide">
                {t('core.app.sidebarTitle', BRAND.sidebarTitle)}
              </p>
              <p
                className="truncate text-[11px] font-medium"
                style={{ color: BRAND.colors.secondary }}
              >
                {t('core.app.subtitle', BRAND.subtitle)}
              </p>
            </div>
          </Link>

          <div className="hidden h-7 w-px bg-border/80 sm:block" />

          <DropdownMenu
            modal={isMobile}
            open={appsMenuOpen}
            onOpenChange={handleAppsOpenChange}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('core.apps.launcher', 'Apps')}
                className={cn(
                  headerIconBtnClass,
                  isHome && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
                )}
                {...appsHoverHandlers}
              >
                <LayoutGrid className="h-[1.125rem] w-[1.125rem]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align={isRtl ? 'end' : 'start'}
              sideOffset={8}
              className={appsMenuWidthClass}
              onCloseAutoFocus={(e) => e.preventDefault()}
              {...appsHoverHandlers}
            >
              <DropdownMenuLabel className="px-3 py-2.5 text-sm font-semibold">
                {t('core.apps.launcher', 'Apps')}
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="my-0" />
              <div className="max-h-[min(28rem,75vh)] overflow-y-auto p-2">
                <div className={appsGridClass}>
                  <DropdownMenuItem
                    onSelect={() => goToPath('/')}
                    className={launcherTileClass(isHome)}
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
                      <LayoutGrid className="h-6 w-6" strokeWidth={1.75} />
                    </span>
                    <span className={launcherLabelClass}>
                      {t('core.apps.allApps', 'All Apps')}
                    </span>
                  </DropdownMenuItem>
                  {accessibleApps.map((app) => {
                    const isActive = activeApp?.key === app.key;
                    const label = t(`core.navigation.${app.key}`, app.key);
                    return (
                      <DropdownMenuItem
                        key={app.key}
                        onSelect={() => handleAppSelect(app)}
                        className={launcherTileClass(isActive)}
                      >
                        {renderAppIcon(app)}
                        <span className={launcherLabelClass}>{label}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Section sub-options — icon on mobile, label on desktop */}
          {activeApp && activeSubItems.length > 0 && (
            <>
              <div className="hidden h-7 w-px bg-border/80 sm:block" />
              <DropdownMenu
                modal={isMobile}
                open={sectionMenuOpen}
                onOpenChange={(open) => {
                  setSectionMenuOpen(open);
                  if (open) {
                    clearAppsCloseTimer();
                    appsPointerInside.current = false;
                    setAppsMenuOpen(false);
                  }
                }}
              >
                <DropdownMenuTrigger asChild>
                  {isMobile ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={
                        activeSubItem
                          ? t(`core.navigation.${activeSubItem.key}`, activeSubItem.key)
                          : t(`core.navigation.${activeApp.key}`, activeApp.key)
                      }
                      className={cn(
                        headerIconBtnClass,
                        'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
                      )}
                    >
                      {ActiveAppIcon ? (
                        <ActiveAppIcon className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.75} />
                      ) : (
                        <ChevronDown className="h-[1.125rem] w-[1.125rem]" />
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 max-w-[14rem] gap-2 rounded-lg px-2.5 font-medium text-foreground"
                    >
                      <span
                        className={cn(
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-primary',
                          activeApp.color,
                        )}
                      >
                        {ActiveAppIcon && <ActiveAppIcon className="h-3.5 w-3.5" />}
                      </span>
                      <span className="truncate text-sm">
                        {activeSubItem
                          ? t(`core.navigation.${activeSubItem.key}`, activeSubItem.key)
                          : t(`core.navigation.${activeApp.key}`, activeApp.key)}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align={isRtl ? 'end' : 'start'}
                  sideOffset={8}
                  className={optionsMenuWidthClass}
                  onCloseAutoFocus={(e) => e.preventDefault()}
                >
                  <DropdownMenuLabel className="px-3 py-2.5">
                    {t('core.apps.sectionMenu', 'Options')} —{' '}
                    {t(`core.navigation.${activeApp.key}`, activeApp.key)}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="my-0" />
                  <div className="max-h-[min(24rem,70vh)] overflow-y-auto p-2">
                    <div className={optionsGridClass}>
                      {activeSubItems.map((sub) => {
                        const SubIcon = sub.icon;
                        const label = t(`core.navigation.${sub.key}`, sub.key);
                        const active = activeSubItem?.key === sub.key;
                        return (
                          <DropdownMenuItem
                            key={sub.key}
                            onSelect={() => goToPath(sub.path)}
                            className={launcherTileClass(active)}
                          >
                            <span
                              className={cn(
                                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 transition-colors sm:h-12 sm:w-12',
                                active
                                  ? 'bg-primary/15 text-primary ring-primary/30'
                                  : 'bg-muted text-foreground ring-border group-hover:bg-background',
                              )}
                            >
                              <SubIcon className="h-5 w-5" strokeWidth={1.75} />
                            </span>
                            <span className={launcherLabelClass}>{label}</span>
                          </DropdownMenuItem>
                        );
                      })}
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}

          {activeApp && activeSubItems.length === 0 && (
            <>
              <div className="hidden h-7 w-px bg-border/80 md:block" />
              <div className="hidden min-w-0 items-center gap-2 md:flex">
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-primary',
                    activeApp.color,
                  )}
                >
                  {ActiveAppIcon && <ActiveAppIcon className="h-3.5 w-3.5" />}
                </span>
                <span className="max-w-[160px] truncate text-sm font-medium text-muted-foreground">
                  {t(`core.navigation.${activeApp.key}`, activeApp.key)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Right: compact toolbar */}
        <div className={headerToolbarClass}>
          <div className="hidden items-center gap-1.5 px-2 text-muted-foreground xl:flex">
            <CalendarDays className="h-3.5 w-3.5" />
            <span className="text-xs whitespace-nowrap">{todayLabel}</span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('core.header.language', 'Language')}
                className={headerIconBtnClass}
              >
                <Globe className="h-[1.125rem] w-[1.125rem]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={direction === 'rtl' ? 'start' : 'end'} className="w-40">
              <DropdownMenuLabel>{t('core.header.language', 'Language')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.entries(languageNames).map(([code, name]) => (
                <DropdownMenuItem
                  key={code}
                  onClick={() => changeLanguage(code as Language)}
                  className={cn('cursor-pointer', language === code && 'bg-accent')}
                >
                  {name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <PermissionGuard permission="view_notifications">
            <HeaderNotifications compact />
          </PermissionGuard>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-9 gap-2 rounded-lg px-1.5 hover:bg-muted/70 sm:px-2"
              >
                <Avatar className="h-7 w-7 ring-1 ring-border sm:h-8 sm:w-8">
                  <AvatarImage
                    src={user?.profile_picture || undefined}
                    alt={userDisplayName}
                  />
                  <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-semibold sm:text-xs">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden min-w-0 text-start lg:block">
                  <p className="truncate text-sm font-medium leading-tight max-w-[7.5rem]">
                    {userDisplayName.split(' ')[0]}
                  </p>
                  {userRoleLabel && (
                    <p className="truncate text-[11px] text-muted-foreground leading-tight">
                      {userRoleLabel}
                    </p>
                  )}
                </div>
                <ChevronDown className="hidden h-3.5 w-3.5 opacity-50 lg:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align={direction === 'rtl' ? 'start' : 'end'}
              className="w-64"
            >
              <DropdownMenuLabel className="font-normal">
                <div className="flex items-center gap-3 py-1">
                  <Avatar className="h-10 w-10">
                    <AvatarImage
                      src={user?.profile_picture || undefined}
                      alt={userDisplayName}
                    />
                    <AvatarFallback className="bg-primary/15 text-primary text-sm font-semibold">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{userDisplayName}</p>
                    {user?.email && (
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    )}
                    {userRoleLabel && (
                      <p className="mt-0.5 text-[11px] font-medium text-primary">{userRoleLabel}</p>
                    )}
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer">
                <User className="me-2 h-4 w-4" />
                {t('core.navigation.profile', 'Profile')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigate('/settings/preferences')}
                className="cursor-pointer"
              >
                <SettingsIcon className="me-2 h-4 w-4" />
                {t('core.navigation.settings', 'Settings')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/')} className="cursor-pointer">
                <LayoutGrid className="me-2 h-4 w-4" />
                {t('core.apps.launcher', 'Apps')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="me-2 h-4 w-4" />
                {t('core.navigation.logout', 'Logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};
