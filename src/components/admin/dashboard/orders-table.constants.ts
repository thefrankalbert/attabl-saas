import { Clock, LoaderCircle, CircleCheck, CircleX } from 'lucide-react';
import type { OrderStatus, PaymentStatus } from '@/types/admin.types';

export const PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 20, 50];

// Override the shadcn Table defaults (uppercase 12px th / 14px td) to match the
// maquette: normal-case 13px/500 muted headers, 13px cells with 10px padding.
export const HEAD_CLS =
  'h-10 px-2.5 text-[13px] font-medium normal-case tracking-normal whitespace-nowrap text-[var(--muted-foreground)]';
export const CELL_CLS = 'px-2.5 py-2.5 text-[13px] whitespace-nowrap';

// From xl the orders card shares the row with the KPI column and is too narrow
// for every column (measured 2026-11-13: ~1000px of columns in a 668px card at
// 1440 with the sidebar open). Payment steps aside between xl and 2xl instead of
// clipping; the Type column is off by default (opt-in via the column picker).
export const PAYMENT_COL_CLS = 'xl:max-2xl:hidden';

// Elapsed-time pill tones (maquette u-gray / u-orange / u-red)
export const TONE = {
  muted: { bg: 'var(--muted)', fg: 'var(--muted-foreground)' },
  warn: { bg: 'color-mix(in oklab, var(--warning) 18%, transparent)', fg: 'var(--warning)' },
  urgent: {
    bg: 'color-mix(in oklab, var(--destructive) 18%, transparent)',
    fg: 'var(--destructive)',
  },
};

export type TabKey = 'all' | 'pending' | 'kitchen' | 'served' | 'cancelled';

export const TAB_FILTER: Record<TabKey, (s: OrderStatus) => boolean> = {
  all: () => true,
  pending: (s) => s === 'pending',
  kitchen: (s) => s === 'preparing' || s === 'ready',
  served: (s) => s === 'delivered',
  cancelled: (s) => s === 'cancelled',
};

export const STATUS_META: Record<
  OrderStatus,
  { icon: typeof Clock; className: string; spin?: boolean; labelKey: string }
> = {
  pending: {
    icon: Clock,
    className: 'text-[var(--muted-foreground)]',
    labelKey: 'statusPendingCard',
  },
  preparing: {
    icon: LoaderCircle,
    className: 'text-[var(--warning)]',
    spin: true,
    labelKey: 'statusPreparingCard',
  },
  ready: { icon: CircleCheck, className: 'text-[var(--success)]', labelKey: 'statusReadyCard' },
  delivered: {
    icon: CircleCheck,
    className: 'text-[var(--success)]',
    labelKey: 'statusDeliveredCard',
  },
  cancelled: {
    icon: CircleX,
    className: 'text-[var(--destructive)]',
    labelKey: 'statusCancelledCard',
  },
};

export const PAYMENT_META: Record<PaymentStatus, { labelKey: string; color: string }> = {
  paid: { labelKey: 'payPaid', color: 'text-[var(--success)]' },
  pending: { labelKey: 'payPending', color: 'text-[var(--warning)]' },
  partial: { labelKey: 'payPartial', color: 'text-[var(--warning)]' },
  refunded: { labelKey: 'payRefunded', color: 'text-[var(--muted-foreground)]' },
  comp: { labelKey: 'payComped', color: 'text-status-info' },
};

export type ColKey = 'type' | 'payment' | 'items';

export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
};
