'use client';

import { useTranslations } from 'next-intl';
import { TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/admin/shared/StatusBadge';
import { formatCurrency } from '@/lib/utils/currency';
import { INGREDIENT_UNITS } from '@/types/inventory.types';
import type { Ingredient } from '@/types/inventory.types';
import type { CurrencyCode } from '@/types/admin.types';
import { getStockBadge } from './stock-badge';

interface InventoryMobileCardProps {
  ing: Ingredient;
  currency: string;
  onAdjust: (ing: Ingredient) => void;
  onEdit: (ing: Ingredient) => void;
  onLoss: (ing: Ingredient) => void;
}

export default function InventoryMobileCard({
  ing,
  currency,
  onAdjust,
  onEdit,
  onLoss,
}: InventoryMobileCardProps) {
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  const badge = getStockBadge(ing, t);
  const unitLabel = INGREDIENT_UNITS[ing.unit]?.labelShort || ing.unit;
  return (
    <div className="border-b border-app-border py-3 px-4">
      {/* Row 1: Name + Status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-app-text break-words">{ing.name}</p>
          {ing.category && <p className="text-xs text-app-text-secondary">{ing.category}</p>}
        </div>
        <StatusBadge tone={badge.tone} icon={badge.icon} className="shrink-0">
          {badge.label}
        </StatusBadge>
      </div>

      {/* Row 2: Stock + Cost */}
      <div className="flex items-center justify-between text-sm mt-2">
        <span className="text-app-text-secondary">
          {t('currentStock')}:{' '}
          <span className="font-mono font-bold text-app-text">
            {ing.current_stock.toFixed(ing.unit === 'pièce' || ing.unit === 'bouteille' ? 0 : 2)}
          </span>{' '}
          {unitLabel}
        </span>
        <span className="text-app-text-secondary">
          {formatCurrency(ing.cost_per_unit, currency as CurrencyCode)}/{unitLabel}
        </span>
      </div>

      {/* Row 3: Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAdjust(ing)}
          className="text-xs min-h-[44px]"
        >
          +/-
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onLoss(ing)}
          className="text-xs min-h-[44px] gap-1"
          aria-label={t('declareLoss')}
        >
          <TrendingDown className="w-3.5 h-3.5" />
          {t('declareLoss')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(ing)}
          className="text-xs min-h-[44px]"
        >
          {tc('edit')}
        </Button>
      </div>
    </div>
  );
}
