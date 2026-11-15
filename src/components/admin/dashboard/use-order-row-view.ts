'use client';

import { useTranslations } from 'next-intl';
import type { Order } from '@/types/admin.types';
import { PAYMENT_META, STATUS_META, TONE } from './orders-table.constants';

/**
 * Display values shared by the desktop row and the phone card of the
 * dashboard orders list, so both always show the same thing.
 * nowMs is null until hydrated: time of day and age are browser-only.
 */
export function useOrderRowView(o: Order, locale: string, nowMs: number | null) {
  const t = useTranslations('admin');
  const to = useTranslations('orders');

  const meta = STATUS_META[o.status] ?? STATUS_META.pending;
  const created = new Date(o.created_at);
  const ageMin = nowMs === null ? 0 : Math.max(0, Math.floor((nowMs - created.getTime()) / 60000));
  const activeStatus = o.status !== 'delivered' && o.status !== 'cancelled';
  const emporter = o.service_type === 'takeaway' || o.service_type === 'delivery';
  const pay = o.payment_status ? PAYMENT_META[o.payment_status] : null;

  return {
    meta,
    statusLabel: to(meta.labelKey),
    // Long numbers (CMD-20260403-001) shortened for display: #001
    shortNumber: o.order_number ? `#${o.order_number.split('-').pop()}` : o.id.slice(0, 8),
    itemNames: (o.items ?? []).map((it) => it.name).join(', ') || '-',
    channel: o.service_type ? (emporter ? t('channelEmporter') : t('channelSurplace')) : null,
    timeLabel:
      nowMs === null
        ? '--:--'
        : created.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    rel:
      nowMs === null
        ? '-'
        : ageMin < 60
          ? t('agoMin', { n: ageMin })
          : t('agoHour', { n: Math.floor(ageMin / 60) }),
    tone:
      activeStatus && ageMin >= 30
        ? TONE.urgent
        : activeStatus && ageMin >= 15
          ? TONE.warn
          : TONE.muted,
    pay,
    payLabel: pay ? t(pay.labelKey) : null,
  };
}
