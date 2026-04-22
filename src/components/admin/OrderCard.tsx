'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Clock, Timer, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import type { Order, OrderStatus } from '@/types/admin.types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface OrderCardProps {
  order: Order;
  onStatusChange: (orderId: string, newStatus: OrderStatus) => void;
  onClick?: () => void;
  compact?: boolean;
}

function useElapsedTime(createdAt: string, status: OrderStatus) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const calculate = () => Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);

    if (status === 'delivered' || status === 'cancelled') {
      // Use Promise.resolve to avoid synchronous setState in effect
      Promise.resolve(calculate()).then(setElapsed);
      return;
    }
    const interval = setInterval(() => {
      setElapsed(calculate());
    }, 1000);
    return () => clearInterval(interval);
  }, [createdAt, status]);

  return elapsed;
}

function formatElapsedTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}m`;
}

export default function OrderCard({
  order,
  onStatusChange,
  onClick,
  compact = false,
}: OrderCardProps) {
  const t = useTranslations('orders');

  const statusConfig = useMemo(
    (): Record<
      OrderStatus,
      {
        color: string;
        bg: string;
        text: string;
        label: string;
        border: string;
        nextStatus: OrderStatus | null;
        nextLabel: string | null;
      }
    > => ({
      pending: {
        color: 'var(--color-status-warning)',
        bg: 'bg-status-warning-bg',
        text: 'text-status-warning',
        label: t('statusPending'),
        border: 'border-l-status-warning',
        nextStatus: 'preparing',
        nextLabel: t('actionPrepare'),
      },
      preparing: {
        color: 'var(--color-status-info)',
        bg: 'bg-status-info-bg',
        text: 'text-status-info',
        label: t('statusPreparing'),
        border: 'border-l-status-info',
        nextStatus: 'ready',
        nextLabel: t('actionReady'),
      },
      ready: {
        color: 'var(--color-status-success)',
        bg: 'bg-status-success-bg',
        text: 'text-status-success',
        label: t('statusReady'),
        border: 'border-l-status-success',
        nextStatus: 'delivered',
        nextLabel: t('actionDeliver'),
      },
      delivered: {
        color: 'var(--color-app-text-muted)',
        bg: 'bg-app-elevated',
        text: 'text-app-text-muted',
        label: t('statusDelivered'),
        border: 'border-l-app-text-muted',
        nextStatus: null,
        nextLabel: null,
      },
      cancelled: {
        color: 'var(--color-status-error)',
        bg: 'bg-status-error-bg',
        text: 'text-status-error',
        label: t('statusCancelled'),
        border: 'border-l-status-error',
        nextStatus: null,
        nextLabel: null,
      },
    }),
    [t],
  );

  const config = statusConfig[order.status];
  const elapsed = useElapsedTime(order.created_at, order.status);
  const isUrgent = elapsed >= 600 && ['pending', 'preparing'].includes(order.status);

  return (
    <motion.div
      layoutId={order.id}
      onClick={onClick}
      className={cn(
        'bg-app-card rounded-[10px] border-l-[6px] transition-all cursor-pointer overflow-hidden',
        config.border,
        isUrgent && 'ring-2 ring-status-error ring-offset-2',
      )}
    >
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-app-elevated rounded-lg flex items-center justify-center font-bold text-app-text">
              {order.table_number}
            </div>
            <div>
              <p className="font-bold text-app-text">
                {t('tablePrefix')} {order.table_number}
              </p>
              <div className="flex items-center gap-1 text-xs text-app-text-secondary">
                <Clock className="w-3 h-3" />
                {new Date(order.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn('uppercase text-[10px] tracking-wider border-0', config.bg, config.text)}
          >
            {config.label}
          </Badge>
        </div>

        {/* Timer */}
        <div
          className={cn(
            'flex items-center gap-1.5 text-xs font-mono font-bold',
            isUrgent
              ? 'text-status-error animate-pulse'
              : elapsed > 300
                ? 'text-status-warning'
                : 'text-status-success',
          )}
        >
          {isUrgent && <AlertTriangle className="w-3.5 h-3.5" />}
          <Timer className="w-3.5 h-3.5" />
          {formatElapsedTime(elapsed)}
        </div>

        {/* Items Preview */}
        {!compact && (
          <div className="space-y-1 pt-2 border-t border-app-border">
            {(order.items || []).slice(0, 3).map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="flex gap-2">
                  <span className="font-bold w-5 text-app-text-secondary">{item.quantity}x</span>
                  <span className="text-app-text truncate max-w-36">{item.name}</span>
                </span>
              </div>
            ))}
            {(order.items?.length || 0) > 3 && (
              <p className="text-xs text-app-text-muted italic">
                {t('moreItems', { count: order.items!.length - 3 })}
              </p>
            )}
          </div>
        )}

        {/* Action Button */}
        {config.nextStatus && (
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(order.id, config.nextStatus!);
            }}
            className={cn(
              'w-full mt-2 py-3 min-h-[44px] rounded-lg flex items-center justify-center gap-2 text-xs font-bold uppercase text-accent-text hover:opacity-90',
              order.status === 'pending'
                ? 'bg-status-warning'
                : order.status === 'preparing'
                  ? 'bg-status-info'
                  : 'bg-status-success',
            )}
          >
            {config.nextLabel} <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}
