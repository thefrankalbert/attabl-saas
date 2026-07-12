'use client';

import type { ServiceType, CurrencyCode, Zone, Table, PricingBreakdown } from '@/types/admin.types';
import type { CartItem, AppliedCoupon } from '@/hooks/usePOSData';

import { usePOSCart } from './usePOSCart';
import { POSCartHeader } from './POSCartHeader';
import { POSServiceTypeSelector } from './POSServiceTypeSelector';
import { POSCartItemList } from './POSCartItemList';
import { POSCartFooter } from './POSCartFooter';
import { POSTablePickerDialog } from './POSTablePickerDialog';
import { POSClearCartDialog } from './POSClearCartDialog';

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
  occupiedTableNumbers?: Set<string>;

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
  occupiedTableNumbers,
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
  const {
    showOrderNotes,
    setShowOrderNotes,
    showTablePicker,
    setShowTablePicker,
    pickerZoneId,
    setPickerZoneId,
    showClearCartConfirm,
    setShowClearCartConfirm,
    pickerTables,
    totalItems,
  } = usePOSCart(zones, allTables, cart);

  return (
    <>
      {/* --- HEADER --- */}
      <POSCartHeader
        orderNumber={orderNumber}
        onClear={() => {
          if (cart.length === 0) {
            onClearCart();
          } else {
            setShowClearCartConfirm(true);
          }
        }}
      />

      {/* --- SERVICE TYPE (pinned - stays put while the item list scrolls) --- */}
      <POSServiceTypeSelector
        serviceType={serviceType}
        setServiceType={setServiceType}
        selectedTable={selectedTable}
        roomNumber={roomNumber}
        setRoomNumber={setRoomNumber}
        deliveryAddress={deliveryAddress}
        setDeliveryAddress={setDeliveryAddress}
        onOpenTablePicker={() => setShowTablePicker(true)}
      />

      {/* --- SCROLLABLE AREA - only the item list scrolls --- */}
      <POSCartItemList
        cart={cart}
        currency={currency}
        onUpdateQuantity={onUpdateQuantity}
        onEditNotes={onEditNotes}
      />

      {/* --- FOOTER --- */}
      <POSCartFooter
        cart={cart}
        currency={currency}
        pricing={pricing}
        totalItems={totalItems}
        orderNotes={orderNotes}
        setOrderNotes={setOrderNotes}
        showOrderNotes={showOrderNotes}
        setShowOrderNotes={setShowOrderNotes}
        enableCoupons={enableCoupons}
        couponCode={couponCode}
        setCouponCode={setCouponCode}
        appliedCoupon={appliedCoupon}
        couponLoading={couponLoading}
        couponError={couponError}
        onValidateCoupon={onValidateCoupon}
        onRemoveCoupon={onRemoveCoupon}
        onPrintOrder={onPrintOrder}
        onCheckout={onCheckout}
      />

      {/* --- TABLE PICKER DIALOG --- */}
      <POSTablePickerDialog
        open={showTablePicker}
        onOpenChange={(open) => {
          setShowTablePicker(open);
          if (!open) setPickerZoneId(null);
        }}
        zones={zones}
        pickerZoneId={pickerZoneId}
        onPickZone={(zoneId) => setPickerZoneId(zoneId)}
        pickerTables={pickerTables}
        selectedTable={selectedTable}
        occupiedTableNumbers={occupiedTableNumbers}
        onSelectTable={(tableNumber) => {
          setSelectedTable(tableNumber);
          setShowTablePicker(false);
          setPickerZoneId(null);
        }}
      />

      {/* Clear cart confirmation (replaces window.confirm) */}
      <POSClearCartDialog
        open={showClearCartConfirm}
        onOpenChange={(open) => {
          if (!open) setShowClearCartConfirm(false);
        }}
        onConfirm={() => {
          onClearCart();
          setShowClearCartConfirm(false);
        }}
      />
    </>
  );
}
