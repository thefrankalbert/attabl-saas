'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useMenuItems, useCategories } from '@/hooks/queries';
import { useCreateOrder } from '@/hooks/mutations';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useToast } from '@/components/ui/use-toast';
import { useSessionState } from '@/hooks/useSessionState';
import type { MenuItem, ServiceType, CurrencyCode, Zone, Table } from '@/types/admin.types';

export type CartItem = MenuItem & {
  quantity: number;
  notes?: string;
  selectedModifiers?: Array<{ name: string; price: number }>;
  selectedVariant?: { name: string; price: number };
  cartKey?: string; // unique key when same item has different modifiers/variant
};

export interface POSSuggestion {
  menu_item_id: string;
  suggested_item_id: string;
  suggested_item_name: string;
  suggestion_type: string;
  description: string | null;
}

function getCartKey(
  item: CartItem | MenuItem,
  mods?: Array<{ name: string; price: number }>,
  variant?: { name: string; price: number },
) {
  let key = item.id;
  const resolvedVariant = variant || (item as CartItem).selectedVariant;
  if (resolvedVariant) {
    key = `${key}-var-${resolvedVariant.name}`;
  }
  const modifiers = mods || (item as CartItem).selectedModifiers;
  if (modifiers && modifiers.length > 0) {
    key = `${key}-mod-${modifiers
      .map((m) => m.name)
      .sort()
      .join(',')}`;
  }
  return key;
}

export function usePOSData(tenantId: string) {
  const t = useTranslations('pos');
  const { toast } = useToast();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const createOrder = useCreateOrder(tenantId);

  // ─── Cart state ─────────────────────────────────────────
  const [cart, setCart] = useSessionState<CartItem[]>('pos:cart', []);

  // ─── Currency ───────────────────────────────────────────
  const [currency, setCurrency] = useState<CurrencyCode>('XAF');

  // ─── Filters ────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useSessionState('pos:searchQuery', '');
  const [selectedCategory, setSelectedCategory] = useSessionState<string>(
    'pos:selectedCategory',
    'all',
  );

  // ─── Service type state ─────────────────────────────────
  const [serviceType, setServiceType] = useSessionState<ServiceType>('pos:serviceType', 'dine_in');
  const [selectedTable, setSelectedTable] = useSessionState<string>('pos:selectedTable', '');
  const [roomNumber, setRoomNumber] = useSessionState<string>('pos:roomNumber', '');
  const [deliveryAddress, setDeliveryAddress] = useSessionState<string>('pos:deliveryAddress', '');

  // ─── Suggestions ────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<POSSuggestion[]>([]);

  // ─── Zones & Tables (for dine-in table picker) ────────
  const [zones, setZones] = useState<Zone[]>([]);
  const [allTables, setAllTables] = useState<Table[]>([]);

  // ─── Note editing state ─────────────────────────────────
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesText, setNotesText] = useState('');

  // ─── Order number - initialize from localStorage ────────
  const [orderNumber, setOrderNumber] = useState(() => {
    if (typeof window === 'undefined') return 1;
    try {
      const today = new Date().toISOString().split('T')[0];
      const stored = localStorage.getItem(`pos_order_${tenantId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.date === today) return parsed.number || 1;
      }
    } catch {
      /* ignore */
    }
    return 1;
  });

  // ─── TanStack Query for menu items and categories ───────
  const { data: menuItems = [], isLoading: itemsLoading } = useMenuItems(tenantId, {
    availableOnly: true,
  });
  const { data: categories = [], isLoading: catsLoading } = useCategories(tenantId);
  const loading = itemsLoading || catsLoading;

  // ─── Order number persistence ───────────────────────────
  const updateOrderNumber = useCallback(
    (newNum: number) => {
      setOrderNumber(newNum);
      const key = `pos_order_${tenantId}`;
      localStorage.setItem(
        key,
        JSON.stringify({
          date: new Date().toISOString().split('T')[0],
          number: newNum,
        }),
      );
    },
    [tenantId],
  );

  // ─── Load tenant currency and suggestions ───────────────
  const loadExtras = useCallback(async () => {
    try {
      const [tenantRes, suggestionsRes, venuesRes] = await Promise.all([
        supabase.from('tenants').select('currency').eq('id', tenantId).single(),
        supabase
          .from('item_suggestions')
          .select(
            'menu_item_id, suggested_item_id, suggestion_type, description, suggested_item:menu_items!item_suggestions_suggested_item_id_fkey(name)',
          )
          .eq('tenant_id', tenantId)
          .eq('is_active', true),
        supabase.from('venues').select('id').eq('tenant_id', tenantId).limit(1).single(),
      ]);

      if (tenantRes.data?.currency) setCurrency(tenantRes.data.currency as CurrencyCode);
      if (suggestionsRes.data) {
        setSuggestions(
          suggestionsRes.data.map((s: Record<string, unknown>) => ({
            menu_item_id: s.menu_item_id as string,
            suggested_item_id: s.suggested_item_id as string,
            suggested_item_name:
              ((s.suggested_item as Record<string, unknown>)?.name as string) || '',
            suggestion_type: s.suggestion_type as string,
            description: s.description as string | null,
          })),
        );
      }

      // Fetch zones and tables for the dine-in table picker
      if (venuesRes.data?.id) {
        const venueId = venuesRes.data.id as string;
        const { data: zonesData } = await supabase
          .from('zones')
          .select('*')
          .eq('venue_id', venueId)
          .order('display_order');

        if (zonesData && zonesData.length > 0) {
          setZones(zonesData as Zone[]);
          const zoneIds = zonesData.map((z: Record<string, unknown>) => z.id as string);
          const { data: tablesData } = await supabase
            .from('tables')
            .select('*')
            .in('zone_id', zoneIds)
            .eq('is_active', true)
            .order('table_number');

          if (tablesData) setAllTables(tablesData as Table[]);
        }
      }
    } catch {
      // Non-critical - suggestions, currency, and tables are optional enhancements
    }
  }, [supabase, tenantId]);

  // ─── Initial load of extras ────────────────────────────
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Async data fetch requires setState
    loadExtras();
  }, [loadExtras]);

  // ─── Realtime: menu_items updates ─────────────────────
  useRealtimeSubscription<Record<string, unknown>>({
    channelName: `pos_menu_${tenantId}`,
    table: 'menu_items',
    filter: `tenant_id=eq.${tenantId}`,
    event: 'UPDATE',
    onChange: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items', tenantId] });
    },
  });

  // ─── Realtime: orders status changes (ready notifications) ─
  useRealtimeSubscription<Record<string, unknown>>({
    channelName: `pos_orders_${tenantId}`,
    table: 'orders',
    filter: `tenant_id=eq.${tenantId}`,
    onUpdate: (record) => {
      if (record.status === 'ready') {
        toast({
          title: t('orderReady'),
          description: `#${String(record.order_number || record.table_number || '')}`,
        });
      }
    },
  });

  // ─── Filtered items ─────────────────────────────────────
  const searchFilteredItems = useMemo(() => {
    if (!searchQuery) return menuItems;
    const q = searchQuery.toLowerCase();
    return menuItems.filter((i) => i.name.toLowerCase().includes(q));
  }, [menuItems, searchQuery]);

  const filteredItems = useMemo(() => {
    if (selectedCategory === 'all') return searchFilteredItems;
    return searchFilteredItems.filter((i) => i.category_id === selectedCategory);
  }, [searchFilteredItems, selectedCategory]);

  // ─── Cart actions ───────────────────────────────────────
  const addToCart = useCallback(
    (
      item: MenuItem,
      modifiers?: Array<{ name: string; price: number }>,
      variant?: { name: string; price: number },
    ) => {
      const key = getCartKey(item, modifiers, variant);
      const hasCustomization = (modifiers && modifiers.length > 0) || !!variant;
      setCart((prev) => {
        const existing = prev.find((i) => (i.cartKey || i.id) === key);
        if (existing)
          return prev.map((i) =>
            (i.cartKey || i.id) === key ? { ...i, quantity: i.quantity + 1 } : i,
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

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prev) => {
      const item = prev.find((i) => (i.cartKey || i.id) === itemId);
      if (!item) return prev;
      const newQty = item.quantity + delta;
      const key = item.cartKey || item.id;
      if (newQty <= 0) return prev.filter((i) => (i.cartKey || i.id) !== key);
      return prev.map((i) => ((i.cartKey || i.id) === key ? { ...i, quantity: newQty } : i));
    });
  };

  const clearCart = () => setCart([]);

  // ─── Note editing ───────────────────────────────────────
  const saveNotes = () => {
    if (editingNotes) {
      setCart((prev) =>
        prev.map((i) => ((i.cartKey || i.id) === editingNotes ? { ...i, notes: notesText } : i)),
      );
      setEditingNotes(null);
      setNotesText('');
    }
  };

  // ─── Total calculation ──────────────────────────────────
  const total = useMemo(
    () =>
      cart.reduce((acc, item) => {
        const modCost = item.selectedModifiers?.reduce((s, m) => s + m.price, 0) || 0;
        return acc + (item.price + modCost) * item.quantity;
      }, 0),
    [cart],
  );

  // ─── Order creation ─────────────────────────────────────
  const handleOrder = (
    status: 'pending' | 'delivered',
    options?: {
      onPaymentModalClose?: () => void;
      paymentData?: { paymentMethod: string; tipAmount: number };
    },
  ) => {
    if (cart.length === 0) return;

    createOrder.mutate(
      {
        tenant_id: tenantId,
        table_number: selectedTable || `CMD-${orderNumber}`,
        status,
        total,
        service_type: serviceType,
        room_number: serviceType === 'room_service' && roomNumber ? roomNumber : undefined,
        delivery_address:
          serviceType === 'delivery' && deliveryAddress ? deliveryAddress : undefined,
        payment_method: options?.paymentData?.paymentMethod,
        tip_amount: options?.paymentData?.tipAmount,
        items: cart.map((item) => ({
          menu_item_id: item.id,
          quantity: item.quantity,
          customer_notes: item.notes || null,
          modifiers: item.selectedModifiers,
          selected_variant: item.selectedVariant?.name,
        })),
      },
      {
        onSuccess: (order: { orderNumber?: string }) => {
          const serverNum = order?.orderNumber;
          toast({
            title: status === 'pending' ? t('sentToKitchen') : t('saleRecorded'),
            description: serverNum ? `#${serverNum}` : undefined,
          });
          updateOrderNumber(orderNumber + 1);
          setCart([]);
          setRoomNumber('');
          setDeliveryAddress('');
          options?.onPaymentModalClose?.();
        },
        onError: () => {
          toast({ title: t('orderError'), variant: 'destructive' });
        },
      },
    );
  };

  return {
    // Data
    menuItems,
    categories,
    filteredItems,
    searchFilteredItems,
    cart,
    currency,
    suggestions,
    loading,
    total,
    orderNumber,

    // Filters
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,

    // Service type
    serviceType,
    setServiceType,
    selectedTable,
    setSelectedTable,
    roomNumber,
    setRoomNumber,
    deliveryAddress,
    setDeliveryAddress,

    // Zones & Tables
    zones,
    allTables,

    // Cart actions
    addToCart,
    updateQuantity,
    clearCart,

    // Notes
    editingNotes,
    setEditingNotes,
    notesText,
    setNotesText,
    saveNotes,

    // Order
    handleOrder,
  };
}
