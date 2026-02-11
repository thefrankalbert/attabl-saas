'use client';

import { useState, useEffect } from 'react';
import { Clock, Timer, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import type { Order, OrderStatus } from '@/types/admin.types';
import { Badge } from '@/components/ui/badge';

interface OrderCardProps {
  order: Order;
  onStatusChange: (orderId: string, newStatus: OrderStatus) => void;
  onClick?: () => void;
  compact?: boolean;
}

const statusConfig: Record<
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
> = {
  pending: {
    color: '#F59E0B',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    label: 'En attente',
    border: 'border-l-amber-500',
    nextStatus: 'preparing',
    nextLabel: 'Préparer',
  },
  preparing: {
    color: '#3B82F6',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    label: 'Préparation',
    border: 'border-l-blue-500',
    nextStatus: 'ready',
    nextLabel: 'Prêt',
  },
  ready: {
    color: '#22C55E',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    label: 'Prêt',
    border: 'border-l-emerald-500',
    nextStatus: 'delivered',
    nextLabel: 'Livrer',
  },
  delivered: {
    color: '#6B7280',
    bg: 'bg-slate-50',
    text: 'text-slate-500',
    label: 'Livré',
    border: 'border-l-slate-500',
    nextStatus: null,
    nextLabel: null,
  },
  cancelled: {
    color: '#EF4444',
    bg: 'bg-red-50',
    text: 'text-red-500',
    label: 'Annulée',
    border: 'border-l-red-500',
    nextStatus: null,
    nextLabel: null,
  },
};

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
  const config = statusConfig[order.status];
  const elapsed = useElapsedTime(order.created_at, order.status);
  const isUrgent = elapsed >= 600 && ['pending', 'preparing'].includes(order.status);

  return (
    <motion.div
      layoutId={order.id}
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl border-l-[6px] shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden',
        config.border,
        isUrgent && 'ring-2 ring-red-500 ring-offset-2',
      )}
    >
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center font-bold text-gray-900">
              {order.table_number}
            </div>
            <div>
              <p className="font-bold text-gray-900">Table {order.table_number}</p>
              <div className="flex items-center gap-1 text-xs text-gray-500">
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
              ? 'text-red-500 animate-pulse'
              : elapsed > 300
                ? 'text-amber-500'
                : 'text-emerald-500',
          )}
        >
          {isUrgent && <AlertTriangle className="w-3.5 h-3.5" />}
          <Timer className="w-3.5 h-3.5" />
          {formatElapsedTime(elapsed)}
        </div>

        {/* Items Preview */}
        {!compact && (
          <div className="space-y-1 pt-2 border-t border-gray-50">
            {(order.items || []).slice(0, 3).map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="flex gap-2">
                  <span className="font-bold w-5 text-gray-500">{item.quantity}x</span>
                  <span className="text-gray-700 truncate max-w-[140px]">{item.name}</span>
                </span>
              </div>
            ))}
            {(order.items?.length || 0) > 3 && (
              <p className="text-xs text-gray-400 italic">+{order.items!.length - 3} autres...</p>
            )}
          </div>
        )}

        {/* Action Button */}
        {config.nextStatus && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(order.id, config.nextStatus!);
            }}
            className={cn(
              'w-full mt-2 py-2 rounded-lg flex items-center justify-center gap-2 text-xs font-bold uppercase text-white transition-opacity hover:opacity-90',
              order.status === 'pending'
                ? 'bg-amber-500'
                : order.status === 'preparing'
                  ? 'bg-blue-500'
                  : 'bg-emerald-500',
            )}
          >
            {config.nextLabel} <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
