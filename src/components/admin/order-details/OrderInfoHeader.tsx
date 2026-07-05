'use client';

import { useTranslations } from 'next-intl';
import { Clock, User, MessageSquare, Phone, MapPin, Hash } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Order } from '@/types/admin.types';
import { getStatusStyle } from '@/lib/design-tokens';
import { InfoChip } from './InfoChip';

interface OrderInfoHeaderProps {
  order: Order;
  isComp: boolean;
  statusStyle: ReturnType<typeof getStatusStyle>;
  displayTotal: number;
  tipAmount: number;
  fmt: (amount: number) => string;
  locale: string;
  serviceLabels: Record<string, string>;
}

export function OrderInfoHeader({
  order,
  isComp,
  statusStyle,
  displayTotal,
  tipAmount,
  fmt,
  locale,
  serviceLabels,
}: OrderInfoHeaderProps) {
  const t = useTranslations('orders');
  const ta = useTranslations('admin');
  const th = useTranslations('houseAccount');

  return (
    <div className="shrink-0 space-y-3 mb-3">
      {/* Status + total + time - single compact row */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge className={`${statusStyle.bg} ${statusStyle.text} border-0 text-xs`}>
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${statusStyle.dot} ${statusStyle.pulse ? 'animate-pulse' : ''}`}
          />
          {t(
            `status${order.status.charAt(0).toUpperCase()}${order.status.slice(1)}Card` as Parameters<
              typeof t
            >[0],
          )}
        </Badge>
        {order.service_type && order.service_type !== 'dine_in' && (
          <Badge variant="outline" className="text-[10px]">
            {serviceLabels[order.service_type] || order.service_type}
          </Badge>
        )}
        {isComp && (
          <Badge className="bg-status-info-bg text-status-info border-0 text-[10px]">
            {ta('payComped')}
          </Badge>
        )}
        {order.house_account_id && (
          <Badge variant="outline" className="text-[10px]">
            {th('onTab')}
          </Badge>
        )}
        <span className="text-lg font-bold text-app-text ml-auto">
          {fmt(displayTotal + tipAmount)}
        </span>
        {tipAmount > 0 && (
          <span className="text-[10px] text-[var(--success)] font-medium">
            +{fmt(tipAmount)} {ta('tipLabel')}
          </span>
        )}
        <span className="flex items-center gap-1 text-[10px] text-app-text-muted">
          <Clock className="w-3 h-3" />
          {new Date(order.created_at).toLocaleString(locale)}
        </span>
      </div>

      {/* Info row - inline chips */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <InfoChip icon={<Hash className="w-3 h-3" />} value={order.table_number} />
        <InfoChip
          icon={<User className="w-3 h-3" />}
          label={t('serverLabel')}
          value={order.server?.full_name ?? ta('unassigned')}
        />
        {(order.customer_name || order.customer_phone) && (
          <InfoChip
            icon={
              order.customer_phone ? <Phone className="w-3 h-3" /> : <User className="w-3 h-3" />
            }
            value={[order.customer_name, order.customer_phone].filter(Boolean).join(' - ')}
          />
        )}
        {order.room_number && (
          <InfoChip icon={<MapPin className="w-3 h-3" />} value={order.room_number} />
        )}
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="flex items-start gap-1.5 rounded-lg border border-status-warning/20 bg-status-warning-bg px-2.5 py-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-status-warning shrink-0 mt-0.5" />
          <p className="text-xs text-status-warning">{order.notes}</p>
        </div>
      )}
    </div>
  );
}
