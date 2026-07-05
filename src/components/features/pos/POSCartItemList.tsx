'use client';

import { Plus, Minus, Trash2, ShoppingBag, StickyNote } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSegmentTerms } from '@/hooks/useSegmentTerms';
import { formatCurrency } from '@/lib/utils/currency';
import { MAX_ITEM_QTY } from '@/lib/utils/cart-display';
import type { CurrencyCode } from '@/types/admin.types';
import type { CartItem } from '@/hooks/usePOSData';

interface POSCartItemListProps {
  cart: CartItem[];
  currency: CurrencyCode;
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onEditNotes: (itemId: string, currentNotes: string) => void;
}

export function POSCartItemList({
  cart,
  currency,
  onUpdateQuantity,
  onEditNotes,
}: POSCartItemListProps) {
  const t = useTranslations('pos');
  const tc = useTranslations('common');
  const seg = useSegmentTerms();

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      {cart.length > 0 ? (
        <div className="divide-y divide-app-border">
          {cart.map((item) => {
            const itemKey = item.cartKey || item.id;
            const modCost = item.selectedModifiers?.reduce((s, m) => s + m.price, 0) || 0;
            const unitTotal = item.price + modCost;
            return (
              <div key={itemKey} className="px-3 py-2">
                {/* Line 1: Name + line total */}
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-app-text leading-tight">{item.name}</p>
                    {/* Variant + Modifiers + Notes inline */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {item.selectedVariant && (
                        <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded border border-accent/20 font-medium">
                          {item.selectedVariant.name}
                        </span>
                      )}
                      {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                        <span className="text-[10px] text-app-text-muted font-medium">
                          +{item.selectedModifiers.map((m) => m.name).join(', ')}
                        </span>
                      )}
                      {item.notes && (
                        <span className="text-[10px] text-[var(--warning)] px-1.5 py-0.5 rounded border border-[var(--border)]">
                          {item.notes}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-app-text tabular-nums font-mono">
                      {formatCurrency(unitTotal * item.quantity, currency)}
                    </p>
                    {item.quantity > 1 && (
                      <p className="text-[10px] text-app-text-muted tabular-nums font-mono">
                        {item.quantity} &times; {formatCurrency(unitTotal, currency)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Line 2: Note (left) + quantity controls & remove (right) */}
                <div className="flex items-center justify-between gap-2 mt-1.5">
                  <Button
                    variant="ghost"
                    onClick={() => onEditNotes(itemKey, item.notes || '')}
                    className={cn(
                      'flex items-center gap-1 min-w-0 h-8 px-1.5 text-[11px] font-medium touch-manipulation',
                      item.notes
                        ? 'text-[var(--warning)] hover:text-[var(--warning)]'
                        : 'text-app-text-muted hover:text-app-text',
                    )}
                  >
                    <StickyNote className="w-3 h-3 shrink-0" />
                    <span className="truncate">{item.notes ? tc('edit') : seg.productionNote}</span>
                  </Button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex items-center gap-0.5 bg-app-elevated rounded-md border border-app-border">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('decreaseQty')}
                        onClick={() => onUpdateQuantity(itemKey, -1)}
                        className="w-8 h-8 rounded-l-md text-app-text-muted touch-manipulation"
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="min-w-7 px-1 text-center text-xs font-bold tabular-nums text-app-text">
                        {item.quantity}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('increaseQty')}
                        disabled={item.quantity >= MAX_ITEM_QTY}
                        onClick={() => onUpdateQuantity(itemKey, 1)}
                        className="w-8 h-8 rounded-r-md text-app-text-muted touch-manipulation disabled:opacity-40"
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={tc('delete')}
                      title={tc('delete')}
                      onClick={() => onUpdateQuantity(itemKey, -item.quantity)}
                      className="w-8 h-8 text-app-text-muted hover:text-status-error touch-manipulation"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-app-text-muted">
          <ShoppingBag className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm">{t('emptyCart')}</p>
        </div>
      )}
    </div>
  );
}
