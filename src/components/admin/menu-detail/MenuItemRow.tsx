'use client';

import { Utensils, Edit2, Check, X, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { MenuItem } from '@/types/admin.types';
import type { MenuDetailVM } from './use-menu-detail';

interface Props {
  vm: MenuDetailVM;
  item: MenuItem;
}

export function MenuItemRow({ vm, item }: Props) {
  const {
    t,
    editingPriceId,
    priceInputRef,
    editingPriceValue,
    setEditingPriceValue,
    saveInlinePrice,
    setEditingPriceId,
    startEditingPrice,
    openEditItemModal,
    setEditingModifiersItem,
    toggleItemAvailable,
  } = vm;

  return (
    <div className="flex items-center gap-3 p-3 bg-app-bg rounded-lg hover:bg-app-bg/80 transition-colors group/item">
      {item.image_url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={item.image_url}
          alt={item.name}
          className="w-8 h-8 rounded object-cover shrink-0"
        />
      ) : (
        <Utensils className="w-3.5 h-3.5 text-app-text-muted shrink-0" />
      )}
      <span className="flex-1 text-sm text-app-text font-medium break-words">{item.name}</span>

      {/* Inline price editing */}
      {editingPriceId === item.id ? (
        <Input
          ref={priceInputRef}
          type="number"
          className="w-24 text-sm font-bold text-app-text tabular-nums bg-app-card border border-app-border rounded px-2 py-0.5 text-right focus:outline-none focus:ring-1 focus:ring-accent/30 h-auto shadow-none"
          value={editingPriceValue}
          onChange={(e) => setEditingPriceValue(e.target.value)}
          onBlur={() => saveInlinePrice(item)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveInlinePrice(item);
            if (e.key === 'Escape') setEditingPriceId(null);
          }}
          min={0}
        />
      ) : (
        <Button
          variant="ghost"
          onClick={() => startEditingPrice(item)}
          className="text-sm font-bold text-app-text tabular-nums hover:text-accent hover:underline h-auto px-1 py-0"
          title={t('editItem')}
        >
          {t('priceFcfa', { count: item.price })}
        </Button>
      )}

      {(item.modifiers?.length ?? 0) > 0 && (
        <span className="text-[10px] font-bold text-accent bg-accent-muted px-1.5 py-0.5 rounded-full">
          {item.modifiers!.length} mod.
        </span>
      )}

      {/* Action buttons */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Edit"
        onClick={() => openEditItemModal(item)}
        title={t('editItem')}
      >
        <Edit2 className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Settings"
        onClick={(e) => {
          e.stopPropagation();
          setEditingModifiersItem(item);
        }}
        title={t('manageModifiers')}
      >
        <Settings2 className="w-4 h-4" />
      </Button>
      <Button
        variant="outline"
        onClick={() => toggleItemAvailable(item)}
        className={cn(
          'px-2 py-0.5 rounded-[0.625rem] text-xs font-medium h-auto',
          item.is_available
            ? 'border border-[var(--border)] text-[var(--success)]'
            : 'bg-app-bg text-app-text-secondary border-app-border',
        )}
      >
        {item.is_available ? (
          <>
            <Check className="w-3 h-3 inline mr-0.5" />
            {t('stockLabel')}
          </>
        ) : (
          <>
            <X className="w-3 h-3 inline mr-0.5" />
            {t('exhaustedLabel')}
          </>
        )}
      </Button>
    </div>
  );
}
