'use client';

import { useState, useMemo, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useDevice } from '@/hooks/useDevice';
import { usePOSData } from '@/hooks/usePOSData';
import { useContextualShortcuts } from '@/hooks/useContextualShortcuts';
import POSProductBrowser from '@/components/features/pos/POSProductBrowser';
import POSCart from '@/components/features/pos/POSCart';
import POSUnpaidPanel from '@/components/features/pos/POSUnpaidPanel';
import { POSLoadBanner } from '@/components/features/pos/POSLoadBanner';
import { POSTopBar } from '@/components/features/pos/POSTopBar';
import { POSNoteDialog } from '@/components/features/pos/POSNoteDialog';
import PaymentModal from '@/components/admin/PaymentModal';
import type { PaymentData } from '@/components/admin/PaymentModal';
import RoleGuard from '@/components/admin/RoleGuard';
import { usePermissions } from '@/hooks/usePermissions';
import type { ShortcutDefinition } from '@/hooks/useKeyboardShortcuts';
import { usePosUnpaidOrders, UNPAID_LIMIT } from '@/hooks/usePosUnpaidOrders';
import { usePosDestinationCheck } from '@/components/features/pos/usePosDestinationCheck';
import type { Order } from '@/types/admin.types';

interface POSClientProps {
  tenantId: string;
}

export default function POSClient({ tenantId }: POSClientProps) {
  const t = useTranslations('pos');
  const { isMobile } = useDevice();
  // Le serveur prend les commandes a la caisse sans encaisser (decision du
  // 2026-11-09): sans `orders.pay`, ni "Valider le paiement" ni "A encaisser",
  // ni coupon (une remise). La route /api/orders/pos refuse de toute facon un
  // paiement, un pourboire ou un coupon sans ce droit.
  const canPay = usePermissions().can('orders.pay');
  const [mobileView, setMobileView] = useState<'products' | 'cart'>('products');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  // -- "A encaisser" (C2): bill an existing QR/served order from the caisse --
  const [showUnpaid, setShowUnpaid] = useState(false);
  const [settlingOrder, setSettlingOrder] = useState<Order | null>(null);
  const {
    unpaidOrders,
    loading: unpaidLoading,
    loadFailed: unpaidLoadFailed,
    truncated: unpaidTruncated,
    refresh: refreshUnpaid,
  } = usePosUnpaidOrders(tenantId);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const ts = useTranslations('shortcuts');
  const pos = usePOSData(tenantId);

  const destinationReady = usePosDestinationCheck(pos);

  // -- Contextual keyboard shortcuts --
  const { cart, menuItems, addToCart, isSending } = pos;
  const shortcuts = useMemo<ShortcutDefinition[]>(
    () => [
      {
        id: 'pos-repeat',
        label: ts('repeatLastItem'),
        section: 'contextual',
        keys: ['+'],
        action: () => {
          const lastItem = cart[cart.length - 1];
          if (lastItem) {
            const menuItem = menuItems.find((m: { id: string }) => m.id === lastItem.id);
            if (menuItem) addToCart(menuItem, lastItem.selectedModifiers, lastItem.selectedVariant);
          }
        },
      },
      {
        id: 'pos-payment',
        label: ts('openPayment'),
        section: 'contextual',
        keys: ['p'],
        action: () => {
          if (canPay && cart.length > 0 && !isSending && destinationReady()) {
            setShowPaymentModal(true);
          }
        },
      },
    ],
    [ts, cart, menuItems, addToCart, canPay, isSending, destinationReady],
  );
  useContextualShortcuts(shortcuts);

  const router = useRouter();
  const site = useParams()?.site as string | undefined;

  return (
    <RoleGuard permission="pos.use">
      <div className="@container h-full flex flex-col overflow-hidden bg-app-bg">
        {!mounted || pos.loading ? (
          <div className="flex-1 flex items-center justify-center text-app-text-muted">
            {t('loading')}
          </div>
        ) : (
          <>
            <POSTopBar
              isMobile={isMobile}
              mobileView={mobileView}
              onMobileView={setMobileView}
              cartCount={pos.cart.length}
              unpaidCount={canPay ? unpaidOrders.length : undefined}
              onOpenUnpaid={() => setShowUnpaid(true)}
              onBack={() => router.back()}
            />

            <POSLoadBanner
              menuUnavailable={pos.menuUnavailable}
              extrasError={pos.extrasError}
              onRetry={() => {
                if (pos.menuUnavailable) pos.retryMenu();
                if (pos.extrasError) pos.retryExtras();
              }}
            />

            {/* Main layout - flat surfaces separated by border lines, no boxed cards */}
            <div className="flex-1 flex flex-col @md:flex-row overflow-hidden min-h-0">
              {/* Products Section - flat surface, no card border */}
              <div
                className={cn(
                  '@container flex-1 flex-col min-w-0 min-h-0 overflow-hidden',
                  isMobile ? (mobileView === 'products' ? 'flex' : 'hidden') : 'flex',
                )}
              >
                <POSProductBrowser
                  items={pos.searchFilteredItems}
                  categories={pos.categories}
                  cart={pos.cart}
                  searchQuery={pos.searchQuery}
                  setSearchQuery={pos.setSearchQuery}
                  selectedCategory={pos.selectedCategory}
                  setSelectedCategory={pos.setSelectedCategory}
                  onAddToCart={pos.addToCart}
                  currency={pos.currency}
                />
              </div>

              {/* Cart Section - separated by a vertical line, not a boxed card */}
              <div
                className={cn(
                  '@container w-full @md:w-[45%] @lg:w-[42%] @xl:w-[40%] @2xl:w-[35%] border-t @md:border-t-0 @md:border-l border-app-border flex-col overflow-hidden shrink-0',
                  isMobile ? (mobileView === 'cart' ? 'flex' : 'hidden') : 'flex',
                )}
              >
                <POSCart
                  cart={pos.cart}
                  currency={pos.currency}
                  pricing={pos.pricing}
                  orderNumber={pos.orderNumber}
                  serviceType={pos.serviceType}
                  setServiceType={pos.setServiceType}
                  selectedTable={pos.selectedTable}
                  setSelectedTable={pos.setSelectedTable}
                  roomNumber={pos.roomNumber}
                  setRoomNumber={pos.setRoomNumber}
                  deliveryAddress={pos.deliveryAddress}
                  setDeliveryAddress={pos.setDeliveryAddress}
                  zones={pos.zones}
                  allTables={pos.allTables}
                  occupiedTableNumbers={pos.occupiedTableNumbers}
                  onTablePickerOpen={pos.refreshOccupancy}
                  onUpdateQuantity={pos.updateQuantity}
                  onClearCart={pos.clearCart}
                  onEditNotes={(itemId, currentNotes) => {
                    pos.setEditingNotes(itemId);
                    pos.setNotesText(currentNotes);
                  }}
                  orderNotes={pos.orderNotes}
                  setOrderNotes={pos.setOrderNotes}
                  enableCoupons={canPay && pos.enableCoupons}
                  couponCode={pos.couponCode}
                  setCouponCode={pos.setCouponCode}
                  appliedCoupon={pos.appliedCoupon}
                  couponLoading={pos.couponLoading}
                  couponError={pos.couponError}
                  onValidateCoupon={pos.validateCoupon}
                  onRemoveCoupon={pos.removeCoupon}
                  // Refresh "A encaisser" right away: realtime alone misses the new
                  // unpaid order whenever the websocket is down (weak network).
                  busy={pos.isSending}
                  onPrintOrder={() => {
                    if (destinationReady()) void pos.handleOrder({ onCreated: refreshUnpaid });
                  }}
                  onCheckout={
                    canPay
                      ? () => {
                          if (destinationReady()) setShowPaymentModal(true);
                        }
                      : undefined
                  }
                />
              </div>
            </div>

            <POSNoteDialog
              open={pos.editingNotes !== null}
              value={pos.notesText}
              onChange={pos.setNotesText}
              onCancel={() => pos.setEditingNotes(null)}
              onSave={pos.saveNotes}
            />

            {/* Payment Modal Reuse */}
            {canPay && showPaymentModal && (
              <PaymentModal
                onClose={() => setShowPaymentModal(false)}
                orderNumber={pos.orderNumber}
                total={pos.pricing.total}
                tableNumber={
                  pos.serviceType === 'dine_in' && pos.selectedTable ? pos.selectedTable : undefined
                }
                pricing={pos.pricing}
                cartItems={pos.cart.map((item) => ({
                  name: item.name,
                  quantity: item.quantity,
                  price:
                    item.price + (item.selectedModifiers?.reduce((s, m) => s + m.price, 0) || 0),
                  modifiers: item.selectedModifiers?.map((m) => m.name),
                }))}
                currency={pos.currency}
                onSuccess={(paymentData?: PaymentData) =>
                  pos.handleOrder({
                    onPaymentModalClose: () => setShowPaymentModal(false),
                    paymentData,
                  })
                }
              />
            )}

            {/* A encaisser panel: pick an existing unpaid order to settle */}
            <POSUnpaidPanel
              open={canPay && showUnpaid}
              onClose={() => setShowUnpaid(false)}
              orders={unpaidOrders}
              loading={unpaidLoading}
              loadFailed={unpaidLoadFailed}
              truncatedAt={unpaidTruncated ? UNPAID_LIMIT : undefined}
              onRetry={() => void refreshUnpaid()}
              currency={pos.currency}
              onSelect={(order) => {
                setShowUnpaid(false);
                // Une note payee en partie se solde sur sa fiche: c'est le seul
                // ecran qui encaisse un montant libre contre le registre.
                // L'encaissement rapide ci-dessous ne sait regler qu'une note
                // entiere encore intacte.
                if (order.payment_status === 'partial') {
                  router.push(`${site ? `/sites/${site}/admin` : '/admin'}/orders/${order.id}`);
                  return;
                }
                setSettlingOrder(order);
              }}
            />

            {/* Settle an existing order: PaymentModal in order mode -> markPaid */}
            {canPay && settlingOrder && (
              <PaymentModal
                order={settlingOrder}
                currency={pos.currency}
                onClose={() => setSettlingOrder(null)}
                onSuccess={() => {
                  setSettlingOrder(null);
                  refreshUnpaid();
                }}
              />
            )}
          </>
        )}
      </div>
    </RoleGuard>
  );
}
