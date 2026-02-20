'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  Utensils,
  SearchX,
  ArrowRight,
  Printer,
  Lightbulb,
  UtensilsCrossed,
  Package,
  Truck,
  BellRing,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useMenuItems, useCategories } from '@/hooks/queries';
import { useCreateOrder } from '@/hooks/mutations';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/currency';
import PaymentModal from '@/components/admin/PaymentModal';
import type { MenuItem, ServiceType, CurrencyCode } from '@/types/admin.types';

interface POSClientProps {
  tenantId: string;
}

type CartItem = MenuItem & {
  quantity: number;
  notes?: string;
};

interface POSSuggestion {
  menu_item_id: string;
  suggested_item_id: string;
  suggested_item_name: string;
  suggestion_type: string;
  description: string | null;
}

export default function POSClient({ tenantId }: POSClientProps) {
  const t = useTranslations('pos');
  const tc = useTranslations('common');

  const SERVICE_TYPES: {
    value: ServiceType;
    label: string;
    icon: React.ReactNode;
  }[] = [
    {
      value: 'dine_in',
      label: t('serviceOnSite'),
      icon: <UtensilsCrossed className="w-4 h-4" />,
    },
    {
      value: 'takeaway',
      label: t('serviceTakeaway'),
      icon: <Package className="w-4 h-4" />,
    },
    {
      value: 'delivery',
      label: t('serviceDelivery'),
      icon: <Truck className="w-4 h-4" />,
    },
    {
      value: 'room_service',
      label: t('serviceRoomService'),
      icon: <BellRing className="w-4 h-4" />,
    },
  ];
  const [currentAdminUser, setCurrentAdminUser] = useState<{ id: string } | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [currency, setCurrency] = useState<CurrencyCode>('XAF');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [serviceType, setServiceType] = useState<ServiceType>('dine_in');
  const [roomNumber, setRoomNumber] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');

  // Suggestions
  const [suggestions, setSuggestions] = useState<POSSuggestion[]>([]);

  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesText, setNotesText] = useState('');

  // Order Seq — initialize from localStorage to avoid setState in effect
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

  const { toast } = useToast();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const createOrder = useCreateOrder(tenantId);

  // TanStack Query for menu items and categories
  const { data: menuItems = [], isLoading: itemsLoading } = useMenuItems(tenantId, {
    availableOnly: true,
  });
  const { data: categories = [], isLoading: catsLoading } = useCategories(tenantId);
  const loading = itemsLoading || catsLoading;

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

  // Load tenant currency and suggestions (not covered by query hooks)
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Async data fetch requires setState
    loadExtras();

    // Realtime: listen for menu_items availability changes
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

  const saveNotes = () => {
    if (editingNotes) {
      setCart((prev) => prev.map((i) => (i.id === editingNotes ? { ...i, notes: notesText } : i)));
      setEditingNotes(null);
      setNotesText('');
    }
  };

  const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  const handleOrder = (status: 'pending' | 'delivered') => {
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
          if (showPaymentModal) setShowPaymentModal(false);
        },
        onError: () => {
          toast({ title: t('orderError'), variant: 'destructive' });
        },
      },
    );
  };

  if (loading) return <div className="p-8 text-center">{t('loading')}</div>;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col lg:flex-row gap-4 lg:gap-6 overflow-hidden">
      {/* Products Section */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white rounded-xl border border-neutral-100 overflow-hidden">
        {/* Header Filters */}
        <div className="p-4 border-b border-neutral-100 space-y-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
              <Input
                placeholder={t('searchProduct')}
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <Button
              variant={selectedCategory === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('all')}
              className="rounded-full"
            >
              {tc('all')}
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat.id}
                variant={selectedCategory === cat.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(cat.id)}
                className="rounded-full whitespace-nowrap"
              >
                {cat.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {filteredItems.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className="text-left group bg-neutral-50 hover:bg-white border border-neutral-100 hover:border-primary/50 rounded-xl p-3 transition-all active:scale-95 flex flex-col h-full"
                >
                  <div className="aspect-square bg-white rounded-lg mb-3 flex items-center justify-center relative overflow-hidden">
                    {item.image_url ? (
                      <Image src={item.image_url} alt="" fill className="object-cover" />
                    ) : (
                      <Utensils className="w-8 h-8 text-neutral-300" />
                    )}
                    {cart.find((c) => c.id === item.id) && (
                      <div className="absolute top-2 right-2 bg-primary text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                        {cart.find((c) => c.id === item.id)?.quantity}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col">
                    <h3 className="font-semibold text-sm text-neutral-900 leading-tight mb-1 line-clamp-2">
                      {item.name}
                    </h3>
                    <p className="text-xs font-bold text-neutral-500 mt-auto">
                      {formatCurrency(item.price, currency)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-neutral-400">
              <SearchX className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">{t('noResults')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Cart Section */}
      <div className="w-full lg:w-[400px] bg-white rounded-xl border border-neutral-100 flex flex-col overflow-hidden shrink-0 max-h-[50vh] lg:max-h-none">
        <div className="p-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-neutral-500" />
            <h2 className="font-semibold text-neutral-900">{t('cart')}</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono bg-neutral-200 px-2 py-1 rounded text-neutral-600">
              #{orderNumber}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-neutral-400 hover:text-red-500"
              onClick={() => setCart([])}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Service Type Selection */}
        <div className="p-3 border-b border-neutral-100 space-y-2">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {SERVICE_TYPES.map((st) => (
              <button
                key={st.value}
                type="button"
                onClick={() => setServiceType(st.value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-3 py-2 transition-all whitespace-nowrap text-xs font-medium',
                  serviceType === st.value
                    ? 'bg-neutral-900 text-white'
                    : 'border border-neutral-200 text-neutral-600 hover:bg-neutral-50',
                )}
              >
                {st.icon}
                <span>{st.label}</span>
              </button>
            ))}
          </div>

          {/* Room number input for room_service */}
          {serviceType === 'room_service' && (
            <Input
              placeholder={t('roomNumberPlaceholder')}
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              className="h-9 animate-in fade-in slide-in-from-top-1"
            />
          )}

          {/* Delivery address textarea for delivery */}
          {serviceType === 'delivery' && (
            <textarea
              placeholder={t('deliveryAddressPlaceholder')}
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              className="w-full h-16 p-2 text-sm border border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-none bg-white animate-in fade-in slide-in-from-top-1"
            />
          )}

          {/* Table / Client input */}
          <Input
            placeholder={t('tableClientPlaceholder')}
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value)}
            className="h-9"
          />
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {cart.map((item) => (
            <div key={item.id} className="group">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <p className="text-sm font-medium text-neutral-900 line-clamp-1">{item.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-neutral-500">
                      {formatCurrency(item.price, currency)}
                    </p>
                    {item.notes && (
                      <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100">
                        {item.notes}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm font-bold text-neutral-900">
                  {formatCurrency(item.price * item.quantity, currency)}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 bg-neutral-50 rounded-lg p-0.5 border border-neutral-100">
                  <button
                    onClick={() => updateQuantity(item.id, -1)}
                    className="w-7 h-7 flex items-center justify-center hover:bg-white rounded text-neutral-500 transition-all"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-8 text-center text-xs font-bold tabular-nums">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.id, 1)}
                    className="w-7 h-7 flex items-center justify-center hover:bg-white rounded text-neutral-500 transition-all"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <button
                  onClick={() => {
                    setEditingNotes(item.id);
                    setNotesText(item.notes || '');
                  }}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  {item.notes ? tc('edit') : t('kitchenNote')}
                </button>
              </div>

              {/* Suggestion badge */}
              {suggestions
                .filter((s) => s.menu_item_id === item.id)
                .slice(0, 1)
                .map((s) => (
                  <button
                    key={s.suggested_item_id}
                    onClick={() => {
                      const suggestedItem = menuItems.find((mi) => mi.id === s.suggested_item_id);
                      if (suggestedItem) addToCart(suggestedItem);
                    }}
                    className="mt-1.5 flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-100 rounded-lg text-[10px] text-amber-700 font-medium hover:bg-amber-100 transition-colors w-full"
                  >
                    <Lightbulb className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      {s.suggestion_type === 'pairing'
                        ? t('suggestionPairing')
                        : s.suggestion_type === 'upsell'
                          ? t('suggestionUpsell')
                          : t('suggestionAlternative')}{' '}
                      : {s.suggested_item_name}
                    </span>
                  </button>
                ))}
            </div>
          ))}
          {cart.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-300">
              <ShoppingBag className="w-12 h-12 mb-2 opacity-50" />
              <p className="text-sm">{t('emptyCart')}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-neutral-50 border-t border-neutral-100 space-y-4">
          <div className="flex justify-between items-end">
            <span className="text-sm text-neutral-500 font-medium">{tc('total')}</span>
            <div className="text-right">
              <span className="text-2xl font-black text-neutral-900">
                {formatCurrency(total, currency)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <Button
              variant="outline"
              className="h-12 bg-neutral-900 text-white hover:bg-neutral-800 border-none rounded-xl"
              disabled={cart.length === 0}
              onClick={() => handleOrder('pending')}
              title={t('sentToKitchen')}
            >
              <Printer className="w-5 h-5" />
            </Button>
            <Button
              variant="lime"
              className="col-span-3 h-12 text-base"
              disabled={cart.length === 0}
              onClick={() => {
                if (!selectedTable) {
                  toast({ title: t('selectTableFirst'), variant: 'destructive' });
                  return;
                }
                setShowPaymentModal(true);
              }}
            >
              {t('checkout')} <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Note Modal */}
      {editingNotes && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm animate-in zoom-in-95">
            <h3 className="font-bold text-lg mb-4">{t('kitchenNoteTitle')}</h3>
            <textarea
              autoFocus
              className="w-full h-32 p-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-none bg-neutral-50"
              placeholder={t('kitchenNotePlaceholder')}
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" className="rounded-xl" onClick={() => setEditingNotes(null)}>
                {tc('cancel')}
              </Button>
              <Button
                className="bg-neutral-900 text-white hover:bg-neutral-800 rounded-xl"
                onClick={saveNotes}
              >
                {tc('save')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal Reuse */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        orderNumber={orderNumber}
        total={total}
        tableNumber={selectedTable || `CMD-${orderNumber}`}
        onSuccess={() => handleOrder('delivered')}
      />
    </div>
  );
}
