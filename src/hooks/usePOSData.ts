'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { useMenuItems, useCategories } from '@/hooks/queries';
import { useCreateOrder } from '@/hooks/mutations';
import { usePosExtras } from '@/hooks/usePosExtras';
import { usePosOccupancy } from '@/hooks/usePosOccupancy';
import { usePosCoupon } from '@/hooks/usePosCoupon';
import { usePosCartState } from '@/hooks/usePosCartState';
import {
  readOrderKey,
  writeOrderKey,
  clearComposeStorage,
  dropOrderKey,
} from '@/lib/pos/compose-storage';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useToast } from '@/components/ui/use-toast';
import { useSessionState } from '@/hooks/useSessionState';
import { calculateOrderTotal } from '@/lib/pricing/tax';
import { formatCurrency } from '@/lib/utils/currency';
import { fromMinorUnits } from '@/lib/utils/money';
import type { ServiceType, PricingBreakdown } from '@/types/admin.types';

export type { AppliedCoupon } from '@/hooks/usePosCoupon';
export type { CartItem } from '@/hooks/usePosCartState';
export type { POSSuggestion } from '@/hooks/usePosExtras';

export function usePOSData(tenantId: string) {
  const t = useTranslations('pos');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createOrder = useCreateOrder(tenantId);
  const {
    currency,
    taxConfig,
    enableCoupons,
    suggestions,
    zones,
    allTables,
    extrasLoaded,
    extrasError,
    retryExtras,
  } = usePosExtras(tenantId);
  const { occupiedTableNumbers, loadOccupancy } = usePosOccupancy(tenantId);

  // --- Filters --------------------------------------------
  const [searchQuery, setSearchQuery] = useSessionState('pos:searchQuery', '');
  const [selectedCategory, setSelectedCategory] = useSessionState<string>(
    'pos:selectedCategory',
    'all',
  );

  // --- Service type state ---------------------------------
  const [serviceType, setServiceType] = useSessionState<ServiceType>('pos:serviceType', 'dine_in');
  const [selectedTable, setSelectedTable] = useSessionState<string>('pos:selectedTable', '');
  const [roomNumber, setRoomNumber] = useSessionState<string>('pos:roomNumber', '');
  const [deliveryAddress, setDeliveryAddress] = useSessionState<string>('pos:deliveryAddress', '');

  // --- Order-level notes ----------------------------------
  const [orderNotes, setOrderNotes] = useSessionState<string>('pos:orderNotes', '');

  // --- Order number - initialize from localStorage --------
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

  // --- TanStack Query for menu items and categories -------
  const menuQuery = useMenuItems(tenantId, { availableOnly: true });
  const categoriesQuery = useCategories(tenantId);
  const { data: menuItems = [], isLoading: itemsLoading } = menuQuery;
  const { data: categories = [], isLoading: catsLoading } = categoriesQuery;
  const loading = itemsLoading || catsLoading;
  // A failed (or offline-paused) catalogue load used to open an empty till with
  // no message: the cashier believed the menu was empty.
  const menuUnavailable =
    menuQuery.isError ||
    categoriesQuery.isError ||
    (menuItems.length === 0 && menuQuery.fetchStatus === 'paused');
  const retryMenu = useCallback(() => {
    void menuQuery.refetch();
    void categoriesQuery.refetch();
  }, [menuQuery, categoriesQuery]);

  const {
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
  } = usePosCartState(menuItems);

  // --- Order number persistence ---------------------------
  const updateOrderNumber = useCallback(
    (newNum: number) => {
      setOrderNumber(newNum);
      try {
        localStorage.setItem(
          `pos_order_${tenantId}`,
          JSON.stringify({ date: new Date().toISOString().split('T')[0], number: newNum }),
        );
      } catch {
        // Quota full / private mode: the local counter is only a display aid.
      }
    },
    [tenantId],
  );

  // A table remembered from an earlier sale that is gone (deleted, deactivated)
  // must not be sent: forget it once the active tables are known.
  useEffect(() => {
    if (allTables.length === 0 || !selectedTable) return;
    if (!allTables.some((tbl) => tbl.table_number === selectedTable)) setSelectedTable('');
  }, [allTables, selectedTable, setSelectedTable]);

  // --- Realtime: menu_items updates ---------------------
  useRealtimeSubscription<Record<string, unknown>>({
    channelName: `pos_menu_${tenantId}`,
    table: 'menu_items',
    filter: `tenant_id=eq.${tenantId}`,
    event: 'UPDATE',
    onChange: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items', tenantId] });
    },
  });

  // --- Realtime: orders status changes (ready notifications) -
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

  // --- Filtered items -------------------------------------
  const searchFilteredItems = useMemo(() => {
    if (!searchQuery) return menuItems;
    const q = searchQuery.toLowerCase();
    return menuItems.filter((i) => i.name.toLowerCase().includes(q));
  }, [menuItems, searchQuery]);

  const filteredItems = useMemo(() => {
    if (selectedCategory === 'all') return searchFilteredItems;
    return searchFilteredItems.filter((i) => i.category_id === selectedCategory);
  }, [searchFilteredItems, selectedCategory]);

  const {
    couponCode,
    setCouponCode,
    appliedCoupon,
    setAppliedCoupon,
    couponLoading,
    couponError,
    setCouponError,
    validateCoupon,
    removeCoupon,
  } = usePosCoupon(total);

  // --- Pricing breakdown (subtotal + tax + service charge - discount) -
  const discountAmount = appliedCoupon?.discountAmount ?? 0;
  const pricing: PricingBreakdown = useMemo(
    () =>
      calculateOrderTotal(
        total,
        {
          tax_rate: taxConfig.taxRate,
          service_charge_rate: taxConfig.serviceChargeRate,
          enable_tax: taxConfig.enableTax,
          enable_service_charge: taxConfig.enableServiceCharge,
        },
        discountAmount,
        // Currency-aware rounding so the POS preview matches the server (audit H1).
        currency,
      ),
    [total, taxConfig, discountAmount, currency],
  );

  // --- Order creation -------------------------------------
  // In-flight send, NOT `createOrder.isPending`: a mutation paused by TanStack
  // stays pending forever and the guard used to swallow every later order once
  // the network dropped. A second tap gets the SAME promise (the payment screen
  // keeps its spinner) instead of returning at once.
  const inFlightRef = useRef<Promise<void> | null>(null);
  // Shown on the buttons: while one order is being sent, neither "send" nor
  // "pay" may start another (a payment could be swallowed by the running send).
  const [isSending, setIsSending] = useState(false);

  // Idempotency key of the composed order (OFF-11), read ONCE when the till
  // mounts: if the cashier came back while an earlier send was still in flight,
  // that send may clear sessionStorage afterwards; reading it lazily at the next
  // tap then minted a new key for the same cart - a second sale.
  const orderKeyRef = useRef<string | null>(null);
  useEffect(() => {
    orderKeyRef.current = readOrderKey();
  }, []);

  // Emptying the cart by hand starts a NEW order: forget the pending key, or a
  // different cart would replay it and be deduplicated onto the old order.
  const clearCartAndKey = useCallback(() => {
    clearCart();
    orderKeyRef.current = null;
    dropOrderKey();
  }, [clearCart]);

  // Every caisse order goes to the kitchen ('pending'), paid or not; payment is
  // recorded separately (payment_status). Returns once the order is settled, so
  // the payment screen keeps its spinner until the end. The success branch runs
  // after `await`, i.e. even if the till was left meanwhile.
  const handleOrder = async (options?: {
    onPaymentModalClose?: () => void;
    paymentData?: { paymentMethod: string; tipAmount: number };
    /** Called once the server has recorded the order (not when only queued offline). */
    onCreated?: () => void;
  }): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current;
    if (cart.length === 0) return;
    const run = submitOrder(options);
    inFlightRef.current = run;
    setIsSending(true);
    try {
      await run;
    } finally {
      inFlightRef.current = null;
      setIsSending(false);
    }
  };

  const submitOrder = async (options?: {
    onPaymentModalClose?: () => void;
    paymentData?: { paymentMethod: string; tipAmount: number };
    onCreated?: () => void;
  }): Promise<void> => {
    // Kept until success: a retry after a failure - or after leaving and coming
    // back to the till - REPLAYS the same key instead of creating a second order.
    let clientRequestId = orderKeyRef.current ?? readOrderKey();
    if (!clientRequestId) clientRequestId = crypto.randomUUID();
    orderKeyRef.current = clientRequestId;
    writeOrderKey(clientRequestId);
    const announcedTotal = pricing.total;

    try {
      const order = await createOrder.mutateAsync({
        clientRequestId,
        // Dine-in only, like room_number/delivery_address below: a table picked
        // in a previous dine-in compose must not tag a takeaway order. Tableless
        // orders store table_number NULL (the order_number is the ticket id).
        table_number: serviceType === 'dine_in' && selectedTable ? selectedTable : undefined,
        status: 'pending',
        total,
        service_type: serviceType,
        room_number: serviceType === 'room_service' && roomNumber ? roomNumber : undefined,
        delivery_address:
          serviceType === 'delivery' && deliveryAddress ? deliveryAddress : undefined,
        payment_method: options?.paymentData?.paymentMethod,
        tip_amount: options?.paymentData?.tipAmount,
        notes: orderNotes || undefined,
        coupon_code: appliedCoupon?.code,
        items: cart.map((item) => ({
          menu_item_id: item.id,
          quantity: item.quantity,
          customer_notes: item.notes || null,
          modifiers: item.selectedModifiers,
          selected_variant: item.selectedVariant?.name,
          selected_variant_id: item.selectedVariant?.id,
        })),
      });

      // The order exists (or is durably queued): the next compose is a
      // DIFFERENT order. Clear storage first - it works even when unmounted.
      clearComposeStorage();
      orderKeyRef.current = null;
      // Close the payment screen: leaving the keypad open with a zeroed total
      // reads as a stuck payment.
      options?.onPaymentModalClose?.();

      if (order.queued) {
        toast({ title: t('orderQueued'), description: t('orderQueuedDesc') });
      } else if (options?.paymentData && order.paid === false) {
        // The order went to the kitchen but the money is NOT booked: the cashier
        // must know before handing back change (audit caisse 2026-11-15).
        toast({
          title: t('paymentNotRecorded'),
          description: t('paymentNotRecordedDesc'),
          variant: 'destructive',
        });
        options?.onCreated?.();
      } else {
        toast({
          title: options?.paymentData ? t('saleRecorded') : t('sentToKitchen'),
          description: order.orderNumber ? `#${order.orderNumber}` : undefined,
        });
        options?.onCreated?.();
        // The server bills current prices: say so when it differs from the
        // amount the till announced (price changed while the till was open).
        const billed = fromMinorUnits(Number(order.total || 0), currency);
        if (order.total && Math.abs(billed - announcedTotal) >= 1) {
          toast({
            title: t('totalDiffers'),
            description: t('totalDiffersDesc', { amount: formatCurrency(billed, currency) }),
            variant: 'destructive',
          });
        }
      }

      updateOrderNumber(orderNumber + 1);
      setCart([]);
      setOrderNotes('');
      setRoomNumber('');
      setDeliveryAddress('');
      // The table is chosen per order: keeping it silently sent the next
      // dine-in sale to the previous table.
      setSelectedTable('');
      setAppliedCoupon(null);
      setCouponCode('');
      setCouponError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ title: t('orderError'), description: message, variant: 'destructive' });
    }
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
    menuUnavailable,
    retryMenu,
    extrasLoaded,
    extrasError,
    retryExtras,
    total,
    pricing,
    taxConfig,
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
    occupiedTableNumbers,
    refreshOccupancy: loadOccupancy,

    // Cart actions
    addToCart,
    updateQuantity,
    clearCart: clearCartAndKey,

    // Notes
    editingNotes,
    setEditingNotes,
    notesText,
    setNotesText,
    saveNotes,

    // Order-level notes
    orderNotes,
    setOrderNotes,

    // Coupon
    enableCoupons,
    couponCode,
    setCouponCode,
    appliedCoupon,
    couponLoading,
    couponError,
    validateCoupon,
    removeCoupon,

    // Order
    handleOrder,
    isSending,
  };
}
