'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bell, CheckCheck, Info, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotifications, type Notification } from '@/hooks/useNotifications';
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
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const params = useParams();
  const t = useTranslations('notifications');
  const site = params?.site as string | undefined;
  const basePath = site ? `/sites/${site}/admin` : '/admin';

  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications({
    tenantId,
    userId,
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
        <Button variant="ghost" size="icon" className="relative" aria-label={t('title')}>
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">{t('title')}</h3>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllAsRead()}
              className="flex items-center gap-1 text-xs text-app-text-secondary hover:text-app-text transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {t('markAllRead')}
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-app-text-secondary">{t('empty')}</div>
          ) : (
            notifications.map((notification) => {
              const Icon = TYPE_ICONS[notification.type];
              return (
                <button
                  key={notification.id}
                  onClick={() => handleClick(notification)}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-app-bg',
                    !notification.read && 'bg-blue-50/50',
                  )}
                >
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TYPE_COLORS[notification.type])} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn(
                          'text-sm truncate',
                          !notification.read ? 'font-medium text-app-text' : 'text-app-text',
                        )}
                      >
                        {notification.title}
                      </p>
                      {!notification.read && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                      )}
                    </div>
                    {notification.body && (
                      <p className="mt-0.5 text-xs text-app-text-secondary line-clamp-2">
                        {notification.body}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-app-text-muted">
                      {formatTime(notification.created_at)}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
