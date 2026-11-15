'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSessionState } from '@/hooks/useSessionState';
import { MAX_ITEM_QTY } from '@/lib/utils/cart-display';
import type { MenuItem } from '@/types/admin.types';

export type CartItem = MenuItem & {
  quantity: number;
  notes?: string;
  selectedModifiers?: Array<{ id?: string; name: string; price: number }>;
  selectedVariant?: { id?: string; name: string; price: number };
  cartKey?: string; // unique key when same item has different modifiers/variant
};

function getCartKey(
  item: CartItem | MenuItem,
  mods?: Array<{ id?: string; name: string; price: number }>,
  variant?: { id?: string; name: string; price: number },
) {
  let key = item.id;
  const resolvedVariant = variant || (item as CartItem).selectedVariant;
  if (resolvedVariant) {
    key = `${key}-var-${resolvedVariant.id ?? resolvedVariant.name}`;
  }
  const modifiers = mods || (item as CartItem).selectedModifiers;
  if (modifiers && modifiers.length > 0) {
    key = `${key}-mod-${modifiers
      .map((m) => m.id ?? m.name)
      .sort()
      .join(',')}`;
  }
  return key;
}

/**
 * Cart of the till: lines kept in sessionStorage, quantities, kitchen notes,
 * prices kept in line with the catalogue, and the cart total (split out of
 * usePOSData).
 */
export function usePosCartState(menuItems: MenuItem[]) {
  // --- Cart state -----------------------------------------
  const [cart, setCart] = useSessionState<CartItem[]>('pos:cart', []);

  // --- Note editing state ---------------------------------
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesText, setNotesText] = useState('');

  // --- Cart actions ---------------------------------------
  const addToCart = useCallback(
    (
      item: MenuItem,
      modifiers?: Array<{ id?: string; name: string; price: number }>,
      variant?: { id?: string; name: string; price: number },
    ) => {
      const key = getCartKey(item, modifiers, variant);
      const hasCustomization = (modifiers && modifiers.length > 0) || !!variant;
      setCart((prev) => {
        const existing = prev.find((i) => (i.cartKey || i.id) === key);
        if (existing)
          return prev.map((i) =>
            (i.cartKey || i.id) === key
              ? { ...i, quantity: Math.min(MAX_ITEM_QTY, i.quantity + 1) }
              : i,
          );
        return [
          ...prev,
          {
            ...item,
            // Override price with variant price when a variant is selected
            price: variant ? variant.price : item.price,
            quantity: 1,
            selectedModifiers: modifiers,
            selectedVariant: variant,
            cartKey: hasCustomization ? key : undefined,
          },
        ];
      });
    },
    [setCart],
  );

  // A cart kept in sessionStorage keeps the prices it was built with. When the
  // catalogue (re)loads, align them: the server bills the CURRENT price, and the
  // cashier must collect that, not an old one.
  useEffect(() => {
    if (menuItems.length === 0) return;
    setCart((prev) => {
      let changed = false;
      const next = prev.map((line) => {
        const mi = menuItems.find((m) => m.id === line.id);
        if (!mi) return line;
        const price = line.selectedVariant
          ? (mi.price_variants?.find((v) => v.id === line.selectedVariant?.id)?.price ?? line.price)
          : mi.price;
        // Options (supplements) are billed at their current price too.
        const modifiers = line.selectedModifiers?.map((sel) => {
          const current = mi.modifiers?.find((m) => m.id === sel.id)?.price;
          return current === undefined || current === sel.price ? sel : { ...sel, price: current };
        });
        const modifiersChanged = modifiers?.some((m, i) => m !== line.selectedModifiers?.[i]);
        if (price === line.price && !modifiersChanged) return line;
        changed = true;
        return {
          ...line,
          price,
          selectedVariant: line.selectedVariant ? { ...line.selectedVariant, price } : undefined,
          selectedModifiers: modifiers,
        };
      });
      return changed ? next : prev;
    });
  }, [menuItems, setCart]);

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prev) => {
      const item = prev.find((i) => (i.cartKey || i.id) === itemId);
      if (!item) return prev;
      const newQty = Math.min(MAX_ITEM_QTY, item.quantity + delta);
      const key = item.cartKey || item.id;
      if (newQty <= 0) return prev.filter((i) => (i.cartKey || i.id) !== key);
      return prev.map((i) => ((i.cartKey || i.id) === key ? { ...i, quantity: newQty } : i));
    });
  };

  const clearCart = () => setCart([]);

  // --- Note editing ---------------------------------------
  const saveNotes = () => {
    if (editingNotes) {
      setCart((prev) =>
        prev.map((i) => ((i.cartKey || i.id) === editingNotes ? { ...i, notes: notesText } : i)),
      );
      setEditingNotes(null);
      setNotesText('');
    }
  };

  // --- Total calculation ----------------------------------
  const total = useMemo(
    () =>
      cart.reduce((acc, item) => {
        const modCost = item.selectedModifiers?.reduce((s, m) => s + m.price, 0) || 0;
        return acc + (item.price + modCost) * item.quantity;
      }, 0),
    [cart],
  );

  return {
    cart,
    setCart,
    addToCart,
    updateQuantity,
    clearCart,
    editingNotes,
    setEditingNotes,
    notesText,
    setNotesText,
    saveNotes,
    total,
  };
}
