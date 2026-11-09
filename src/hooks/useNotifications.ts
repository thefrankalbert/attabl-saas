'use client';

import { useCallback, useMemo, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import {
  actionMarkNotificationRead,
  actionMarkAllNotificationsRead,
} from '@/app/actions/notifications';

export interface Notification {
  id: string;
  tenant_id: string;
  user_id: string | null;
  type: 'info' | 'warning' | 'success' | 'error' | 'stock_alert';
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

type NotificationRow = Notification & { notification_reads: { user_id: string }[] | null };

/** Read = legacy shared flag OR the viewer's own read row. */
export function toNotification({ notification_reads, ...row }: NotificationRow): Notification {
  return { ...row, read: row.read || (notification_reads?.length ?? 0) > 0 };
}

interface UseNotificationsOptions {
  tenantId: string;
  userId?: string;
  enabled?: boolean;
  /** Called immediately when a new notification arrives via realtime (before query refetch) */
  onNewNotification?: () => void;
}

export function useNotifications({
  tenantId,
  userId,
  enabled = true,
  onNewNotification,
}: UseNotificationsOptions) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['notifications', tenantId, userId], [tenantId, userId]);

  // Keep callback ref stable to avoid re-subscribing on every render
  const onNewNotificationRef = useRef(onNewNotification);
  useEffect(() => {
    onNewNotificationRef.current = onNewNotification;
  });

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('notifications')
        // Explicit columns (rule 05). `notification_reads` is filtered by RLS to
        // the viewer's own rows: "read" is per person (migration 20261109210000),
        // the legacy shared `read` flag still counts for older rows.
        .select(
          'id, tenant_id, user_id, type, title, body, link, read, created_at, notification_reads(user_id)',
        )
        .eq('tenant_id', tenantId)
        .or(userId ? `user_id.eq.${userId},user_id.is.null` : 'user_id.is.null')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return ((data ?? []) as NotificationRow[]).map(toNotification);
    },
    enabled: enabled && !!tenantId,
  });

  // Realtime subscription - invalidate on any change + fire callback on INSERT
  useRealtimeSubscription<Record<string, unknown>>({
    channelName: `notifications_${tenantId}_${userId ?? 'all'}`,
    table: 'notifications',
    filter: `tenant_id=eq.${tenantId}`,
    onInsert: () => {
      onNewNotificationRef.current?.();
    },
    onChange: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    enabled: enabled && !!tenantId,
  });

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      await actionMarkNotificationRead(tenantId, notificationId);
      queryClient.invalidateQueries({ queryKey });
    },
    [tenantId, queryClient, queryKey],
  );

  const markAllAsRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    await actionMarkAllNotificationsRead(tenantId, unreadIds);
    queryClient.invalidateQueries({ queryKey });
  }, [tenantId, notifications, queryClient, queryKey]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
  };
}
