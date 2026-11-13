'use client';

import { useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { STATUS_STYLES } from '@/lib/design-tokens';
import type { OrderStatus } from '@/lib/design-tokens';

export interface OrderStatusConfigEntry {
  label: string;
  bg: string;
  text: string;
  nextStatus: OrderStatus | null;
  nextLabel: string | null;
}

export type GetOrderStatusConfig = (status: string | null | undefined) => OrderStatusConfigEntry;

/**
 * Status badge config - uses semantic design tokens for colors.
 * Returns a safe lookup: unknown/null status falls back to a neutral terminal
 * config so the component never crashes on unexpected DB values.
 */
export function useOrderStatusConfig(): GetOrderStatusConfig {
  const t = useTranslations('orders');

  const statusConfig: Record<string, OrderStatusConfigEntry> = useMemo(() => {
    const pending: OrderStatusConfigEntry = {
      label: t('statusPendingCard'),
      bg: STATUS_STYLES.pending.bg,
      text: STATUS_STYLES.pending.text,
      nextStatus: 'preparing',
      nextLabel: t('actionPrepare'),
    };
    return {
      pending,
      // The DB CHECK also allows `confirmed` and `served`, outside the app's
      // OrderStatus union. Without these entries the raw English value was shown
      // as the badge label ("confirmed", seen 2026-11-13).
      confirmed: pending,
      served: {
        label: t('statusServedCard'),
        bg: STATUS_STYLES.delivered.bg,
        text: STATUS_STYLES.delivered.text,
        nextStatus: null,
        nextLabel: null,
      },
      preparing: {
        label: t('statusPreparingCard'),
        bg: STATUS_STYLES.preparing.bg,
        text: STATUS_STYLES.preparing.text,
        nextStatus: 'ready',
        nextLabel: t('actionReady'),
      },
      ready: {
        label: t('statusReadyCard'),
        bg: STATUS_STYLES.ready.bg,
        text: STATUS_STYLES.ready.text,
        nextStatus: 'delivered',
        nextLabel: t('actionDeliver'),
      },
      delivered: {
        label: t('statusDeliveredCard'),
        bg: STATUS_STYLES.delivered.bg,
        text: STATUS_STYLES.delivered.text,
        nextStatus: null,
        nextLabel: null,
      },
      cancelled: {
        label: t('statusCancelledCard'),
        bg: STATUS_STYLES.cancelled.bg,
        text: STATUS_STYLES.cancelled.text,
        nextStatus: null,
        nextLabel: null,
      },
    };
  }, [t]);

  // Safe lookup: unknown/null status falls back to a neutral terminal config
  // so the component never crashes on unexpected DB values.
  const getStatusConfig = useCallback<GetOrderStatusConfig>(
    (status) =>
      (status && statusConfig[status]) || {
        label: status ?? '-',
        bg: 'bg-app-elevated',
        text: 'text-app-text-muted',
        nextStatus: null as OrderStatus | null,
        nextLabel: null as string | null,
      },
    [statusConfig],
  );

  return getStatusConfig;
}
