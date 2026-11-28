'use client';

import { useState, useMemo, useEffect, useRef, useId } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useTranslations, useLocale } from 'next-intl';
import Image from 'next/image';
import { X, Utensils, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/currency';
import type { MenuItem, ItemPriceVariant, ItemModifier, CurrencyCode } from '@/types/admin.types';

interface POSItemCustomizerProps {
  item: MenuItem;
  currency: CurrencyCode;
  onAdd: (
    item: MenuItem,
    modifiers: Array<{ id?: string; name: string; price: number }>,
    variant?: { id?: string; name: string; price: number },
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
  const locale = useLocale();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  const variantName = (v: ItemPriceVariant) =>
    locale.startsWith('en') ? (v.variant_name_en ?? v.variant_name_fr) : v.variant_name_fr;

  // Focus stays inside the dialog while open and returns on close; Escape closes.
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const variants = useMemo(() => item.price_variants ?? [], [item.price_variants]);
  const modifiers = useMemo(
    () => (item.modifiers ?? []).filter((m) => m.is_available),
    [item.modifiers],
  );

  // --- Variant selection ----------------------------------
  const defaultVariant = variants.find((v) => v.is_default) || variants[0];
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    variants.length > 0 ? (defaultVariant?.id ?? null) : null,
  );

  // --- Modifier selection (toggle on/off) -----------------
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

  // --- Price calculation ----------------------------------
  const selectedVariant: ItemPriceVariant | undefined = variants.find(
    (v) => v.id === selectedVariantId,
  );

  const selectedMods: ItemModifier[] = modifiers.filter((m) => selectedModifierIds.has(m.id));

  const basePrice = selectedVariant ? selectedVariant.price : item.price;
  const modifiersTotal = selectedMods.reduce((sum, m) => sum + m.price, 0);
  const totalPrice = basePrice + modifiersTotal;

  // --- Sorted variants and modifiers ----------------------
  const sortedVariants = useMemo(
    () => variants.toSorted((a, b) => a.display_order - b.display_order),
    [variants],
  );

  const sortedModifiers = useMemo(
    () => modifiers.toSorted((a, b) => a.display_order - b.display_order),
    [modifiers],
  );

  // --- Handle add to cart ---------------------------------
  const handleAdd = () => {
    const modifierPayload = selectedMods.map((m) => ({
      id: m.id,
      name: m.name,
      price: m.price,
    }));

    const variantPayload = selectedVariant
      ? {
          id: selectedVariant.id,
          // The kitchen ticket keeps the reference (French) name; the server
          // resolves the variant by id anyway.
          name: selectedVariant.variant_name_fr,
          price: selectedVariant.price,
        }
      : undefined;

    onAdd(item, modifierPayload, variantPayload);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-app-card w-full sm:max-w-sm sm:rounded-xl border border-app-border animate-in slide-in-from-bottom-4 sm:zoom-in-95 max-h-[85dvh] flex flex-col rounded-t-xl outline-none"
      >
        {/* --- Header --- */}
        <div className="flex items-start gap-3 p-4 border-b border-app-border">
          <div className="h-14 w-14 shrink-0 bg-app-elevated rounded-lg flex items-center justify-center relative overflow-hidden">
            {item.image_url ? (
              <Image src={item.image_url} alt="" fill sizes="56px" className="object-cover" />
            ) : (
              <Utensils className="w-5 h-5 text-app-text-muted/40" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 id={titleId} className="font-bold text-sm text-app-text leading-tight">
              {item.name}
            </h3>
            {item.description && (
              <p className="text-xs text-app-text-muted mt-0.5 line-clamp-2">{item.description}</p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={tc('aria.close')}
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-lg text-app-text-muted hover:text-app-text shrink-0 touch-manipulation"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* --- Scrollable content --- */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* --- Price Variants ---------------------------- */}
          {sortedVariants.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-app-text-muted uppercase tracking-wider mb-2 block">
                {t('selectVariant')}
              </p>
              <div className="flex flex-wrap gap-2">
                {sortedVariants.map((variant) => (
                  <Button
                    key={variant.id}
                    type="button"
                    variant={selectedVariantId === variant.id ? 'default' : 'outline'}
                    aria-pressed={selectedVariantId === variant.id}
                    onClick={() => setSelectedVariantId(variant.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 min-h-[44px] text-sm font-medium h-auto',
                      selectedVariantId === variant.id
                        ? 'bg-accent text-accent-text border-accent'
                        : 'border-app-border text-app-text-secondary hover:bg-app-hover hover:border-accent/30',
                    )}
                  >
                    <span>{variantName(variant)}</span>
                    <span className="text-xs opacity-80">
                      {formatCurrency(variant.price, currency)}
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* --- Modifiers -------------------------------- */}
          {sortedModifiers.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-app-text-muted uppercase tracking-wider mb-2 block">
                {t('selectModifiers')}
              </p>
              <div className="space-y-1.5">
                {sortedModifiers.map((modifier) => {
                  const isSelected = selectedModifierIds.has(modifier.id);
                  return (
                    <Button
                      key={modifier.id}
                      type="button"
                      variant="outline"
                      aria-pressed={isSelected}
                      onClick={() => toggleModifier(modifier.id)}
                      className={cn(
                        'w-full flex items-center justify-between rounded-lg px-3 py-2.5 min-h-[44px] text-sm h-auto',
                        isSelected
                          ? 'bg-accent/10 text-app-text border-accent/40'
                          : 'border-app-border text-app-text-secondary hover:bg-app-hover',
                      )}
                    >
                      <span className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                            isSelected
                              ? 'bg-accent border-accent'
                              : 'border-app-border bg-transparent',
                          )}
                        >
                          {isSelected && <Check className="w-3 h-3 text-accent-text" />}
                        </span>
                        <span className="font-medium">{modifier.name}</span>
                      </span>
                      <span className="text-xs text-app-text-muted font-mono">
                        +{formatCurrency(modifier.price, currency)}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* --- Footer --- */}
        <div className="border-t border-app-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
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
