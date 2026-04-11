'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bell, CheckCheck, Info, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotifications, type Notification } from '@/hooks/useNotifications';
import { useSound } from '@/contexts/SoundContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TYPE_ICONS: Record<Notification['type'], typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle,
  error: XCircle,
};

const TYPE_COLORS: Record<Notification['type'], string> = {
  info: 'text-blue-500',
  warning: 'text-amber-500',
  success: 'text-green-500',
  error: 'text-red-500',
};

interface NotificationCenterProps {
  tenantId: string;
  userId?: string;
}

export function NotificationCenter({ tenantId, userId }: NotificationCenterProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Render a placeholder bell icon during SSR / before hydration
  // to avoid NextIntlClientProvider context errors during SSR→client fallback
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="w-9 h-9" aria-label="Notifications">
        <Bell className="w-4 h-4" />
      </Button>
    );
  }

  return <NotificationCenterInner tenantId={tenantId} userId={userId} />;
}

function NotificationCenterInner({ tenantId, userId }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const params = useParams();
  const t = useTranslations('notifications');
  const site = params?.site as string | undefined;
  const basePath = site ? `/sites/${site}/admin` : '/admin';
  const { play } = useSound();

  // Play sound immediately when a new notification arrives via realtime
  const handleNewNotification = useCallback(() => {
    play();
  }, [play]);

  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications({
    tenantId,
    userId,
    onNewNotification: handleNewNotification,
  });

  const handleClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
    if (notification.link) {
      setOpen(false);
      router.push(`${basePath}${notification.link}`);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return t('justNow');
    if (diffMin < 60) return t('minutesAgo', { count: diffMin });
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return t('hoursAgo', { count: diffHours });
    const diffDays = Math.floor(diffHours / 24);
    return t('daysAgo', { count: diffDays });
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-app-text-muted hover:bg-app-hover hover:text-app-text transition-colors touch-manipulation relative"
          aria-label={t('title')}
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-status-error px-0.5 text-[9px] font-bold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0 bg-app-card border border-app-border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
          <h3 className="text-sm font-semibold text-app-text">{t('title')}</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllAsRead()}
              className="gap-1 text-xs text-app-text-secondary hover:text-app-text"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {t('markAllRead')}
            </Button>
          )}
        </div>

        {/* List */}
        <div className="max-h-80 overflow-y-auto divide-y divide-app-border">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-app-text-muted">{t('empty')}</div>
          ) : (
            notifications.map((notification) => {
              const Icon = TYPE_ICONS[notification.type];
              return (
                <Button
                  key={notification.id}
                  variant="ghost"
                  onClick={() => handleClick(notification)}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3 text-left h-auto rounded-none whitespace-normal',
                    !notification.read && 'bg-accent/5',
                  )}
                >
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TYPE_COLORS[notification.type])} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn(
                          'text-sm break-words',
                          !notification.read
                            ? 'font-medium text-app-text'
                            : 'text-app-text-secondary',
                        )}
                      >
                        {notification.title}
                      </p>
                      {!notification.read && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                      )}
                    </div>
                    {notification.body && (
                      <p className="mt-0.5 text-xs text-app-text-muted">{notification.body}</p>
                    )}
                    <p className="mt-1 text-xs text-app-text-muted">
                      {formatTime(notification.created_at)}
                    </p>
                  </div>
                </Button>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
