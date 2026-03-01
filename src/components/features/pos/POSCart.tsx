'use client';

import { useTranslations } from 'next-intl';
import {
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  ArrowRight,
  Printer,
  Lightbulb,
  UtensilsCrossed,
  Package,
  Truck,
  BellRing,
  Receipt,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/currency';
import type { MenuItem, ServiceType, CurrencyCode } from '@/types/admin.types';
import type { CartItem, POSSuggestion } from '@/hooks/usePOSData';

interface POSCartProps {
  cart: CartItem[];
  menuItems: MenuItem[];
  currency: CurrencyCode;
  suggestions: POSSuggestion[];
  total: number;
  orderNumber: number;

  // Service type
  serviceType: ServiceType;
  setServiceType: (type: ServiceType) => void;
  selectedTable: string;
  setSelectedTable: (table: string) => void;
  roomNumber: string;
  setRoomNumber: (room: string) => void;
  deliveryAddress: string;
  setDeliveryAddress: (address: string) => void;

  // Cart actions
  onAddToCart: (item: MenuItem) => void;
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onClearCart: () => void;

  // Notes
  onEditNotes: (itemId: string, currentNotes: string) => void;

  // Payment
  onPrintOrder: () => void;
  onCheckout: () => void;
}

export default function POSCart({
  cart,
  menuItems,
  currency,
  suggestions,
  total,
  orderNumber,
  serviceType,
  setServiceType,
  selectedTable,
  setSelectedTable,
  roomNumber,
  setRoomNumber,
  deliveryAddress,
  setDeliveryAddress,
  onAddToCart,
  onUpdateQuantity,
  onClearCart,
  onEditNotes,
  onPrintOrder,
  onCheckout,
}: POSCartProps) {
  const t = useTranslations('pos');
  const tc = useTranslations('common');

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const SERVICE_TYPES: {
    value: ServiceType;
    label: string;
    icon: React.ReactNode;
  }[] = [
    {
      value: 'dine_in',
      label: t('serviceOnSite'),
      icon: <UtensilsCrossed className="w-3.5 h-3.5" />,
    },
    {
      value: 'takeaway',
      label: t('serviceTakeaway'),
      icon: <Package className="w-3.5 h-3.5" />,
    },
    {
      value: 'delivery',
      label: t('serviceDelivery'),
      icon: <Truck className="w-3.5 h-3.5" />,
    },
    {
      value: 'room_service',
      label: t('serviceRoomService'),
      icon: <BellRing className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <>
      {/* ━━━ HEADER ━━━ */}
      <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between bg-neutral-900">
        <div className="flex items-center gap-2.5">
          <Receipt className="w-4 h-4 text-neutral-400" />
          <span className="font-bold text-sm text-white tracking-tight">{t('cart')}</span>
          <span className="text-xs font-mono bg-white/10 text-neutral-300 px-2 py-0.5 rounded">
            #{orderNumber}
          </span>
        </div>
        <button
          onClick={onClearCart}
          className="h-10 w-10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-neutral-500 hover:text-red-400 hover:bg-white/[0.06] transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* ━━━ SERVICE TYPE ━━━ */}
      <div className="p-3 border-b border-neutral-100 space-y-2">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {SERVICE_TYPES.map((st) => (
            <button
              key={st.value}
              type="button"
              onClick={() => setServiceType(st.value)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-2 min-h-[44px] transition-all whitespace-nowrap text-xs font-medium',
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

        {serviceType === 'room_service' && (
          <Input
            placeholder={t('roomNumberPlaceholder')}
            value={roomNumber}
            onChange={(e) => setRoomNumber(e.target.value)}
            className="h-9 animate-in fade-in slide-in-from-top-1"
          />
        )}

        {serviceType === 'delivery' && (
          <textarea
            placeholder={t('deliveryAddressPlaceholder')}
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
            className="w-full h-16 p-2 text-sm border border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-none bg-white animate-in fade-in slide-in-from-top-1"
          />
        )}

        <Input
          placeholder={t('tableClientPlaceholder')}
          value={selectedTable}
          onChange={(e) => setSelectedTable(e.target.value)}
          className="h-9"
        />
      </div>

      {/* ━━━ CART ITEMS — Receipt style ━━━ */}
      <div className="flex-1 overflow-y-auto">
        {cart.length > 0 ? (
          <div className="divide-y divide-neutral-100">
            {cart.map((item) => {
              const itemKey = item.cartKey || item.id;
              const modCost = item.selectedModifiers?.reduce((s, m) => s + m.price, 0) || 0;
              const unitTotal = item.price + modCost;
              return (
                <div key={itemKey} className="px-4 py-3">
                  {/* Line 1: Name + line total */}
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 leading-tight line-clamp-1">
                        {item.name}
                      </p>
                      {/* Modifiers + Notes inline */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                          <span className="text-[10px] text-neutral-500 font-medium">
                            +{item.selectedModifiers.map((m) => m.name).join(', ')}
                          </span>
                        )}
                        {item.notes && (
                          <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100">
                            {item.notes}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-neutral-900 tabular-nums font-mono">
                        {formatCurrency(unitTotal * item.quantity, currency)}
                      </p>
                      {item.quantity > 1 && (
                        <p className="text-[10px] text-neutral-400 tabular-nums font-mono">
                          {item.quantity} &times; {formatCurrency(unitTotal, currency)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Line 2: Quantity controls + Note button */}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-0.5 bg-neutral-50 rounded-lg border border-neutral-100">
                      <button
                        onClick={() => onUpdateQuantity(itemKey, -1)}
                        className="w-10 h-10 flex items-center justify-center hover:bg-white rounded-l-lg text-neutral-500 transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center text-xs font-bold tabular-nums text-neutral-700">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => onUpdateQuantity(itemKey, 1)}
                        className="w-10 h-10 flex items-center justify-center hover:bg-white rounded-r-lg text-neutral-500 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={() => onEditNotes(itemKey, item.notes || '')}
                      className="text-xs text-neutral-400 hover:text-neutral-600 font-medium min-h-[44px] px-2 flex items-center transition-colors"
                    >
                      {item.notes ? tc('edit') : t('kitchenNote')}
                    </button>
                  </div>

                  {/* Suggestion */}
                  {suggestions
                    .filter((s) => s.menu_item_id === item.id)
                    .slice(0, 1)
                    .map((s) => (
                      <button
                        key={s.suggested_item_id}
                        onClick={() => {
                          const suggestedItem = menuItems.find(
                            (mi) => mi.id === s.suggested_item_id,
                          );
                          if (suggestedItem) onAddToCart(suggestedItem);
                        }}
                        className="mt-2 flex items-center gap-1.5 px-2.5 py-2 min-h-[44px] bg-neutral-50 border border-neutral-100 rounded-lg text-[10px] text-neutral-500 font-medium hover:bg-neutral-100 transition-colors w-full"
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
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-300">
            <ShoppingBag className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">{t('emptyCart')}</p>
          </div>
        )}
      </div>

      {/* ━━━ FOOTER ━━━ */}
      <div className="border-t border-neutral-200 bg-neutral-900 p-4 space-y-3">
        {/* Total */}
        <div className="flex justify-between items-baseline">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-neutral-400 font-medium uppercase tracking-wide">
              {tc('total')}
            </span>
            {totalItems > 0 && (
              <span className="text-xs text-neutral-500">
                ({totalItems} {t('itemsCount')})
              </span>
            )}
          </div>
          <span className="text-3xl font-bold text-white tabular-nums tracking-tight">
            {formatCurrency(total, currency)}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-7 gap-2">
          <Button
            variant="outline"
            className="col-span-2 h-12 bg-white/10 text-white hover:bg-white/20 border-white/10 rounded-xl gap-2"
            disabled={cart.length === 0}
            onClick={onPrintOrder}
            title={t('sentToKitchen')}
          >
            <Printer className="w-5 h-5" />
            <span className="hidden lg:inline text-xs">{t('printShort')}</span>
          </Button>
          <Button
            variant="default"
            className="col-span-5 h-12 text-base font-bold"
            disabled={cart.length === 0}
            onClick={onCheckout}
          >
            {t('checkout')} <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </div>
    </>
  );
}
