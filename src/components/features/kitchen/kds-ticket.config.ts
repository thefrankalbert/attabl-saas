import type { OrderStatus } from '@/types/admin.types';

// --- Urgency -------------------------------------------------

export type UrgencyLevel = 'fresh' | 'normal' | 'aging' | 'late' | 'critical';

export function getUrgency(minutes: number): UrgencyLevel {
  if (minutes < 5) return 'fresh';
  if (minutes < 10) return 'normal';
  if (minutes < 15) return 'aging';
  if (minutes < 20) return 'late';
  return 'critical';
}

export const URGENCY_BORDER: Record<UrgencyLevel, string> = {
  fresh: '',
  normal: '',
  aging: '',
  late: '',
  critical: '',
};

// --- Status badge config -------------------------------------

export const STATUS_BADGE: Record<string, { labelKey: string; className: string }> = {
  pending: {
    labelKey: 'statusQueue',
    className: 'text-app-text-muted border border-app-border',
  },
  preparing: {
    labelKey: 'statusCooking',
    className: 'border border-[var(--border)] text-[var(--warning)]',
  },
  ready: {
    labelKey: 'statusPacking',
    className: 'border border-[var(--border)] text-[var(--success)]',
  },
};

// --- CTA config ----------------------------------------------

export const CTA_CONFIG: Record<
  string,
  { labelKey: string; next: OrderStatus | undefined; bg: string }
> = {
  pending: {
    labelKey: 'startCooking',
    next: 'preparing',
    bg: '',
  },
  preparing: {
    labelKey: 'finishCooking',
    next: 'ready',
    bg: '',
  },
  ready: {
    labelKey: 'done',
    next: 'delivered',
    bg: '',
  },
};

// --- Coursing ------------------------------------------------
// Group items by course on the expanded ticket (audit: coursing). Order matters
// for kitchen pacing: starters -> mains -> dessert -> drinks. Only kicks in when
// items actually carry a course; otherwise the ticket stays a flat list.
export const COURSE_ORDER = ['appetizer', 'main', 'dessert', 'drink'] as const;
export const COURSE_LABEL_KEY: Record<string, string> = {
  appetizer: 'courseAppetizer',
  main: 'courseMain',
  dessert: 'courseDessert',
  drink: 'courseDrink',
};

// --- Time formatting -----------------------------------------

export function formatTime(seconds: number) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
