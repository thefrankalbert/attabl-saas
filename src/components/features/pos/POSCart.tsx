'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';

import {
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  ArrowRight,
  Printer,
  UtensilsCrossed,
  Package,
  Truck,
  BellRing,
  Receipt,
  LayoutGrid,
  MapPin,
  StickyNote,
  Tag,
  X,
  Loader2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useSegmentTerms } from '@/hooks/useSegmentTerms';
import { formatCurrency } from '@/lib/utils/currency';
import type { ServiceType, CurrencyCode, Zone, Table, PricingBreakdown } from '@/types/admin.types';
import type { CartItem, AppliedCoupon } from '@/hooks/usePOSData';

interface POSCartProps {
  cart: CartItem[];
  currency: CurrencyCode;
  pricing: PricingBreakdown;
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

  // Zones & Tables (for dine-in table picker)
  zones: Zone[];
  allTables: Table[];

  // Cart actions
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onClearCart: () => void;

  // Notes
  onEditNotes: (itemId: string, currentNotes: string) => void;

  // Order-level notes
  orderNotes: string;
  setOrderNotes: (notes: string) => void;

  // Coupon
  enableCoupons: boolean;
  couponCode: string;
  setCouponCode: (code: string) => void;
  appliedCoupon: AppliedCoupon | null;
  couponLoading: boolean;
  couponError: string;
  onValidateCoupon: (code: string) => void;
  onRemoveCoupon: () => void;

  // Payment
  onPrintOrder: () => void;
  onCheckout: () => void;
}

export default function POSCart({
  cart,
  currency,
  pricing,
  orderNumber,
  serviceType,
  setServiceType,
  selectedTable,
  setSelectedTable,
  roomNumber,
  setRoomNumber,
  deliveryAddress,
  setDeliveryAddress,
  zones,
  allTables,
  onUpdateQuantity,
  onClearCart,
  onEditNotes,
  orderNotes,
  setOrderNotes,
  enableCoupons,
  couponCode,
  setCouponCode,
  appliedCoupon,
  couponLoading,
  couponError,
  onValidateCoupon,
  onRemoveCoupon,
  onPrintOrder,
  onCheckout,
}: POSCartProps) {
  const t = useTranslations('pos');
  const tc = useTranslations('common');
  const seg = useSegmentTerms();

  // ─── Order notes toggle ─────────────────────────────────
  const [showOrderNotes, setShowOrderNotes] = useState(false);

  // ─── Table Picker Dialog ────────────────────────────────
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [pickerZoneId, setPickerZoneId] = useState<string | null>(null);

  // Initialize picker zone when dialog opens
  useEffect(() => {
    if (showTablePicker && zones.length > 0 && !pickerZoneId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync init when dialog opens
      setPickerZoneId(zones[0].id);
    }
  }, [showTablePicker, zones, pickerZoneId]);

  // Tables for the selected zone in the picker
  const pickerTables = useMemo(() => {
    if (!pickerZoneId) return [];
    return allTables
      .filter((tbl) => tbl.zone_id === pickerZoneId)
      .sort((a, b) => a.table_number.localeCompare(b.table_number, undefined, { numeric: true }));
  }, [pickerZoneId, allTables]);

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const SERVICE_TYPES = useMemo<{ value: ServiceType; label: string; icon: React.ReactNode }[]>(
    () => [
      {
        value: 'dine_in',
        label: t('serviceOnSite'),
        icon: <UtensilsCrossed className="w-3.5 h-3.5" />,
      },
      { value: 'takeaway', label: t('serviceTakeaway'), icon: <Package className="w-3.5 h-3.5" /> },
      { value: 'delivery', label: t('serviceDelivery'), icon: <Truck className="w-3.5 h-3.5" /> },
      {
        value: 'room_service',
        label: t('serviceRoomService'),
        icon: <BellRing className="w-3.5 h-3.5" />,
      },
    ],
    [t],
  );

  return (
    <>
      {/* ━━━ HEADER ━━━ */}
      <div className="px-4 py-3 border-b border-app-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Receipt className="w-4 h-4 text-app-text-muted" />
          <span className="font-bold text-sm text-app-text tracking-tight">{t('cart')}</span>
          <span
            className="text-xs font-mono bg-app-elevated text-app-text-muted px-1.5 py-0.5 rounded"
            title={t('cart')}
          >
            {String(orderNumber).padStart(2, '0')}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (cart.length === 0 || window.confirm(t('confirmClearCart'))) {
              onClearCart();
            }
          }}
          title={tc('delete')}
          className="w-9 h-9 text-app-text-muted hover:text-status-error"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* ━━━ SCROLLABLE AREA (service type + cart items) ━━━ */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* ━━━ SERVICE TYPE ━━━ */}
        <div className="p-3 border-b border-app-border space-y-2">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {SERVICE_TYPES.map((st) => (
              <button
                key={st.value}
                type="button"
                onClick={() => setServiceType(st.value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-2 min-h-[44px] transition-all whitespace-nowrap text-xs font-medium',
                  serviceType === st.value
                    ? 'bg-accent text-accent-text'
                    : 'border border-app-border text-app-text-secondary hover:bg-app-hover',
                )}
              >
                {st.icon}
                <span>{st.label}</span>
              </button>
            ))}
          </div>

          {serviceType === 'dine_in' && (
            <button
              type="button"
              onClick={() => setShowTablePicker(true)}
              className="flex items-center gap-2 h-9 px-3 rounded-lg border border-app-border bg-app-elevated text-app-text-secondary text-sm hover:bg-app-hover hover:text-app-text transition-colors animate-in fade-in slide-in-from-top-1"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{selectedTable || t('selectTable')}</span>
            </button>
          )}

          {serviceType === 'room_service' && (
            <Input
              placeholder={t('roomNumberPlaceholder')}
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              className="h-9 animate-in fade-in slide-in-from-top-1"
            />
          )}

          {serviceType === 'delivery' && (
            <Textarea
              placeholder={t('deliveryAddressPlaceholder')}
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              className="w-full h-16 p-2 text-sm border border-app-border rounded-lg bg-app-elevated text-app-text placeholder:text-app-text-muted outline-none focus:border-accent/40 resize-none animate-in fade-in slide-in-from-top-1"
            />
          )}
        </div>

        {/* ━━━ CART ITEMS - Receipt style ━━━ */}
        <div>
          {cart.length > 0 ? (
            <div className="divide-y divide-app-border">
              {cart.map((item) => {
                const itemKey = item.cartKey || item.id;
                const modCost = item.selectedModifiers?.reduce((s, m) => s + m.price, 0) || 0;
                const unitTotal = item.price + modCost;
                return (
                  <div key={itemKey} className="px-3 py-2">
                    {/* Line 1: Name + line total */}
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-app-text leading-tight">
                          {item.name}
                        </p>
                        {/* Variant + Modifiers + Notes inline */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {item.selectedVariant && (
                            <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded border border-accent/20 font-medium">
                              {item.selectedVariant.name}
                            </span>
                          )}
                          {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                            <span className="text-[10px] text-app-text-muted font-medium">
                              +{item.selectedModifiers.map((m) => m.name).join(', ')}
                            </span>
                          )}
                          {item.notes && (
                            <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20">
                              {item.notes}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-app-text tabular-nums font-mono">
                          {formatCurrency(unitTotal * item.quantity, currency)}
                        </p>
                        {item.quantity > 1 && (
                          <p className="text-[10px] text-app-text-muted tabular-nums font-mono">
                            {item.quantity} &times; {formatCurrency(unitTotal, currency)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Line 2: Quantity controls + Note button */}
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-0.5 bg-app-elevated rounded-md border border-app-border">
                        <button
                          onClick={() => onUpdateQuantity(itemKey, -1)}
                          className="w-8 h-8 flex items-center justify-center hover:bg-app-hover rounded-l-md text-app-text-muted transition-colors touch-manipulation"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-7 text-center text-xs font-bold tabular-nums text-app-text">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => onUpdateQuantity(itemKey, 1)}
                          className="w-8 h-8 flex items-center justify-center hover:bg-app-hover rounded-r-md text-app-text-muted transition-colors touch-manipulation"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <button
                        onClick={() => onEditNotes(itemKey, item.notes || '')}
                        className="text-[11px] text-app-text-muted hover:text-app-text font-medium h-8 px-2 flex items-center transition-colors touch-manipulation"
                      >
                        {item.notes ? tc('edit') : seg.productionNote}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-app-text-muted">
              <ShoppingBag className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">{t('emptyCart')}</p>
            </div>
          )}
        </div>
      </div>

      {/* ━━━ FOOTER ━━━ */}
      <div className="border-t border-app-border px-4 py-3 space-y-2">
        {/* Order note + Coupon on same line */}
        <div className="flex items-center gap-2">
          {/* Order note toggle */}
          <button
            type="button"
            onClick={() => setShowOrderNotes((prev) => !prev)}
            className={cn(
              'flex items-center gap-1 text-[11px] font-medium transition-colors shrink-0',
              orderNotes ? 'text-amber-500' : 'text-app-text-muted hover:text-app-text-secondary',
            )}
          >
            <StickyNote className="w-3 h-3" />
            <span>{t('orderNote')}</span>
            {orderNotes && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
          </button>

          {/* Coupon inline (only if enabled in tenant settings) */}
          {enableCoupons && (
            <div className="flex-1 min-w-0">
              {appliedCoupon ? (
                <div className="flex items-center gap-1 animate-in fade-in">
                  <div className="flex items-center gap-1 bg-green-500/10 text-green-600 border border-green-500/20 rounded-md px-2 py-1 text-[10px] font-medium min-w-0">
                    <Tag className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{appliedCoupon.code}</span>
                    <span className="text-green-500 shrink-0">
                      -
                      {appliedCoupon.discount_type === 'percentage'
                        ? `${appliedCoupon.discount_value}%`
                        : formatCurrency(appliedCoupon.discountAmount, currency)}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onRemoveCoupon}
                    className="w-6 h-6 text-app-text-muted hover:text-status-error shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <Input
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder={t('couponPlaceholder') || 'Code promo'}
                    className="h-7 text-[10px] flex-1 min-w-0"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && couponCode.trim()) onValidateCoupon(couponCode);
                    }}
                    disabled={couponLoading || cart.length === 0}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[10px] shrink-0"
                    disabled={!couponCode.trim() || couponLoading || cart.length === 0}
                    onClick={() => onValidateCoupon(couponCode)}
                  >
                    {couponLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Tag className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Expandable notes textarea */}
        {showOrderNotes && (
          <Textarea
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            maxLength={500}
            placeholder={t('orderNotePlaceholder')}
            rows={2}
            className="w-full p-2 text-xs border border-app-border rounded-lg bg-app-elevated text-app-text placeholder:text-app-text-muted outline-none focus:border-accent/40 resize-none animate-in fade-in slide-in-from-top-1"
          />
        )}

        {/* Coupon error */}
        {enableCoupons && couponError && (
          <p className="text-[10px] text-status-error font-medium animate-in fade-in">
            {couponError}
          </p>
        )}

        {/* Pricing breakdown */}
        {(pricing.taxAmount > 0 ||
          pricing.serviceChargeAmount > 0 ||
          pricing.discountAmount > 0) && (
          <div className="space-y-1">
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] text-app-text-muted">
                {tc('subtotal')} ({totalItems} {t('itemsCount')})
              </span>
              <span className="text-xs font-medium text-app-text-secondary tabular-nums font-mono">
                {formatCurrency(pricing.subtotal, currency)}
              </span>
            </div>
            {pricing.discountAmount > 0 && (
              <div className="flex justify-between items-baseline">
                <span className="text-[11px] text-green-600">{tc('discount') || 'Remise'}</span>
                <span className="text-xs font-medium text-green-600 tabular-nums font-mono">
                  -{formatCurrency(pricing.discountAmount, currency)}
                </span>
              </div>
            )}
            {pricing.taxAmount > 0 && (
              <div className="flex justify-between items-baseline">
                <span className="text-[11px] text-app-text-muted">{tc('tax')}</span>
                <span className="text-xs font-medium text-app-text-secondary tabular-nums font-mono">
                  {formatCurrency(pricing.taxAmount, currency)}
                </span>
              </div>
            )}
            {pricing.serviceChargeAmount > 0 && (
              <div className="flex justify-between items-baseline">
                <span className="text-[11px] text-app-text-muted">{tc('service')}</span>
                <span className="text-xs font-medium text-app-text-secondary tabular-nums font-mono">
                  {formatCurrency(pricing.serviceChargeAmount, currency)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Total */}
        <div className="flex justify-between items-baseline">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-app-text-muted font-medium uppercase tracking-wide">
              {tc('total')}
            </span>
            {totalItems > 0 &&
              pricing.taxAmount <= 0 &&
              pricing.serviceChargeAmount <= 0 &&
              pricing.discountAmount <= 0 && (
                <span className="text-[10px] text-app-text-muted">
                  ({totalItems} {t('itemsCount')})
                </span>
              )}
          </div>
          <span className="text-2xl font-bold text-app-text tabular-nums tracking-tight">
            {formatCurrency(pricing.total, currency)}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-7 gap-2">
          <Button
            variant="outline"
            className="col-span-2 h-10 rounded-xl gap-1.5"
            disabled={cart.length === 0}
            onClick={onPrintOrder}
            title={seg.sentToProduction}
          >
            <Printer className="w-4 h-4" />
            <span className="hidden lg:inline text-xs">{t('printShort')}</span>
          </Button>
          <Button
            variant="default"
            className="col-span-5 h-10 text-sm font-bold"
            disabled={cart.length === 0}
            onClick={onCheckout}
          >
            {t('checkout')} <ArrowRight className="ml-1.5 w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* ━━━ TABLE PICKER DIALOG ━━━ */}
      <Dialog
        open={showTablePicker}
        onOpenChange={(open) => {
          setShowTablePicker(open);
          if (!open) setPickerZoneId(null);
        }}
      >
        <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0">
          <DialogHeader className="px-6 py-4 border-b border-app-border">
            <DialogTitle>{t('selectTable')}</DialogTitle>
          </DialogHeader>

          <div className="p-4">
            {zones.length > 0 ? (
              <div className="flex gap-4 h-72">
                {/* Zone Column */}
                <div className="w-36 flex flex-col shrink-0">
                  <Label className="text-xs font-semibold text-app-text-muted uppercase tracking-wider mb-2 text-center">
                    Zone
                  </Label>
                  <div className="flex-1 overflow-y-auto space-y-1">
                    {zones.map((zone) => (
                      <button
                        key={zone.id}
                        type="button"
                        onClick={() => setPickerZoneId(zone.id)}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2',
                          pickerZoneId === zone.id
                            ? 'bg-accent text-accent-text font-medium'
                            : 'text-app-text-secondary hover:bg-app-hover',
                        )}
                      >
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{zone.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="w-px bg-app-border my-2" />

                {/* Tables Grid */}
                <div className="flex-1 flex flex-col min-w-0">
                  <Label className="text-xs font-semibold text-app-text-muted uppercase tracking-wider mb-2 text-center">
                    Tables
                  </Label>
                  <div className="flex-1 overflow-y-auto">
                    {pickerTables.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2">
                        {pickerTables.map((table) => (
                          <button
                            key={table.id}
                            type="button"
                            onClick={() => {
                              setSelectedTable(table.table_number);
                              setShowTablePicker(false);
                              setPickerZoneId(null);
                            }}
                            className={cn(
                              'flex flex-col items-center justify-center rounded-lg border px-2 py-3 text-sm transition-all min-h-[56px]',
                              selectedTable === table.table_number
                                ? 'bg-accent text-accent-text border-accent font-bold'
                                : 'border-app-border text-app-text hover:bg-app-hover hover:border-accent/30',
                            )}
                          >
                            <span className="font-semibold text-xs">{table.table_number}</span>
                            {table.display_name !== table.table_number && (
                              <span className="text-[10px] opacity-70 truncate max-w-full">
                                {table.display_name}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-app-text-muted text-sm">
                        {pickerZoneId ? t('noResults') : t('selectTable')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-app-text-muted">
                <LayoutGrid className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">{t('noResults')}</p>
                <p className="text-xs mt-1 text-app-text-muted">{tc('save')}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
