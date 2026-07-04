import { useTranslations } from 'next-intl';
import { ArrowUpRight, ArrowDownRight, Package, Truck, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StockMovement } from '@/types/inventory.types';
import { MOVEMENT_STYLES } from './movement-styles';

interface StockHistoryMobileCardProps {
  movement: StockMovement;
  formatDate: (dateStr: string) => string;
}

export default function StockHistoryMobileCard({
  movement,
  formatDate,
}: StockHistoryMobileCardProps) {
  const t = useTranslations('stockHistory');
  const style = MOVEMENT_STYLES[movement.movement_type];
  const isPositive = movement.quantity > 0;
  const Icon = style?.icon || Package;
  return (
    <div className="bg-app-card border border-app-border/60 rounded-xl p-3.5 space-y-2.5">
      {/* Top: ingredient + quantity */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
              style?.bg,
            )}
          >
            <Icon className={cn('w-4 h-4', style?.text)} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-app-text truncate">
              {movement.ingredient?.name || '-'}
            </p>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[10px] font-semibold',
                  style?.text,
                )}
              >
                <span className={cn('w-1 h-1 rounded-full', style?.dot)} />
                {style?.labelKey ? t(style.labelKey) : ''}
              </span>
              {movement.ingredient?.unit && (
                <span className="text-[10px] text-app-text-muted">{movement.ingredient.unit}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isPositive ? (
            <ArrowUpRight className="w-3.5 h-3.5 text-status-success" />
          ) : (
            <ArrowDownRight className="w-3.5 h-3.5 text-status-error" />
          )}
          <span
            className={cn(
              'font-mono text-sm font-bold tabular-nums',
              isPositive ? 'text-status-success' : 'text-status-error',
            )}
          >
            {isPositive ? '+' : ''}
            {movement.quantity}
          </span>
        </div>
      </div>

      {/* Bottom: meta */}
      <div className="flex items-center justify-between text-[11px] text-app-text-muted pt-1 border-t border-app-border/40">
        <span>{formatDate(movement.created_at)}</span>
        <div className="flex items-center gap-2">
          {movement.author_name && (
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {movement.author_name}
            </span>
          )}
          {movement.supplier?.name && (
            <span className="flex items-center gap-1">
              <Truck className="w-3 h-3" />
              {movement.supplier.name}
            </span>
          )}
        </div>
      </div>

      {movement.notes && (
        <p className="text-[11px] text-app-text-muted italic truncate">{movement.notes}</p>
      )}
    </div>
  );
}
