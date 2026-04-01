'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { X, Utensils, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/currency';
import type { MenuItem, ItemPriceVariant, ItemModifier, CurrencyCode } from '@/types/admin.types';

interface POSItemCustomizerProps {
  item: MenuItem;
  currency: CurrencyCode;
  onAdd: (
    item: MenuItem,
    modifiers: Array<{ name: string; price: number }>,
    variant?: { name: string; price: number },
  ) => void;
  onClose: () => void;
}

export default function POSItemCustomizer({
  item,
  currency,
  onAdd,
  onClose,
}: POSItemCustomizerProps) {
  const t = useTranslations('pos');
  const tc = useTranslations('common');

  const variants = useMemo(() => item.price_variants ?? [], [item.price_variants]);
  const modifiers = useMemo(
    () => (item.modifiers ?? []).filter((m) => m.is_available),
    [item.modifiers],
  );

  // ─── Variant selection ──────────────────────────────────
  const defaultVariant = variants.find((v) => v.is_default) || variants[0];
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    variants.length > 0 ? (defaultVariant?.id ?? null) : null,
  );

  // ─── Modifier selection (toggle on/off) ─────────────────
  const [selectedModifierIds, setSelectedModifierIds] = useState<Set<string>>(new Set());

  const toggleModifier = (modifierId: string) => {
    setSelectedModifierIds((prev) => {
      const next = new Set(prev);
      if (next.has(modifierId)) {
        next.delete(modifierId);
      } else {
        next.add(modifierId);
      }
      return next;
    });
  };

  // ─── Price calculation ──────────────────────────────────
  const selectedVariant: ItemPriceVariant | undefined = variants.find(
    (v) => v.id === selectedVariantId,
  );

  const selectedMods: ItemModifier[] = modifiers.filter((m) => selectedModifierIds.has(m.id));

  const basePrice = selectedVariant ? selectedVariant.price : item.price;
  const modifiersTotal = selectedMods.reduce((sum, m) => sum + m.price, 0);
  const totalPrice = basePrice + modifiersTotal;

  // ─── Sorted variants and modifiers ──────────────────────
  const sortedVariants = useMemo(
    () => [...variants].sort((a, b) => a.display_order - b.display_order),
    [variants],
  );

  const sortedModifiers = useMemo(
    () => [...modifiers].sort((a, b) => a.display_order - b.display_order),
    [modifiers],
  );

  // ─── Handle add to cart ─────────────────────────────────
  const handleAdd = () => {
    const modifierPayload = selectedMods.map((m) => ({
      name: m.name,
      price: m.price,
    }));

    const variantPayload = selectedVariant
      ? { name: selectedVariant.variant_name_fr, price: selectedVariant.price }
      : undefined;

    onAdd(item, modifierPayload, variantPayload);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-app-card w-full sm:max-w-sm sm:rounded-xl border border-app-border animate-in slide-in-from-bottom-4 sm:zoom-in-95 max-h-[85dvh] flex flex-col rounded-t-xl">
        {/* ━━━ Header ━━━ */}
        <div className="flex items-start gap-3 p-4 border-b border-app-border">
          <div className="h-14 w-14 shrink-0 bg-app-elevated rounded-lg flex items-center justify-center relative overflow-hidden">
            {item.image_url ? (
              <Image src={item.image_url} alt="" fill className="object-cover" />
            ) : (
              <Utensils className="w-5 h-5 text-app-text-muted/40" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm text-app-text leading-tight">{item.name}</h3>
            {item.description && (
              <p className="text-xs text-app-text-muted mt-0.5 line-clamp-2">{item.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-app-text-muted hover:text-app-text hover:bg-app-hover transition-colors shrink-0 touch-manipulation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ━━━ Scrollable content ━━━ */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* ─── Price Variants ──────────────────────────── */}
          {sortedVariants.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-app-text-muted uppercase tracking-wider mb-2 block">
                {t('selectVariant')}
              </label>
              <div className="flex flex-wrap gap-2">
                {sortedVariants.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => setSelectedVariantId(variant.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 min-h-[44px] text-sm font-medium transition-all border',
                      selectedVariantId === variant.id
                        ? 'bg-accent text-accent-text border-accent'
                        : 'border-app-border text-app-text-secondary hover:bg-app-hover hover:border-accent/30',
                    )}
                  >
                    <span>{variant.variant_name_fr}</span>
                    <span className="text-xs opacity-80">
                      {formatCurrency(variant.price, currency)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── Modifiers ──────────────────────────────── */}
          {sortedModifiers.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-app-text-muted uppercase tracking-wider mb-2 block">
                {t('selectModifiers')}
              </label>
              <div className="space-y-1.5">
                {sortedModifiers.map((modifier) => {
                  const isSelected = selectedModifierIds.has(modifier.id);
                  return (
                    <button
                      key={modifier.id}
                      type="button"
                      onClick={() => toggleModifier(modifier.id)}
                      className={cn(
                        'w-full flex items-center justify-between rounded-lg px-3 py-2.5 min-h-[44px] text-sm transition-all border',
                        isSelected
                          ? 'bg-accent/10 text-app-text border-accent/40'
                          : 'border-app-border text-app-text-secondary hover:bg-app-hover',
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={cn(
                            'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                            isSelected
                              ? 'bg-accent border-accent'
                              : 'border-app-border bg-transparent',
                          )}
                        >
                          {isSelected && <Plus className="w-3 h-3 text-accent-text rotate-45" />}
                        </div>
                        <span className="font-medium">{modifier.name}</span>
                      </div>
                      <span className="text-xs text-app-text-muted font-mono">
                        +{formatCurrency(modifier.price, currency)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ━━━ Footer ━━━ */}
        <div className="border-t border-app-border p-4 space-y-3">
          {/* Price summary */}
          <div className="flex justify-between items-baseline">
            <span className="text-xs text-app-text-muted font-medium uppercase tracking-wide">
              {tc('total')}
            </span>
            <span className="text-xl font-bold text-app-text tabular-nums tracking-tight">
              {formatCurrency(totalPrice, currency)}
            </span>
          </div>

          {/* Add button */}
          <Button
            variant="default"
            className="w-full h-12 text-sm font-bold rounded-xl"
            onClick={handleAdd}
          >
            {t('addToCart')}
          </Button>
        </div>
      </div>
    </div>
  );
}
