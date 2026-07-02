import { AlertTriangle, Check, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Ingredient } from '@/types/inventory.types';
import type { BadgeTone } from '@/components/admin/shared/StatusBadge';

export function getStockBadge(
  ing: Ingredient,
  t: (key: string) => string,
): { label: string; tone: BadgeTone; icon: LucideIcon } {
  if (ing.current_stock <= 0) return { label: t('outOfStock'), tone: 'destructive', icon: XCircle };
  if (ing.current_stock <= ing.min_stock_alert)
    return { label: t('lowStock'), tone: 'warning', icon: AlertTriangle };
  return { label: t('stockOk'), tone: 'success', icon: Check };
}
