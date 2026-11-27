import { AlertTriangle, Check, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Ingredient } from '@/types/inventory.types';
import type { BadgeTone } from '@/components/admin/shared/StatusBadge';
import { getStockLevel } from '@/lib/inventory/stock-level';

export function getStockBadge(
  ing: Ingredient,
  t: (key: string) => string,
): { label: string; tone: BadgeTone; icon: LucideIcon } {
  const level = getStockLevel(ing);
  if (level === 'out') return { label: t('outOfStock'), tone: 'destructive', icon: XCircle };
  if (level === 'low') return { label: t('lowStock'), tone: 'warning', icon: AlertTriangle };
  return { label: t('stockOk'), tone: 'success', icon: Check };
}
