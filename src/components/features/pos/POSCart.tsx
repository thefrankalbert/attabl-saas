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

  return (
    <>
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
            className="h-11 w-11 min-h-[48px] min-w-[48px] text-neutral-400 hover:text-red-500"
            onClick={onClearCart}
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
                  <p className="text-xs text-neutral-500">{formatCurrency(item.price, currency)}</p>
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
                  onClick={() => onUpdateQuantity(item.id, -1)}
                  className="w-9 h-9 flex items-center justify-center hover:bg-white rounded text-neutral-500 transition-all"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-8 text-center text-xs font-bold tabular-nums">
                  {item.quantity}
                </span>
                <button
                  onClick={() => onUpdateQuantity(item.id, 1)}
                  className="w-9 h-9 flex items-center justify-center hover:bg-white rounded text-neutral-500 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                onClick={() => onEditNotes(item.id, item.notes || '')}
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
                    if (suggestedItem) onAddToCart(suggestedItem);
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
            onClick={onPrintOrder}
            title={t('sentToKitchen')}
          >
            <Printer className="w-5 h-5" />
          </Button>
          <Button
            variant="lime"
            className="col-span-3 h-12 text-base"
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
