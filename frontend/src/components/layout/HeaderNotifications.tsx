import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, AlertTriangle, PackageX, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/api/client';
import { cn } from '@/lib/utils';

export type AppNotification = {
  id: number;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  created_at?: string;
  link?: string | null;
  type_label?: string;
};

type NotificationListResponse =
  | AppNotification[]
  | { results: AppNotification[]; count?: number };

function unwrapList(data: NotificationListResponse | undefined): AppNotification[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.results || [];
}

function typeIcon(type: string) {
  if (type === 'stock_expiry') return AlertTriangle;
  if (type === 'low_stock') return PackageX;
  return Package;
}

export function HeaderNotifications({
  alignEnd = true,
  compact = false,
}: {
  alignEnd?: boolean;
  compact?: boolean;
}) {
  const { t, direction } = useLanguage();
  const { formatDateTime } = useFormatAppDate();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const enabled = Boolean(user?.token);

  const unreadQuery = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      const { data } = await api.get<{ count: number }>('/notifications/unread_count/');
      return data?.count ?? 0;
    },
    enabled,
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

  const listQuery = useQuery({
    queryKey: ['notifications-header'],
    queryFn: async () => {
      const { data } = await api.get<NotificationListResponse>('/notifications/', {
        params: { page_size: 15, ordering: '-created_at' },
      });
      return unwrapList(data);
    },
    enabled,
    staleTime: 20_000,
    refetchInterval: open ? 30_000 : 60_000,
  });

  const scanAlerts = useCallback(async () => {
    if (!enabled) return;
    try {
      await api.post('/notifications/scan_alerts/', {
        days_ahead: 30,
        low_stock_threshold: 100,
        include_low_stock: true,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications-header'] }),
      ]);
    } catch {
      // Non-blocking: list/count still work if scan fails
    }
  }, [enabled, queryClient]);

  // Refresh alerts when the session is ready and periodically.
  useEffect(() => {
    if (!enabled) return;
    void scanAlerts();
    const id = window.setInterval(() => void scanAlerts(), 5 * 60_000);
    return () => window.clearInterval(id);
  }, [enabled, scanAlerts]);

  const unreadCount = unreadQuery.data ?? 0;
  const items = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      void scanAlerts();
      void listQuery.refetch();
      void unreadQuery.refetch();
    }
  };

  const markRead = async (note: AppNotification) => {
    if (!note.is_read) {
      try {
        await api.post(`/notifications/${note.id}/mark_read/`);
        queryClient.setQueryData<AppNotification[]>(
          ['notifications-header'],
          (prev) =>
            (prev || []).map((n) =>
              n.id === note.id ? { ...n, is_read: true } : n,
            ),
        );
        await queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      } catch {
        // ignore
      }
    }
    if (note.link) {
      navigate(note.link);
      setOpen(false);
    }
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/mark_all_read/');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications-header'] }),
      ]);
    } catch {
      // ignore
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative',
            compact && 'h-9 w-9 rounded-lg text-muted-foreground hover:bg-muted/70 hover:text-foreground',
          )}
          aria-label="Notifications"
        >
          <Bell className={cn('h-4 w-4', compact && 'h-[1.125rem] w-[1.125rem]')} />
          {unreadCount > 0 ? (
            <Badge
              variant="destructive"
              className="absolute -top-0.5 -end-0.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px]"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={alignEnd ? (direction === 'rtl' ? 'start' : 'end') : 'start'}
        className="w-96 p-0"
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <DropdownMenuLabel className="p-0">
            {t('core.header.notifications', 'Notifications')}
          </DropdownMenuLabel>
          {unreadCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={(e) => {
                e.preventDefault();
                void markAllRead();
              }}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {t('core.header.markAllRead', 'Mark all read')}
            </Button>
          ) : null}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-[320px] overflow-y-auto">
          {listQuery.isLoading && items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t('core.header.loadingNotifications', 'Loading…')}
            </p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t('core.header.noNotifications', 'No notifications yet')}
            </p>
          ) : (
            items.map((note) => {
              const Icon = typeIcon(note.notification_type);
              return (
                <DropdownMenuItem
                  key={note.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-none px-3 py-3',
                    !note.is_read && 'bg-muted/50',
                  )}
                  onSelect={(e) => {
                    e.preventDefault();
                    void markRead(note);
                  }}
                >
                  <Icon
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0',
                      note.notification_type === 'stock_expiry'
                        ? 'text-amber-600'
                        : note.notification_type === 'low_stock'
                          ? 'text-destructive'
                          : 'text-muted-foreground',
                    )}
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-medium leading-snug">{note.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{note.message}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      {note.created_at ? <span>{formatDateTime(note.created_at)}</span> : null}
                    </div>
                  </div>
                  {!note.is_read ? (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  ) : null}
                </DropdownMenuItem>
              );
            })
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="grid grid-cols-2 gap-0">
          <Button
            type="button"
            variant="ghost"
            className="h-9 rounded-none text-xs"
            onClick={() => {
              navigate('/stock/expiring');
              setOpen(false);
            }}
          >
            {t('core.header.viewExpiring', 'Expiring stock')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-9 rounded-none text-xs"
            onClick={() => {
              navigate('/stock/low-stock');
              setOpen(false);
            }}
          >
            {t('core.header.viewLowStock', 'Low stock')}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
