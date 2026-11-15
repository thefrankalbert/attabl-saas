'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Bell,
  BellOff,
  BellRing,
  CheckCheck,
  Info,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Package,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useNotifications,
  type Notification,
  type NotificationBaseType,
} from '@/hooks/useNotifications';
import { useReminderMutes } from '@/hooks/queries/useReminderMutes';
import { useToast } from '@/components/ui/use-toast';
import { REMINDER_RULES, type ReminderRule } from '@/lib/validations/reminders.schema';
import { useSound } from '@/contexts/SoundContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TYPE_ICONS: Record<NotificationBaseType, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle,
  error: XCircle,
  stock_alert: Package,
};

const TYPE_COLORS: Record<NotificationBaseType, string> = {
  info: 'text-[var(--muted-foreground)]',
  warning: 'text-[var(--warning)]',
  success: 'text-[var(--success)]',
  error: 'text-[var(--destructive)]',
  stock_alert: 'text-[var(--warning)]',
};

/** `reminder:<regle>` -> la regle, sinon null. */
function reminderRuleOf(type: Notification['type']): ReminderRule | null {
  if (!type.startsWith('reminder:')) return null;
  const rule = type.slice('reminder:'.length) as ReminderRule;
  return REMINDER_RULES.includes(rule) ? rule : null;
}

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
      <Button variant="ghost" size="icon" aria-label="Notifications">
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
  const { muted, setMuted } = useReminderMutes(tenantId);
  const { toast } = useToast();
  const toggleMute = async (rule: ReminderRule, on: boolean) => {
    const res = await setMuted(rule, on);
    if (!res.success)
      toast({ title: t('muteError'), description: res.error, variant: 'destructive' });
  };

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
        <Button
          variant="ghost"
          size="icon"
          className="relative text-app-text-muted"
          aria-label={t('title')}
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-status-error px-1 text-[10px] font-bold tabular-nums text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
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
              const rule = reminderRuleOf(notification.type);
              const Icon = rule
                ? BellRing
                : (TYPE_ICONS[notification.type as NotificationBaseType] ?? Info);
              const iconColor = rule
                ? 'text-[var(--warning)]'
                : TYPE_COLORS[notification.type as NotificationBaseType];
              return (
                <div key={notification.id}>
                  <Button
                    variant="ghost"
                    onClick={() => handleClick(notification)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left h-auto rounded-none whitespace-normal',
                      !notification.read && 'bg-accent/5',
                    )}
                  >
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconColor)} />
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
                  {/* Sibling, not nested: a button never sits inside another button. */}
                  {rule && !muted.includes(rule) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void toggleMute(rule, true)}
                      className="ml-11 mb-2 h-8 gap-1 px-2 text-xs text-app-text-muted hover:text-app-text"
                    >
                      <BellOff className="h-3.5 w-3.5" />
                      {t('muteReminder')}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Reminders this person muted: switch them back on from here (a waiter
            cannot open the settings). */}
        {muted.length > 0 && (
          <div className="border-t border-app-border px-4 py-3 space-y-2">
            <p className="text-xs font-medium text-app-text-secondary">{t('mutedTitle')}</p>
            {muted.map((r) => (
              <div key={r} className="flex items-center justify-between gap-2">
                <span className="text-xs text-app-text-muted">{t(`reminderRules.${r}`)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void toggleMute(r, false)}
                  className="h-8 px-2 text-xs"
                >
                  {t('unmuteReminder')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
