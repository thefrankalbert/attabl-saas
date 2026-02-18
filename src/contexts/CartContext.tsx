'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useTenant } from './TenantContext';
import { calculateOrderTotal } from '@/lib/pricing/tax';
import { logger } from '@/lib/logger';
import type { ServiceType, PricingBreakdown, CurrencyCode } from '@/types/admin.types';

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
  // ─── Phase 3: modifiers, notes, course ────────────────
  modifiers?: { name: string; price: number }[];
  customerNotes?: string;
  course?: string;
};

export type AppliedCoupon = {
  code: string;
  discountAmount: number;
  couponId: string;
} | null;

type CartContextType = {
  items: CartItem[];
  addToCart: (item: CartItem, restaurantId: string, skipConfirm?: boolean) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number; // backward compat = subtotal
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
  // ─── Phase 3: new state & methods ────────────────────
  appliedCoupon: AppliedCoupon;
  serviceType: ServiceType;
  roomNumber: string;
  deliveryAddress: string;
  subtotal: number;
  taxAmount: number;
  serviceChargeAmount: number;
  discountAmount: number;
  grandTotal: number;
  currencyCode: CurrencyCode;
  enableTax: boolean;
  enableServiceCharge: boolean;
  taxRate: number;
  serviceChargeRate: number;
  applyCoupon: (code: string, tenantId: string) => Promise<{ success: boolean; error?: string }>;
  removeCoupon: () => void;
  setServiceType: (type: ServiceType) => void;
  setRoomNumber: (num: string) => void;
  setDeliveryAddress: (addr: string) => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

// Génère une clé unique pour identifier un item du panier (inclut option/variante/modifiers)
const getCartItemKey = (item: CartItem): string => {
  let key = item.id;
  if (item.selectedOption) {
    key += `-opt-${item.selectedOption.name_fr}`;
  }
  if (item.selectedVariant) {
    key += `-var-${item.selectedVariant.name_fr}`;
  }
  if (item.modifiers && item.modifiers.length > 0) {
    const modKey = item.modifiers
      .map((m) => m.name)
      .sort()
      .join(',');
    key += `-mod-${modKey}`;
  }
  return key;
};

interface CartProviderProps {
  children: React.ReactNode;
}

export const CartProvider = ({ children }: CartProviderProps) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tenantId: _tenantId, slug: tenantSlug, tenant } = useTenant();

  const [items, setItems] = useState<CartItem[]>([]);
  const [currentRestaurantId, setCurrentRestaurantId] = useState<string | null>(null);
  const [lastVisitedMenuUrl, setLastVisitedMenuUrlState] = useState<string | null>(null);
  const [pendingAddToCart, setPendingAddToCart] = useState<{
    item: CartItem;
    restaurantId: string;
  } | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [isHydrated, setIsHydrated] = useState(false);

  // ─── Phase 3: new state ─────────────────────────────────
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon>(null);
  const [serviceType, setServiceTypeState] = useState<ServiceType>('dine_in');
  const [roomNumber, setRoomNumberState] = useState<string>('');
  const [deliveryAddress, setDeliveryAddressState] = useState<string>('');

  // Tenant config for pricing (from TenantContext)
  const currencyCode: CurrencyCode = (tenant?.currency as CurrencyCode) || 'XAF';
  const enableTax = tenant?.enable_tax ?? false;
  const enableServiceCharge = tenant?.enable_service_charge ?? false;
  const taxRate = tenant?.tax_rate ?? 0;
  const serviceChargeRate = tenant?.service_charge_rate ?? 0;

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
    const savedCoupon = localStorage.getItem(getStorageKey('cart_coupon'));
    const savedServiceType = localStorage.getItem(getStorageKey('cart_service_type'));
    const savedRoomNumber = localStorage.getItem(getStorageKey('cart_room_number'));
    const savedDeliveryAddress = localStorage.getItem(getStorageKey('cart_delivery_address'));

    if (savedCart) {
      try {
        setItems(JSON.parse(savedCart));
      } catch (e) {
        logger.error('Error parsing cart from localStorage', e);
      }
    }
    if (savedResto) setCurrentRestaurantId(savedResto);
    if (savedLastMenu) setLastVisitedMenuUrlState(savedLastMenu);
    if (savedNotes) setNotes(savedNotes);
    if (savedCoupon) {
      try {
        setAppliedCoupon(JSON.parse(savedCoupon));
      } catch (e) {
        logger.error('Error parsing coupon from localStorage', e);
      }
    }
    if (savedServiceType) setServiceTypeState(savedServiceType as ServiceType);
    if (savedRoomNumber) setRoomNumberState(savedRoomNumber);
    if (savedDeliveryAddress) setDeliveryAddressState(savedDeliveryAddress);

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

    // Phase 3: persist new state
    if (appliedCoupon) {
      localStorage.setItem(getStorageKey('cart_coupon'), JSON.stringify(appliedCoupon));
    } else {
      localStorage.removeItem(getStorageKey('cart_coupon'));
    }
    localStorage.setItem(getStorageKey('cart_service_type'), serviceType);
    if (roomNumber) {
      localStorage.setItem(getStorageKey('cart_room_number'), roomNumber);
    } else {
      localStorage.removeItem(getStorageKey('cart_room_number'));
    }
    if (deliveryAddress) {
      localStorage.setItem(getStorageKey('cart_delivery_address'), deliveryAddress);
    } else {
      localStorage.removeItem(getStorageKey('cart_delivery_address'));
    }
  }, [
    items,
    currentRestaurantId,
    lastVisitedMenuUrl,
    notes,
    appliedCoupon,
    serviceType,
    roomNumber,
    deliveryAddress,
    isHydrated,
    getStorageKey,
  ]);

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

        // Vérifier si l'item existe déjà (avec même option/variante/modifiers)
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
    setAppliedCoupon(null);
    setServiceTypeState('dine_in');
    setRoomNumberState('');
    setDeliveryAddressState('');
    localStorage.removeItem(getStorageKey('cart'));
    localStorage.removeItem(getStorageKey('cart_restaurant_id'));
    localStorage.removeItem(getStorageKey('cart_notes'));
    localStorage.removeItem(getStorageKey('cart_coupon'));
    localStorage.removeItem(getStorageKey('cart_service_type'));
    localStorage.removeItem(getStorageKey('cart_room_number'));
    localStorage.removeItem(getStorageKey('cart_delivery_address'));
  }, [getStorageKey]);

  const setLastVisitedMenuUrl = useCallback((url: string) => {
    setLastVisitedMenuUrlState(url);
  }, []);

  // ─── Phase 3: new methods ────────────────────────────────

  const setServiceType = useCallback((type: ServiceType) => {
    setServiceTypeState(type);
    // Clear room/address when switching away
    if (type !== 'room_service') setRoomNumberState('');
    if (type !== 'delivery') setDeliveryAddressState('');
  }, []);

  const setRoomNumber = useCallback((num: string) => {
    setRoomNumberState(num);
  }, []);

  const setDeliveryAddress = useCallback((addr: string) => {
    setDeliveryAddressState(addr);
  }, []);

  const applyCoupon = useCallback(
    async (code: string, tenantId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const response = await fetch('/api/coupons/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            tenantId,
            subtotal: items.reduce((acc, item) => {
              const modifiersTotal = item.modifiers?.reduce((s, m) => s + m.price, 0) || 0;
              return acc + (item.price + modifiersTotal) * item.quantity;
            }, 0),
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.valid) {
          return { success: false, error: data.error || 'Code promo invalide' };
        }

        setAppliedCoupon({
          code: code.toUpperCase().trim(),
          discountAmount: data.discountAmount,
          couponId: data.couponId,
        });

        return { success: true };
      } catch {
        return { success: false, error: 'Erreur de connexion. Veuillez réessayer.' };
      }
    },
    [items],
  );

  const removeCoupon = useCallback(() => {
    setAppliedCoupon(null);
  }, []);

  // ─── Derived pricing calculations ────────────────────────
  const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);

  // Subtotal: sum of (item price + modifiers) * quantity
  const subtotal = useMemo(() => {
    return items.reduce((acc, item) => {
      const modifiersTotal = item.modifiers?.reduce((s, m) => s + m.price, 0) || 0;
      return acc + (item.price + modifiersTotal) * item.quantity;
    }, 0);
  }, [items]);

  // Full pricing breakdown using calculateOrderTotal

  const pricing: PricingBreakdown = useMemo(() => {
    const discount = appliedCoupon?.discountAmount ?? 0;
    return calculateOrderTotal(
      subtotal,
      {
        enable_tax: enableTax,
        tax_rate: taxRate,
        enable_service_charge: enableServiceCharge,
        service_charge_rate: serviceChargeRate,
      },
      discount,
    );
  }, [subtotal, enableTax, taxRate, enableServiceCharge, serviceChargeRate, appliedCoupon]);

  // Backward compat: totalPrice = subtotal
  const totalPrice = subtotal;

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
        // Phase 3
        appliedCoupon,
        serviceType,
        roomNumber,
        deliveryAddress,
        subtotal: pricing.subtotal,
        taxAmount: pricing.taxAmount,
        serviceChargeAmount: pricing.serviceChargeAmount,
        discountAmount: pricing.discountAmount,
        grandTotal: pricing.total,
        currencyCode,
        enableTax,
        enableServiceCharge,
        taxRate,
        serviceChargeRate,
        applyCoupon,
        removeCoupon,
        setServiceType,
        setRoomNumber,
        setDeliveryAddress,
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
