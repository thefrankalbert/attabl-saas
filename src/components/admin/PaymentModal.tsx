'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useTranslations } from 'next-intl';
import { Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { payExistingOrder } from '@/components/admin/payment/pay-existing-order';
import { formatCurrency } from '@/lib/utils/currency';
import { TipSelector } from '@/components/admin/payment/TipSelector';
import { PaymentHeader } from '@/components/admin/payment/PaymentHeader';
import { CashPanel } from '@/components/admin/payment/CashPanel';
import { PaymentReceipt, type CartDisplayItem } from '@/components/admin/payment/PaymentReceipt';
import { cashQuickAdd } from '@/components/admin/payment/payment-amounts';
import { usePaymentAmounts } from '@/components/admin/payment/usePaymentAmounts';
import { fromMinorUnits, toMinorUnits } from '@/lib/utils/money';
import { useToast } from '@/components/ui/use-toast';
import CompOrderDialog from '@/components/admin/orders/CompOrderDialog';
import { orderTotalMajor, recordedTipMajor } from '@/components/admin/payment/order-amount';
import { useSubscription } from '@/contexts/SubscriptionContext';
import {
  PaymentMethodPicker,
  effectivePaymentMethod,
  usePaymentMethodChoices,
} from '@/components/admin/payment/PaymentMethodPicker';
import type { PaymentMethodId } from '@/lib/payments/methods';
import type { Order, CurrencyCode } from '@/types/admin.types';

// --- Types --------------------------------------

export interface PaymentData {
  paymentMethod: PaymentMethod;
  tipAmount: number;
}

interface PaymentModalProps {
  onClose: () => void;
  order?: Order;
  total?: number;
  tableNumber?: string;
  orderNumber?: number;
  /**
   * Whether the actor may comp (offer) the order. Comp is a MANAGER privilege -
   * the caller passes true only for owner/admin/manager. Never exposed to a plain
   * server (a server zeroing out checks = fraud). ORDER mode only.
   */
  canComp?: boolean;
  /**
   * Cart mode: creates the order; the screen keeps its spinner until the
   * returned promise settles (a second tap used to look ignored).
   */
  onSuccess: (paymentData?: PaymentData) => void | Promise<void>;
  cartItems?: CartDisplayItem[];
  currency?: CurrencyCode;
  pricing?: {
    subtotal: number;
    taxAmount: number;
    serviceChargeAmount: number;
    discountAmount: number;
    total: number;
  };
}

// Especes ou carte (terminal du restaurant): ATTABL n'enregistre que le moyen.
type PaymentMethod = PaymentMethodId;

// --- Component ----------------------------------

export default function PaymentModal({
  onClose,
  order,
  total,
  tableNumber,
  orderNumber,
  onSuccess,
  cartItems,
  currency = 'XAF',
  pricing,
  canComp = false,
}: PaymentModalProps) {
  const t = useTranslations('payment');

  // MONEY UNITS. This modal runs in two modes:
  //   - ORDER mode (order?.id present): the order's money columns (total_price,
  //     subtotal, tax_amount, ...) are integer MINOR units read from the DB.
  //   - CART mode (POS, no order yet): the `total`/`pricing` props are MAJOR units
  //     computed client-side from menu prices; the order is stored later by the
  //     POS create path, which converts via the service.
  // To keep the keypad math + display in ONE consistent unit, everything below
  // works in MAJOR units: in ORDER mode we convert the minor DB values to major
  // here at the boundary. The only place we go back to minor is when SENDING the
  // tip to actionMarkOrderPaid (markPaid stores orders.tip_amount as minor).
  const isOrderMode = !!order?.id;
  const orderCurrency = order?.display_currency ?? currency;
  const toMajor = (v: number | null | undefined) =>
    isOrderMode ? fromMinorUnits(Number(v ?? 0), orderCurrency) : Number(v ?? 0);

  // Montant reclame au client: regle isolee et testee dans `order-amount.ts`
  // (elle ne lisait que `total_price`, un champ derive que la liste des
  // commandes ne remplit pas, d'ou des encaissements a 0).
  // Pourboire exclu: le pourboire deja laisse par le client s'y ajoute dans
  // usePaymentAmounts (il etait oublie: la caisse reclamait 5 000 et le
  // registre inscrivait 5 500).
  const finalTotal = orderTotalMajor({ totalProp: total, order, currency: orderCurrency });
  const recordedTip = recordedTipMajor(order, orderCurrency);
  // Display-only: tableless orders (takeaway, delivery, counter sales) are
  // legitimate - a table is never required to take a payment.
  const finalTable = tableNumber ?? order?.table_number ?? undefined;
  // Prefer the human order number (CMD-...) over a hex slice of the UUID,
  // which reads as a random number to the cashier.
  const finalOrderNum: string | number | undefined =
    orderNumber ?? order?.order_number ?? undefined;
  // In ORDER mode amounts come from the order's currency, not the prop default.
  const displayCurrency = isOrderMode ? orderCurrency : currency;

  // Cible du portail (voir le commentaire au rendu). `null` tant que le
  // composant n'est pas monte cote navigateur.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  // Keyboard focus stays in the payment screen and returns to the till after.
  // Cart mode only: opened from an order's details, the screen sits above a
  // Radix dialog whose own focus scope would fight this trap.
  const layerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(layerRef, portalTarget !== null && !isOrderMode);

  const methodChoices = usePaymentMethodChoices();
  const [chosenMethod, setChosenMethod] = useState<PaymentMethod | null>(null);
  const method = effectivePaymentMethod(chosenMethod, methodChoices);
  const isCash = method === 'cash';
  const [isProcessing, setIsProcessing] = useState(false);
  // Cle d'idempotence de l'encaissement, stable tant que le paiement n'a pas
  // abouti (voir handleProcessPayment).
  const payRequestIdRef = useRef<string | null>(null);

  // Tips are Pro+ (canAccessTips, see pricing-data.ts). Hide the tip selectors when
  // the plan lacks them; tipAmount then stays 0 and the server rejects any crafted tip.
  const { canAccess } = useSubscription();
  const canTip = canAccess('canAccessTips');

  const { toast } = useToast();

  const {
    tipAmount,
    extraTip,
    totalWithTip,
    receivedAmount,
    change,
    amountRemaining,
    cashIsValid,
    handleKeypadPress,
    setExactCashAmount,
    addCashAmount,
    tipProps,
  } = usePaymentAmounts(finalTotal, displayCurrency, recordedTip);
  // Carte: le terminal du restaurant a deja encaisse, aucune saisie de montant.
  const canValidate = !isCash || cashIsValid;

  // Escape closes - but never while a payment is in flight (the cashier would
  // lose the result), nor when a nested dialog (comp) already handled it.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !isProcessing) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, isProcessing]);

  const handleProcessPayment = async () => {
    setIsProcessing(true);
    try {
      if (order?.id) {
        // Only the tip ADDED at the till is sent (markPaid adds it to the one
        // the customer left): sending the total would count the customer's tip
        // twice. MAJOR keypad value -> integer MINOR units at the boundary.
        const tipMinor = extraTip > 0 ? toMinorUnits(extraTip, orderCurrency) : undefined;
        payRequestIdRef.current ??= crypto.randomUUID();
        const outcome = await payExistingOrder(order.id, method, tipMinor, payRequestIdRef.current);
        setIsProcessing(false);
        if (outcome.kind === 'error') {
          toast({ title: t('paymentError'), description: outcome.message, variant: 'destructive' });
          return;
        }
        // Sent or durably queued: the next bill gets a new key.
        payRequestIdRef.current = null;
        if (outcome.kind === 'queued') {
          toast({ title: t('paymentQueued'), description: t('paymentQueuedDesc') });
        } else {
          // paid=false: already settled (double tap, another cashier) - say so
          // instead of implying this tap took a second payment.
          toast({
            title:
              outcome.kind === 'alreadySettled' ? t('paymentAlreadySettled') : t('paymentSuccess'),
          });
        }
        onSuccess();
        return;
      }
      // POS cart: the caller creates the order (and shows its own toast). Keep
      // the spinner until it is done.
      await onSuccess({ paymentMethod: method, tipAmount });
      setIsProcessing(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : undefined;
      toast({ title: t('paymentError'), description: message, variant: 'destructive' });
      setIsProcessing(false);
    }
  };

  // Price breakdown from order (admin view, MINOR -> converted to major) or
  // pricing prop (POS view, already major).
  const pick = (orderMinor: number | null | undefined, cartMajor: number | undefined) =>
    isOrderMode ? (orderMinor != null ? toMajor(orderMinor) : undefined) : cartMajor;
  const subtotal = pick(order?.subtotal, pricing?.subtotal);
  const taxAmount = pick(order?.tax_amount, pricing?.taxAmount);
  const serviceChargeAmount = pick(order?.service_charge_amount, pricing?.serviceChargeAmount);
  const discountAmount = pick(order?.discount_amount, pricing?.discountAmount);

  // PORTAIL VERS LE CORPS DU DOCUMENT: rendu dans une fenetre Radix (detail
  // de commande), dont le `transform` devient le bloc conteneur des `fixed`, le
  // calque plein ecran restait enferme dans la fenetre (mesure du 2026-11-06,
  // bouton "Valider" hors de la zone visible). Monte apres le premier rendu:
  // `document` n'existe pas cote serveur.
  if (!portalTarget) return null;

  return createPortal(
    <div
      ref={layerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
      className="@container fixed inset-0 z-50 bg-app-bg text-app-text flex flex-col overflow-hidden outline-none animate-in fade-in duration-200"
    >
      <PaymentHeader
        titleId="payment-modal-title"
        orderNumber={finalOrderNum}
        table={finalTable}
        onBack={onClose}
        busy={isProcessing}
      />

      {/* --- MAIN -- 2 columns on md+, payment-only on mobile --- */}
      <div className="flex-1 min-h-0 flex flex-col @3xl:grid @3xl:grid-cols-2 overflow-hidden">
        {/* --- LEFT: Receipt (hidden on mobile) --- */}
        <div className="hidden @3xl:flex flex-col border-r border-app-border overflow-y-auto p-5 lg:p-6">
          <PaymentReceipt
            currency={displayCurrency}
            finalTotal={finalTotal}
            tipAmount={tipAmount}
            cartItems={cartItems}
            subtotal={subtotal}
            taxAmount={taxAmount}
            serviceChargeAmount={serviceChargeAmount}
            discountAmount={discountAmount}
          />

          {/* Tip Selection -- pushed to bottom */}
          {canTip && <TipSelector withTitle className="mt-auto" {...tipProps} />}
        </div>

        {/* --- RIGHT: Payment Input (full width on mobile) --- */}
        <div className="flex-1 flex flex-col overflow-y-auto min-h-0 p-3 sm:p-4 lg:p-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {/* Mobile: compact summary (hidden on desktop) */}
          <div className="flex items-center justify-between mb-3 @3xl:hidden shrink-0">
            <p className="text-xs font-medium uppercase tracking-widest text-app-text-muted">
              {t('amountToPay')}
            </p>
            <p className="text-xl sm:text-2xl font-bold text-app-text tabular-nums">
              {formatCurrency(totalWithTip, displayCurrency)}
            </p>
          </div>

          {/* Mobile: inline tip row (hidden on desktop where tips are in left col) */}
          {canTip && <TipSelector className="mb-3 @3xl:hidden shrink-0" {...tipProps} />}

          {/* Method picker; cash: received, change, shortcuts, numpad, validate */}
          <div className="flex-1 min-h-0 flex flex-col gap-2 sm:gap-3">
            <PaymentMethodPicker
              value={method}
              onChange={setChosenMethod}
              choices={methodChoices}
              disabled={isProcessing}
            />

            {isCash && (
              <CashPanel
                currency={displayCurrency}
                receivedAmount={receivedAmount}
                amountRemaining={amountRemaining}
                change={change}
                cashIsValid={cashIsValid}
                quickAdd={cashQuickAdd(displayCurrency)}
                onKey={handleKeypadPress}
                onExact={setExactCashAmount}
                onAdd={addCashAmount}
              />
            )}

            <Button
              type="button"
              variant="default"
              onClick={handleProcessPayment}
              disabled={!canValidate || isProcessing}
              className={cn(
                'w-full min-h-[52px] rounded-xl text-base font-bold shrink-0 touch-manipulation',
                canValidate ? '' : 'opacity-60',
              )}
            >
              {isProcessing ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Check className="mr-2 h-5 w-5" />
              )}
              {t('validatePayment')}
            </Button>

            {/* Offrir (comp) - MANAGER only, ORDER mode only. Closes the order for
                free without a tender; the server re-checks the role. */}
            {isOrderMode && canComp && order?.id && order.tenant_id && (
              <CompOrderDialog
                tenantId={order.tenant_id}
                orderId={order.id}
                onComped={() => onSuccess()}
              />
            )}
          </div>

          {/* Cancel - especes : la validation se fait via le bouton ci-dessus */}
          <div className="flex shrink-0 mt-auto pt-2 border-t border-app-border @3xl:border-t-0 @3xl:pt-0">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isProcessing}
              className="rounded-xl min-h-[44px] flex-1"
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    portalTarget,
  );
}
