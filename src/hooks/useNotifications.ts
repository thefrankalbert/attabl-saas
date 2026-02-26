'use client';

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

export interface Notification {
  id: string;
  tenant_id: string;
  user_id: string | null;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

interface UseNotificationsOptions {
  tenantId: string;
  userId?: string;
  enabled?: boolean;
}

export function useNotifications({ tenantId, userId, enabled = true }: UseNotificationsOptions) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['notifications', tenantId, userId], [tenantId, userId]);

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('tenant_id', tenantId)
        .or(userId ? `user_id.eq.${userId},user_id.is.null` : 'user_id.is.null')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data as Notification[]) ?? [];
    },
    enabled: enabled && !!tenantId,
  });

  // Realtime subscription — invalidate on any change
  useRealtimeSubscription<Record<string, unknown>>({
    channelName: `notifications_${tenantId}_${userId ?? 'all'}`,
    table: 'notifications',
    filter: `tenant_id=eq.${tenantId}`,
    onChange: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    enabled: enabled && !!tenantId,
  });

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      const supabase = createClient();
      await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
      queryClient.invalidateQueries({ queryKey });
    },
    [queryClient, queryKey],
  );

  const markAllAsRead = useCallback(async () => {
    const supabase = createClient();
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
    queryClient.invalidateQueries({ queryKey });
  }, [notifications, queryClient, queryKey]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
  };
}
