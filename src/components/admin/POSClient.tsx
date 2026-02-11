'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
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
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/currency';
import PaymentModal from '@/components/admin/PaymentModal';
import type { Category, MenuItem, ServiceType, CurrencyCode } from '@/types/admin.types';

interface POSClientProps {
  tenantId: string;
}

type CartItem = MenuItem & {
  quantity: number;
  notes?: string;
};

const SERVICE_TYPES: { value: ServiceType; label: string; emoji: string }[] = [
  { value: 'dine_in', label: 'Sur place', emoji: '\ud83c\udf7d\ufe0f' },
  { value: 'takeaway', label: '\u00c0 emporter', emoji: '\ud83d\udce6' },
  { value: 'delivery', label: 'Livraison', emoji: '\ud83d\ude97' },
  { value: 'room_service', label: 'Room service', emoji: '\ud83c\udfe8' },
];

export default function POSClient({ tenantId }: POSClientProps) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState<CurrencyCode>('XAF');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [serviceType, setServiceType] = useState<ServiceType>('dine_in');
  const [roomNumber, setRoomNumber] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');

  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesText, setNotesText] = useState('');

  // Order Seq
  const [orderNumber, setOrderNumber] = useState(1);

  const { toast } = useToast();
  const supabase = createClient();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const today = new Date().toISOString().split('T')[0];
      const key = `pos_order_${tenantId}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.date === today) setOrderNumber(parsed.number || 1);
        } catch {
          /* ignore */
        }
      }
    }
  }, [tenantId]);

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

  const loadData = useCallback(async () => {
    try {
      const [catsRes, itemsRes, tenantRes] = await Promise.all([
        supabase.from('categories').select('*').eq('tenant_id', tenantId).order('display_order'),
        supabase
          .from('menu_items')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('is_available', true)
          .order('name'),
        supabase.from('tenants').select('currency').eq('id', tenantId).single(),
      ]);

      if (catsRes.data) setCategories(catsRes.data);
      if (itemsRes.data) setMenuItems(itemsRes.data);
      if (tenantRes.data?.currency) setCurrency(tenantRes.data.currency as CurrencyCode);
    } catch {
      toast({ title: 'Erreur de chargement', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [supabase, tenantId, toast]);

  useEffect(() => {
    loadData();
    // Realtime subscription could go here
  }, [loadData]);

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

  const handleOrder = async (status: 'pending' | 'delivered') => {
    if (cart.length === 0) return;

    try {
      // Create Order
      const orderPayload: {
        tenant_id: string;
        table_number: string;
        status: string;
        total_price: number;
        service_type: ServiceType;
        room_number?: string;
        delivery_address?: string;
      } = {
        tenant_id: tenantId,
        table_number: selectedTable || `CMD-${orderNumber}`,
        status: status,
        total_price: total,
        service_type: serviceType,
      };

      // Add room number for room_service
      if (serviceType === 'room_service' && roomNumber) {
        orderPayload.room_number = roomNumber;
      }

      // Add delivery address for delivery
      if (serviceType === 'delivery' && deliveryAddress) {
        orderPayload.delivery_address = deliveryAddress;
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select()
        .single();

      if (orderError) throw orderError;

      // Create Order Items
      const orderItems = cart.map((item) => ({
        tenant_id: tenantId,
        order_id: order.id,
        menu_item_id: item.id,
        quantity: item.quantity,
        price_at_order: item.price,
        notes: item.notes || null,
        name: item.name, // Redundant but useful for history if item deleted
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      toast({
        title: status === 'pending' ? 'Envoy\u00e9 en cuisine !' : 'Vente enregistr\u00e9e !',
      });
      updateOrderNumber(orderNumber + 1);
      setCart([]);
      setRoomNumber('');
      setDeliveryAddress('');
      if (showPaymentModal) setShowPaymentModal(false);
    } catch (err) {
      console.error(err);
      toast({ title: 'Erreur lors de la commande', variant: 'destructive' });
    }
  };

  if (loading) return <div className="p-8 text-center">Chargement du POS...</div>;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col lg:flex-row gap-4 lg:gap-6 overflow-hidden">
      {/* Products Section */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header Filters */}
        <div className="p-4 border-b border-gray-100 space-y-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Rechercher un produit..."
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
              Tout
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
                  className="text-left group bg-gray-50 hover:bg-white border border-gray-100 hover:border-primary/50 rounded-xl p-3 transition-all active:scale-95 flex flex-col h-full shadow-sm hover:shadow-md"
                >
                  <div className="aspect-square bg-white rounded-lg mb-3 flex items-center justify-center relative overflow-hidden">
                    {item.image_url ? (
                      <Image src={item.image_url} alt="" fill className="object-cover" />
                    ) : (
                      <Utensils className="w-8 h-8 text-gray-300" />
                    )}
                    {cart.find((c) => c.id === item.id) && (
                      <div className="absolute top-2 right-2 bg-primary text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-sm">
                        {cart.find((c) => c.id === item.id)?.quantity}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col">
                    <h3 className="font-semibold text-sm text-gray-900 leading-tight mb-1 line-clamp-2">
                      {item.name}
                    </h3>
                    <p className="text-xs font-bold text-gray-500 mt-auto">
                      {formatCurrency(item.price, currency)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <SearchX className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">Aucun r\u00e9sultat</p>
            </div>
          )}
        </div>
      </div>

      {/* Cart Section */}
      <div className="w-full lg:w-[400px] bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden shrink-0 max-h-[50vh] lg:max-h-none">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Panier</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono bg-gray-200 px-2 py-1 rounded text-gray-600">
              #{orderNumber}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-red-500"
              onClick={() => setCart([])}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Service Type Selection */}
        <div className="p-3 border-b border-gray-100 space-y-2">
          <div className="grid grid-cols-4 gap-1.5">
            {SERVICE_TYPES.map((st) => (
              <button
                key={st.value}
                type="button"
                onClick={() => setServiceType(st.value)}
                className={cn(
                  'flex flex-col items-center justify-center rounded-lg border p-2 transition-all text-center',
                  serviceType === st.value
                    ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary/20'
                    : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50',
                )}
              >
                <span className="text-base leading-none">{st.emoji}</span>
                <span className="text-[10px] font-medium mt-1 leading-tight">{st.label}</span>
              </button>
            ))}
          </div>

          {/* Room number input for room_service */}
          {serviceType === 'room_service' && (
            <Input
              placeholder="N\u00b0 de chambre..."
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              className="h-9 animate-in fade-in slide-in-from-top-1"
            />
          )}

          {/* Delivery address textarea for delivery */}
          {serviceType === 'delivery' && (
            <textarea
              placeholder="Adresse de livraison..."
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              className="w-full h-16 p-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-none bg-white animate-in fade-in slide-in-from-top-1"
            />
          )}

          {/* Table / Client input */}
          <Input
            placeholder="Table / Client..."
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
                  <p className="text-sm font-medium text-gray-900 line-clamp-1">{item.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-gray-500">{formatCurrency(item.price, currency)}</p>
                    {item.notes && (
                      <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100">
                        {item.notes}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm font-bold text-gray-900">
                  {formatCurrency(item.price * item.quantity, currency)}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-0.5 border border-gray-100">
                  <button
                    onClick={() => updateQuantity(item.id, -1)}
                    className="w-7 h-7 flex items-center justify-center hover:bg-white rounded shadow-sm text-gray-500 transition-all"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-8 text-center text-xs font-bold tabular-nums">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.id, 1)}
                    className="w-7 h-7 flex items-center justify-center hover:bg-white rounded shadow-sm text-gray-500 transition-all"
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
                  {item.notes ? 'Modifier' : 'Note cuisine'}
                </button>
              </div>
            </div>
          ))}
          {cart.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-300">
              <ShoppingBag className="w-12 h-12 mb-2 opacity-50" />
              <p className="text-sm">Panier vide</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 space-y-4">
          <div className="flex justify-between items-end">
            <span className="text-sm text-gray-500 font-medium">Total</span>
            <div className="text-right">
              <span className="text-2xl font-black text-gray-900">
                {formatCurrency(total, currency)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <Button
              variant="outline"
              className="h-12 border-gray-300 text-gray-600"
              disabled={cart.length === 0}
              onClick={() => handleOrder('pending')}
              title="Envoyer en cuisine"
            >
              <Printer className="w-5 h-5" />
            </Button>
            <Button
              className="col-span-3 h-12 text-base font-bold shadow-lg shadow-primary/20"
              disabled={cart.length === 0}
              onClick={() => setShowPaymentModal(true)}
            >
              Encaisser <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Note Modal */}
      {editingNotes && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm animate-in zoom-in-95">
            <h3 className="font-bold text-lg mb-4">Note pour la cuisine</h3>
            <textarea
              autoFocus
              className="w-full h-32 p-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-none bg-gray-50"
              placeholder="Ex: Sans oignon, bien cuit..."
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setEditingNotes(null)}>
                Annuler
              </Button>
              <Button onClick={saveNotes}>Enregistrer</Button>
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
        onSuccess={() => handleOrder('delivered')}
      />
    </div>
  );
}
