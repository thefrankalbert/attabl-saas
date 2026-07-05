'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Order, OrderItem, OrderStatus, KDSZoneFilter } from '@/types/admin.types';
import { getUrgency, STATUS_BADGE, CTA_CONFIG, formatTime } from './kds-ticket.config';

interface UseKDSTicketParams {
  order: Order;
  onStatusChange: (id: string, status: OrderStatus) => void;
  isMock: boolean;
  zoneFilter: KDSZoneFilter;
  barDisplayEnabled: boolean;
}

export function useKDSTicket({
  order,
  onStatusChange,
  isMock,
  zoneFilter,
  barDisplayEnabled,
}: UseKDSTicketParams) {
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations('kitchen');

  // Extract short order number: "CMD-20260403-001" -> "001"
  const shortOrderNumber = useMemo(() => {
    const num = order.order_number;
    if (!num) return order.table_number;
    const match = num.match(/-(\d+)$/);
    return match ? match[1] : num;
  }, [order.order_number, order.table_number]);

  // --- Service type labels ---------------------------------
  const SERVICE_LABELS: Record<string, string> = {
    dine_in: t('serviceDineIn'),
    takeaway: t('serviceTakeaway'),
    delivery: t('serviceDelivery'),
    room_service: t('serviceRoom'),
  };

  // Filter items based on zone selection
  const allItems: OrderItem[] =
    order.items || (order as { order_items?: OrderItem[] }).order_items || [];
  const items = allItems.filter((item) => {
    const zone = item.preparation_zone || 'kitchen';
    if (!barDisplayEnabled) {
      // Bar display OFF: show all items on the single KDS screen
      return true;
    }
    // Bar display ON: filter by selected zone
    if (zoneFilter === 'kitchen') return zone !== 'bar';
    if (zoneFilter === 'bar') return zone !== 'kitchen';
    return true; // 'all' shows everything
  });

  // --- Timer (stops when order is ready/delivered) -----------
  const isTimerActive = order.status === 'pending' || order.status === 'preparing';
  useEffect(() => {
    const calculate = () => {
      const diff = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000);
      setElapsed(diff);
    };
    calculate();
    if (!isTimerActive) return;
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [order.created_at, isTimerActive]);

  const minutes = Math.floor(elapsed / 60);
  const urgency = getUrgency(minutes);

  // --- Due time (created_at + 20min as default target) -----
  const dueTimeStr = useMemo(() => {
    const d = new Date(order.created_at);
    d.setMinutes(d.getMinutes() + 20);
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  }, [order.created_at]);

  // --- Status badge ----------------------------------------
  const badge = STATUS_BADGE[order.status] || STATUS_BADGE.pending;
  const isDelayed = urgency === 'critical';

  // --- CTA -------------------------------------------------
  const cta = CTA_CONFIG[order.status];

  // --- Service type ----------------------------------------
  const serviceLabel = order.service_type ? SERVICE_LABELS[order.service_type] : null;

  // --- Server name (from joined admin_users relation) -----
  const serverName = (order as unknown as { server?: { full_name?: string } }).server?.full_name;

  // --- Actions ---------------------------------------------
  const handleAction = () => {
    if (isMock) return;
    if (cta?.next) onStatusChange(order.id, cta.next);
  };

  const elapsedStr = formatTime(elapsed);

  // --- Per-item renderer (shared by flat + course-grouped layouts) -----
  const hasCourses = items.some((i) => !!i.course);

  return {
    expanded,
    setExpanded,
    shortOrderNumber,
    items,
    urgency,
    dueTimeStr,
    badge,
    isDelayed,
    cta,
    serviceLabel,
    serverName,
    handleAction,
    elapsedStr,
    hasCourses,
  };
}
