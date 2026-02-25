'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useMenuItems, useCategories } from '@/hooks/queries';
import { useCreateOrder } from '@/hooks/mutations';
import { useToast } from '@/components/ui/use-toast';
import type { MenuItem, ServiceType, CurrencyCode } from '@/types/admin.types';

export type CartItem = MenuItem & {
  quantity: number;
  notes?: string;
};

export interface POSSuggestion {
  menu_item_id: string;
  suggested_item_id: string;
  suggested_item_name: string;
  suggestion_type: string;
  description: string | null;
}

export function usePOSData(tenantId: string) {
  const t = useTranslations('pos');
  const { toast } = useToast();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const createOrder = useCreateOrder(tenantId);

  // ─── Current admin user ─────────────────────────────────
  const [currentAdminUser, setCurrentAdminUser] = useState<{ id: string } | null>(null);

  // ─── Cart state ─────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);

  // ─── Currency ───────────────────────────────────────────
  const [currency, setCurrency] = useState<CurrencyCode>('XAF');

  // ─── Filters ────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // ─── Service type state ─────────────────────────────────
  const [serviceType, setServiceType] = useState<ServiceType>('dine_in');
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [roomNumber, setRoomNumber] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');

  // ─── Suggestions ────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<POSSuggestion[]>([]);

  // ─── Note editing state ─────────────────────────────────
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesText, setNotesText] = useState('');

  // ─── Order number — initialize from localStorage ────────
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

  // ─── Fetch current admin user ───────────────────────────
  useEffect(() => {
    async function fetchCurrentUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('admin_users')
          .select('id')
          .eq('user_id', user.id)
          .single();
        if (data) setCurrentAdminUser(data);
      }
    }
    fetchCurrentUser();
  }, [supabase]);

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
      const [tenantRes, suggestionsRes] = await Promise.all([
        supabase.from('tenants').select('currency').eq('id', tenantId).single(),
        supabase
          .from('item_suggestions')
          .select(
            'menu_item_id, suggested_item_id, suggestion_type, description, suggested_item:menu_items!item_suggestions_suggested_item_id_fkey(name)',
          )
          .eq('tenant_id', tenantId)
          .eq('is_active', true),
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
    } catch {
      // Non-critical — suggestions and currency are optional enhancements
    }
  }, [supabase, tenantId]);

  // ─── Realtime subscription for menu_items updates ───────
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Async data fetch requires setState
    loadExtras();

    const channel = supabase
      .channel('pos_menu_realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'menu_items',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['menu-items', tenantId] });
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [loadExtras, supabase, tenantId, queryClient]);

  // ─── Filtered items ─────────────────────────────────────
  const filteredItems = useMemo(() => {
    let items = menuItems;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(q));
    }
    if (selectedCategory !== 'all') {
      items = items.filter((i) => i.category_id === selectedCategory);
    }
    return items;
  }, [menuItems, searchQuery, selectedCategory]);

  // ─── Cart actions ───────────────────────────────────────
  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing)
        return prev.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prev) => {
      const item = prev.find((i) => i.id === itemId);
      if (!item) return prev;
      const newQty = item.quantity + delta;
      if (newQty <= 0) return prev.filter((i) => i.id !== itemId);
      return prev.map((i) => (i.id === itemId ? { ...i, quantity: newQty } : i));
    });
  };

  const clearCart = () => setCart([]);

  // ─── Note editing ───────────────────────────────────────
  const saveNotes = () => {
    if (editingNotes) {
      setCart((prev) => prev.map((i) => (i.id === editingNotes ? { ...i, notes: notesText } : i)));
      setEditingNotes(null);
      setNotesText('');
    }
  };

  // ─── Total calculation ──────────────────────────────────
  const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  // ─── Order creation ─────────────────────────────────────
  const handleOrder = (
    status: 'pending' | 'delivered',
    options?: { onPaymentModalClose?: () => void },
  ) => {
    if (cart.length === 0) return;

    createOrder.mutate(
      {
        tenant_id: tenantId,
        table_number: selectedTable || `CMD-${orderNumber}`,
        status,
        total_price: total,
        service_type: serviceType,
        cashier_id: currentAdminUser?.id ?? null,
        server_id: currentAdminUser?.id ?? null,
        room_number: serviceType === 'room_service' && roomNumber ? roomNumber : undefined,
        delivery_address:
          serviceType === 'delivery' && deliveryAddress ? deliveryAddress : undefined,
        items: cart.map((item) => ({
          menu_item_id: item.id,
          quantity: item.quantity,
          price_at_order: item.price,
          notes: item.notes || null,
          name: item.name,
        })),
      },
      {
        onSuccess: () => {
          toast({
            title: status === 'pending' ? t('sentToKitchen') : t('saleRecorded'),
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
