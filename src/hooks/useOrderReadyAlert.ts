'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useAssignments } from '@/hooks/queries/useAssignments';
import { useSound } from '@/contexts/SoundContext';
import { useToast } from '@/components/ui/use-toast';

export interface ReadyOrderRow extends Record<string, unknown> {
  id: string;
  status: string;
  server_id?: string | null;
  table_id?: string | null;
  table_number?: string | null;
  order_number?: string | null;
}

/**
 * True when this ready order belongs to me: I took it, or its table is assigned
 * to me (customer QR orders carry no server_id).
 */
export function isMyReadyOrder(
  row: ReadyOrderRow,
  me: string,
  myTableIds: ReadonlySet<string>,
): boolean {
  if (row.status !== 'ready') return false;
  if (row.server_id === me) return true;
  return !!row.table_id && myTableIds.has(row.table_id);
}

/**
 * True only on a real transition INTO 'ready'. Realtime UPDATE payloads carry no
 * old status, and any later edit of a ready order (payment, tip, note) arrives
 * with status 'ready' again: the last status seen per order decides.
 */
export function becameReady(lastSeen: Map<string, string>, row: ReadyOrderRow): boolean {
  const before = lastSeen.get(row.id);
  lastSeen.set(row.id, row.status);
  return row.status === 'ready' && before !== 'ready';
}

/**
 * Sound + vibration + toast when the kitchen marks one of MY orders ready
 * (owner decision 2026-11-14), on every admin screen. The push notification
 * covers the closed-app case.
 */
export function useOrderReadyAlert(tenantId: string, adminUserId?: string): void {
  const t = useTranslations('service');
  const { play } = useSound();
  const { toast } = useToast();
  const enabled = !!adminUserId;
  const { data: assignments, refetch } = useAssignments(enabled ? tenantId : '');
  const lastSeen = useRef(new Map<string, string>());

  // Orders already ready when the screen opens were announced before: mark them
  // seen so a later edit of one of them does not ring again after a reload.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void createClient()
      .from('orders')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'ready')
      .limit(500)
      .then(({ data, error }) => {
        if (error) logger.warn('Order ready alert: seed failed', { error });
        if (cancelled || !data) return;
        for (const o of data) {
          if (!lastSeen.current.has(o.id)) lastSeen.current.set(o.id, 'ready');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, tenantId]);

  useRealtimeSubscription<ReadyOrderRow>({
    channelName: `order-ready-alert-${tenantId}`,
    table: 'orders',
    filter: `tenant_id=eq.${tenantId}`,
    event: 'UPDATE',
    enabled,
    onUpdate: (row) => {
      if (!adminUserId || !becameReady(lastSeen.current, row)) return;
      const mine = (list: typeof assignments) =>
        new Set((list ?? []).filter((a) => a.server_id === adminUserId).map((a) => a.table_id));
      if (isMyReadyOrder(row, adminUserId, mine(assignments))) return ring(row);
      // table_assignments is not in the realtime publication: the cached list may
      // predate a new assignment. One refetch per real ready transition, not per edit.
      if (row.table_id) {
        void refetch().then(({ data }) => {
          if (isMyReadyOrder(row, adminUserId, mine(data))) ring(row);
        });
      }
    },
  });

  function ring(row: ReadyOrderRow): void {
    play();
    navigator.vibrate?.([200, 100, 200]);
    toast({
      title: row.table_number
        ? t('readyAlertTable', { table: row.table_number })
        : t('readyAlertOrder', { order: row.order_number ?? '' }),
      description: t('readyAlertDesc'),
    });
  }
}
