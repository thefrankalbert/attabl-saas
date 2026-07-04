import { Package, Truck, RefreshCw, ClipboardList, TrendingDown } from 'lucide-react';
import { MOVEMENT_STYLES as MOVEMENT_TOKENS } from '@/lib/design-tokens';
import type { MovementType } from '@/types/inventory.types';

// --- Movement type visual config -------------------------
export const MOVEMENT_STYLES: Record<
  MovementType,
  { labelKey: string; icon: typeof Package; bg: string; text: string; dot: string }
> = {
  order_destock: {
    labelKey: 'filterOrders',
    icon: ClipboardList,
    bg: MOVEMENT_TOKENS.order_destock.bg,
    text: MOVEMENT_TOKENS.order_destock.text,
    dot: 'bg-status-info',
  },
  order_restock: {
    labelKey: 'filterRestock',
    icon: RefreshCw,
    bg: MOVEMENT_TOKENS.order_restock.bg,
    text: MOVEMENT_TOKENS.order_restock.text,
    dot: 'bg-status-success',
  },
  manual_add: {
    labelKey: 'filterAdditions',
    icon: Package,
    bg: MOVEMENT_TOKENS.manual_add.bg,
    text: MOVEMENT_TOKENS.manual_add.text,
    dot: 'bg-status-success',
  },
  manual_remove: {
    labelKey: 'filterWithdrawals',
    icon: Package,
    bg: MOVEMENT_TOKENS.manual_remove.bg,
    text: MOVEMENT_TOKENS.manual_remove.text,
    dot: 'bg-status-error',
  },
  adjustment: {
    labelKey: 'filterAdjustments',
    icon: RefreshCw,
    bg: MOVEMENT_TOKENS.adjustment.bg,
    text: MOVEMENT_TOKENS.adjustment.text,
    dot: 'bg-status-warning',
  },
  opening: {
    labelKey: 'filterOpening',
    icon: Truck,
    bg: MOVEMENT_TOKENS.opening.bg,
    text: MOVEMENT_TOKENS.opening.text,
    dot: 'bg-status-info',
  },
  physical_count: {
    labelKey: 'filterPhysicalCount',
    icon: ClipboardList,
    bg: MOVEMENT_TOKENS.physical_count.bg,
    text: MOVEMENT_TOKENS.physical_count.text,
    dot: 'bg-status-info',
  },
  loss: {
    labelKey: 'filterLoss',
    icon: TrendingDown,
    bg: MOVEMENT_TOKENS.loss.bg,
    text: MOVEMENT_TOKENS.loss.text,
    dot: 'bg-status-error',
  },
};
