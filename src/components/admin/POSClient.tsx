'use client';

import { useState, useMemo, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useDevice } from '@/hooks/useDevice';
import { usePOSData } from '@/hooks/usePOSData';
import { useContextualShortcuts } from '@/hooks/useContextualShortcuts';
import { useSegmentTerms } from '@/hooks/useSegmentTerms';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft } from 'lucide-react';
import POSProductBrowser from '@/components/features/pos/POSProductBrowser';
import POSCart from '@/components/features/pos/POSCart';
import PaymentModal from '@/components/admin/PaymentModal';
import type { PaymentData } from '@/components/admin/PaymentModal';
import RoleGuard from '@/components/admin/RoleGuard';
import type { ShortcutDefinition } from '@/hooks/useKeyboardShortcuts';

interface POSClientProps {
  tenantId: string;
}

export default function POSClient({ tenantId }: POSClientProps) {
  const t = useTranslations('pos');
  const tc = useTranslations('common');
  const seg = useSegmentTerms();
  const { isMobile } = useDevice();
  const [mobileView, setMobileView] = useState<'products' | 'cart'>('products');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const ts = useTranslations('shortcuts');
  const pos = usePOSData(tenantId);

  // ── Contextual keyboard shortcuts ──
  const { cart, menuItems, addToCart } = pos;
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
          if (cart.length > 0) setShowPaymentModal(true);
        },
      },
    ],
    [ts, cart, menuItems, addToCart],
  );
  useContextualShortcuts(shortcuts);

  const router = useRouter();

  return (
    <RoleGuard permission="canConfigurePOS">
      <div className="h-full flex flex-col overflow-hidden bg-app-bg">
        {!mounted || pos.loading ? (
          <div className="flex-1 flex items-center justify-center text-app-text-muted">
            {t('loading')}
          </div>
        ) : (
          <>
            {/* Back button + Mobile View Toggle */}
            <div className="flex items-center border-b border-app-border shrink-0">
              <Button
                variant="ghost"
                size="icon"
                aria-label={tc('aria.back')}
                onClick={() => router.back()}
                className="p-3 min-h-[44px] min-w-[44px] flex items-center justify-center text-app-text-secondary hover:text-app-text transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>

              {isMobile ? (
                <div className="flex flex-1">
                  <Button
                    variant="ghost"
                    onClick={() => setMobileView('products')}
                    className={cn(
                      'flex-1 py-3 min-h-[44px] text-sm font-semibold transition-colors rounded-none',
                      mobileView === 'products'
                        ? 'border-b-2 border-accent text-app-text'
                        : 'text-app-text-muted',
                    )}
                  >
                    {t('searchProduct')
                      ? t('searchProduct').split('...')[0] || 'Produits'
                      : 'Produits'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setMobileView('cart')}
                    className={cn(
                      'flex-1 py-3 min-h-[44px] text-sm font-semibold transition-colors relative rounded-none',
                      mobileView === 'cart'
                        ? 'border-b-2 border-accent text-app-text'
                        : 'text-app-text-muted',
                    )}
                  >
                    {t('cart')}{' '}
                    {pos.cart.length > 0 && (
                      <span className="ml-1 bg-accent text-accent-text text-xs rounded-full px-1.5 py-0.5">
                        {pos.cart.length}
                      </span>
                    )}
                  </Button>
                </div>
              ) : (
                <h1 className="text-sm font-semibold text-app-text">{t('title') || 'POS'}</h1>
              )}
            </div>

            {/* Main layout - flat surfaces separated by border lines, no boxed cards */}
            <div className="flex-1 flex flex-col @md:flex-row overflow-hidden min-h-0">
              {/* Products Section - flat surface, no card border */}
              <div
                className={cn(
                  'flex-1 flex-col min-w-0 min-h-0 overflow-hidden',
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
                  'w-full @md:w-[45%] @lg:w-[42%] @xl:w-[40%] @2xl:w-[35%] border-t @md:border-t-0 @md:border-l border-app-border flex-col overflow-hidden shrink-0',
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
                  onUpdateQuantity={pos.updateQuantity}
                  onClearCart={pos.clearCart}
                  onEditNotes={(itemId, currentNotes) => {
                    pos.setEditingNotes(itemId);
                    pos.setNotesText(currentNotes);
                  }}
                  orderNotes={pos.orderNotes}
                  setOrderNotes={pos.setOrderNotes}
                  enableCoupons={pos.enableCoupons}
                  couponCode={pos.couponCode}
                  setCouponCode={pos.setCouponCode}
                  appliedCoupon={pos.appliedCoupon}
                  couponLoading={pos.couponLoading}
                  couponError={pos.couponError}
                  onValidateCoupon={pos.validateCoupon}
                  onRemoveCoupon={pos.removeCoupon}
                  onPrintOrder={() => pos.handleOrder('pending')}
                  onCheckout={() => setShowPaymentModal(true)}
                />
              </div>
            </div>

            {/* Note Modal -- flat design */}
            {pos.editingNotes && (
              <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
                <div className="bg-app-card rounded-xl border border-app-border p-6 w-full max-w-sm animate-in zoom-in-95">
                  <h3 className="font-bold text-lg text-app-text mb-4">
                    {seg.productionNoteTitle}
                  </h3>
                  <Textarea
                    autoFocus
                    className="w-full h-32 p-3 border border-app-border rounded-lg bg-app-elevated text-app-text placeholder:text-app-text-muted outline-none focus:border-accent/40 resize-none"
                    placeholder={seg.productionNotePlaceholder}
                    value={pos.notesText}
                    onChange={(e) => pos.setNotesText(e.target.value)}
                  />
                  <div className="flex justify-end gap-2 mt-4">
                    <Button
                      variant="ghost"
                      className="rounded-xl"
                      onClick={() => pos.setEditingNotes(null)}
                    >
                      {tc('cancel')}
                    </Button>
                    <Button variant="default" className="rounded-xl" onClick={pos.saveNotes}>
                      {tc('save')}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Modal Reuse */}
            {showPaymentModal && (
              <PaymentModal
                onClose={() => setShowPaymentModal(false)}
                orderNumber={pos.orderNumber}
                total={pos.pricing.total}
                tableNumber={pos.selectedTable || `CMD-${pos.orderNumber}`}
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
                  pos.handleOrder('delivered', {
                    onPaymentModalClose: () => setShowPaymentModal(false),
                    paymentData,
                  })
                }
              />
            )}
          </>
        )}
      </div>
    </RoleGuard>
  );
}
