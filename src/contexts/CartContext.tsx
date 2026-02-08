'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useTenant } from './TenantContext';

// Définition des types
export type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string;
  restaurant_id?: string;
  name_en?: string;
  selectedOption?: { name_fr: string; name_en?: string };
  selectedVariant?: { name_fr: string; name_en?: string; price: number };
  category_id?: string;
  category_name?: string;
};

type CartContextType = {
  items: CartItem[];
  addToCart: (item: CartItem, restaurantId: string, skipConfirm?: boolean) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  currentRestaurantId: string | null;
  restaurantId: string | null;
  lastVisitedMenuUrl: string | null;
  setLastVisitedMenuUrl: (url: string) => void;
  pendingAddToCart: { item: CartItem; restaurantId: string } | null;
  confirmPendingAddToCart: () => void;
  cancelPendingAddToCart: () => void;
  notes: string;
  setNotes: (notes: string) => void;
  canAddToCart: (restaurantId: string) => boolean;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

// Génère une clé unique pour identifier un item du panier (inclut option/variante)
const getCartItemKey = (item: CartItem): string => {
  let key = item.id;
  if (item.selectedOption) {
    key += `-opt-${item.selectedOption.name_fr}`;
  }
  if (item.selectedVariant) {
    key += `-var-${item.selectedVariant.name_fr}`;
  }
  return key;
};

interface CartProviderProps {
  children: React.ReactNode;
}

export const CartProvider = ({ children }: CartProviderProps) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tenantId: _tenantId, slug: tenantSlug } = useTenant();

  const [items, setItems] = useState<CartItem[]>([]);
  const [currentRestaurantId, setCurrentRestaurantId] = useState<string | null>(null);
  const [lastVisitedMenuUrl, setLastVisitedMenuUrlState] = useState<string | null>(null);
  const [pendingAddToCart, setPendingAddToCart] = useState<{
    item: CartItem;
    restaurantId: string;
  } | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [isHydrated, setIsHydrated] = useState(false);

  // Clés localStorage avec namespace tenant
  const getStorageKey = useCallback(
    (key: string) => {
      return tenantSlug ? `attabl_${tenantSlug}_${key}` : `attabl_${key}`;
    },
    [tenantSlug],
  );

  // Chargement initial depuis localStorage
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const savedCart = localStorage.getItem(getStorageKey('cart'));
    const savedResto = localStorage.getItem(getStorageKey('cart_restaurant_id'));
    const savedLastMenu = localStorage.getItem(getStorageKey('last_menu'));
    const savedNotes = localStorage.getItem(getStorageKey('cart_notes'));

    if (savedCart) {
      try {
        setItems(JSON.parse(savedCart));
      } catch (e) {
        console.error('Error parsing cart from localStorage:', e);
      }
    }
    if (savedResto) setCurrentRestaurantId(savedResto);
    if (savedLastMenu) setLastVisitedMenuUrlState(savedLastMenu);
    if (savedNotes) setNotes(savedNotes);

    setIsHydrated(true);
  }, [getStorageKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Sauvegarde automatique
  useEffect(() => {
    if (!isHydrated) return;

    localStorage.setItem(getStorageKey('cart'), JSON.stringify(items));

    if (currentRestaurantId) {
      localStorage.setItem(getStorageKey('cart_restaurant_id'), currentRestaurantId);
    } else {
      localStorage.removeItem(getStorageKey('cart_restaurant_id'));
    }

    if (lastVisitedMenuUrl) {
      localStorage.setItem(getStorageKey('last_menu'), lastVisitedMenuUrl);
    } else {
      localStorage.removeItem(getStorageKey('last_menu'));
    }

    localStorage.setItem(getStorageKey('cart_notes'), notes);
  }, [items, currentRestaurantId, lastVisitedMenuUrl, notes, isHydrated, getStorageKey]);

  // SaaS V1 : 1 panier = 1 restaurant uniquement (pas de cross-venue)
  const canAddToCart = useCallback(
    (newRestaurantId: string): boolean => {
      if (items.length === 0) return true;
      return currentRestaurantId === newRestaurantId;
    },
    [items.length, currentRestaurantId],
  );

  const addToCart = useCallback(
    (newItem: CartItem, restaurantId: string, skipConfirm: boolean = false) => {
      // Si panier non vide et restaurant différent
      if (!canAddToCart(restaurantId) && !skipConfirm) {
        // Demander confirmation avant de vider le panier
        setPendingAddToCart({ item: newItem, restaurantId });
        return;
      }

      const shouldClearCart = !canAddToCart(restaurantId) && skipConfirm;

      if (items.length === 0 || shouldClearCart) {
        setCurrentRestaurantId(restaurantId);
      }

      setItems((prevItems) => {
        // Si on doit vider le panier (changement de restaurant confirmé)
        if (shouldClearCart) {
          return [{ ...newItem, quantity: 1, restaurant_id: restaurantId }];
        }

        // Vérifier si l'item existe déjà (avec même option/variante)
        const cartItemKey = getCartItemKey(newItem);
        const existingItem = prevItems.find((i) => getCartItemKey(i) === cartItemKey);

        if (existingItem) {
          return prevItems.map((i) =>
            getCartItemKey(i) === cartItemKey ? { ...i, quantity: i.quantity + 1 } : i,
          );
        }

        return [...prevItems, { ...newItem, quantity: 1, restaurant_id: restaurantId }];
      });
    },
    [canAddToCart, items.length],
  );

  const confirmPendingAddToCart = useCallback(() => {
    if (pendingAddToCart) {
      addToCart(pendingAddToCart.item, pendingAddToCart.restaurantId, true);
      setPendingAddToCart(null);
    }
  }, [pendingAddToCart, addToCart]);

  const cancelPendingAddToCart = useCallback(() => {
    setPendingAddToCart(null);
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setItems((prev) => {
      const newItems = prev.filter((i) => getCartItemKey(i) !== id && i.id !== id);
      if (newItems.length === 0) {
        setCurrentRestaurantId(null);
      }
      return newItems;
    });
  }, []);

  const updateQuantity = useCallback(
    (id: string, quantity: number) => {
      if (quantity < 1) {
        removeFromCart(id);
        return;
      }
      setItems((prev) =>
        prev.map((i) => (getCartItemKey(i) === id || i.id === id ? { ...i, quantity } : i)),
      );
    },
    [removeFromCart],
  );

  const clearCart = useCallback(() => {
    setItems([]);
    setCurrentRestaurantId(null);
    setNotes('');
    localStorage.removeItem(getStorageKey('cart'));
    localStorage.removeItem(getStorageKey('cart_restaurant_id'));
    localStorage.removeItem(getStorageKey('cart_notes'));
  }, [getStorageKey]);

  const setLastVisitedMenuUrl = useCallback((url: string) => {
    setLastVisitedMenuUrlState(url);
  }, []);

  const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);
  const totalPrice = items.reduce((acc, item) => acc + item.price * item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalItems,
        totalPrice,
        currentRestaurantId,
        restaurantId: currentRestaurantId,
        lastVisitedMenuUrl,
        setLastVisitedMenuUrl,
        pendingAddToCart,
        confirmPendingAddToCart,
        cancelPendingAddToCart,
        notes,
        setNotes,
        canAddToCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
