'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Loader2,
  Coins,
  CreditCard,
  Banknote,
  X,
  ArrowLeft,
  Delete,
  Check,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { actionMarkOrderPaid } from '@/app/actions/orders';
import { formatCurrency } from '@/lib/utils/currency';
import { useToast } from '@/components/ui/use-toast';
import type { Order, CurrencyCode } from '@/types/admin.types';

// ─── Types ──────────────────────────────────────

interface CartDisplayItem {
  name: string;
  quantity: number;
  price: number;
  modifiers?: string[];
}

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
  onSuccess: (paymentData?: PaymentData) => void;
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

type PaymentMethod = 'cash' | 'card' | 'mobile_money';

const TIP_AMOUNTS = [1000, 2000, 5000] as const;
/** Quick cash increments (FCFA / XOF) */
const CASH_QUICK_ADD = [1000, 2000, 5000, 10000] as const;
// Standard POS keypad: 4 columns -- digits + backspace/clear
const NUMPAD_KEYS = ['1', '2', '3', '⌫', '4', '5', '6', 'C', '7', '8', '9', '00', '0'] as const;

// ─── Component ──────────────────────────────────

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
}: PaymentModalProps) {
  const t = useTranslations('payment');
  const tc = useTranslations('common');

  const finalTotal = total ?? order?.total_price ?? 0;
  const finalTable = tableNumber ?? order?.table_number ?? t('unknownTable');
  const finalOrderNum = orderNumber ?? (order ? parseInt(order.id.slice(0, 4), 16) : undefined);

  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [tipFixed, setTipFixed] = useState<number>(0);
  const [customTip, setCustomTip] = useState<string>('');
  const [showCustomTip, setShowCustomTip] = useState(false);

  const { toast } = useToast();

  const tipAmount = useMemo(() => {
    if (showCustomTip) return parseFloat(customTip) || 0;
    return tipFixed;
  }, [tipFixed, customTip, showCustomTip]);

  const totalWithTip = useMemo(() => finalTotal + tipAmount, [finalTotal, tipAmount]);

  const receivedAmount = useMemo(() => parseFloat(amountReceived) || 0, [amountReceived]);

  const change = useMemo(() => {
    return Math.max(0, receivedAmount - totalWithTip);
  }, [receivedAmount, totalWithTip]);

  const amountRemaining = useMemo(() => {
    return Math.max(0, totalWithTip - receivedAmount);
  }, [receivedAmount, totalWithTip]);

  const cashIsValid = receivedAmount >= totalWithTip;

  // Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleKeypadPress = useCallback((key: string) => {
    if (key === 'C') {
      setAmountReceived('');
    } else if (key === '⌫') {
      setAmountReceived((prev) => prev.slice(0, -1));
    } else {
      setAmountReceived((prev) => {
        if (prev === '0' && key !== '00') {
          return key;
        }
        return prev + key;
      });
    }
  }, []);

  const setExactCashAmount = useCallback(() => {
    setAmountReceived(String(Math.round(totalWithTip)));
  }, [totalWithTip]);

  const addCashAmount = useCallback(
    (delta: number) => {
      setAmountReceived(String(Math.round(receivedAmount + delta)));
    },
    [receivedAmount],
  );

  const handleProcessPayment = async () => {
    if (!finalTable || finalTable === t('unknownTable')) {
      toast({ title: t('tableRequired'), variant: 'destructive' });
      return;
    }

    setIsProcessing(true);

    try {
      if (order?.id) {
        try {
          const result = await actionMarkOrderPaid(
            order.tenant_id,
            order.id,
            method,
            tipAmount > 0 ? tipAmount : undefined,
          );
          if (result.error) throw new Error(result.error);
        } catch (paymentError) {
          const description = paymentError instanceof Error ? paymentError.message : undefined;
          toast({ title: t('paymentError'), description, variant: 'destructive' });
          setIsProcessing(false);
          return;
        }
      }

      setIsProcessing(false);
      // For existing orders, payment was persisted above - show success toast
      if (order?.id) {
        toast({ title: t('paymentSuccess') });
      }
      // For POS orders, pass payment data - the caller handles the toast after order creation
      onSuccess(order?.id ? undefined : { paymentMethod: method, tipAmount });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : undefined;
      toast({ title: t('paymentError'), description: message, variant: 'destructive' });
      setIsProcessing(false);
    }
  };

  const isValid = () => {
    if (method === 'cash') {
      return cashIsValid;
    }
    return true;
  };

  // Price breakdown from order (admin view) or pricing prop (POS view)
  const subtotal = order?.subtotal ?? pricing?.subtotal;
  const taxAmount = order?.tax_amount ?? pricing?.taxAmount;
  const serviceChargeAmount = order?.service_charge_amount ?? pricing?.serviceChargeAmount;
  const discountAmount = order?.discount_amount ?? pricing?.discountAmount;
  const hasBreakdown =
    (subtotal !== undefined && subtotal !== null) ||
    (pricing !== undefined && (pricing.taxAmount > 0 || pricing.serviceChargeAmount > 0));

  return (
    <div className="fixed inset-0 z-50 bg-app-bg text-app-text flex flex-col overflow-hidden animate-in fade-in duration-200">
      {/* ━━━ HEADER ━━━ */}
      <header className="h-12 border-b border-app-border flex items-center justify-between px-3 sm:px-5 shrink-0">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={tc('aria.back')}
            onClick={onClose}
            className="-ml-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-bold text-sm sm:text-base">{t('title')}</h1>
          {finalOrderNum && (
            <span className="text-xs font-mono text-app-text-muted">#{finalOrderNum}</span>
          )}
        </div>
        {finalTable && (
          <span className="text-xs sm:text-sm text-app-text-muted">
            {t('tableLabel', { table: finalTable })}
          </span>
        )}
      </header>

      {/* ━━━ MAIN -- 2 columns on md+, payment-only on mobile ━━━ */}
      <div className="flex-1 min-h-0 flex flex-col @md:grid @md:grid-cols-2 overflow-hidden">
        {/* ━━━ LEFT: Receipt (hidden on mobile) ━━━ */}
        <div className="hidden @md:flex flex-col border-r border-app-border overflow-y-auto p-5 lg:p-6">
          {/* Hero: Pay Amount */}
          <div className="mb-4">
            <p className="text-xs font-medium uppercase tracking-widest text-app-text-muted mb-1">
              {t('amountToPay')}
            </p>
            <p className="text-2xl sm:text-3xl lg:text-5xl font-bold text-app-text tabular-nums tracking-tight">
              {formatCurrency(totalWithTip, currency)}
            </p>
            {tipAmount > 0 && (
              <p className="mt-1 text-xs text-app-text-muted">
                {t('tipAmount', { amount: formatCurrency(tipAmount, currency) })}
              </p>
            )}
          </div>

          {/* Cart Items Receipt */}
          {cartItems && cartItems.length > 0 && (
            <div className="border-t border-app-border py-3 space-y-2 mb-3">
              {cartItems.map((item, idx) => (
                <div key={idx} className="flex justify-between items-start gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-app-text text-xs">{item.name}</span>
                      {item.quantity > 1 && (
                        <span className="text-app-text-muted font-mono text-[10px]">
                          &times;{item.quantity}
                        </span>
                      )}
                    </div>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <p className="text-[10px] text-app-text-muted mt-0.5">
                        {item.modifiers.join(', ')}
                      </p>
                    )}
                  </div>
                  <span className="text-app-text-secondary tabular-nums font-mono text-xs shrink-0">
                    {formatCurrency(item.price * item.quantity, currency)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between border-t border-app-border pt-2 text-sm font-bold text-app-text">
                <span>{t('total')}</span>
                <span className="tabular-nums font-mono">
                  {formatCurrency(finalTotal, currency)}
                </span>
              </div>
            </div>
          )}

          {/* Order Breakdown (admin view) */}
          {hasBreakdown && (
            <div className="space-y-1.5 border-t border-app-border py-3 text-sm mb-3">
              <div className="flex justify-between text-app-text-secondary text-xs">
                <span>{t('subtotal')}</span>
                <span className="tabular-nums font-mono">
                  {formatCurrency(subtotal!, currency)}
                </span>
              </div>
              {taxAmount !== undefined && taxAmount !== null && taxAmount > 0 && (
                <div className="flex justify-between text-app-text-secondary text-xs">
                  <span>{t('taxes')}</span>
                  <span className="tabular-nums font-mono">
                    {formatCurrency(taxAmount, currency)}
                  </span>
                </div>
              )}
              {serviceChargeAmount !== undefined &&
                serviceChargeAmount !== null &&
                serviceChargeAmount > 0 && (
                  <div className="flex justify-between text-app-text-secondary text-xs">
                    <span>{t('service')}</span>
                    <span className="tabular-nums font-mono">
                      {formatCurrency(serviceChargeAmount, currency)}
                    </span>
                  </div>
                )}
              {discountAmount !== undefined && discountAmount !== null && discountAmount > 0 && (
                <div className="flex justify-between text-emerald-400 text-xs">
                  <span>{t('discount')}</span>
                  <span className="tabular-nums font-mono">
                    -{formatCurrency(discountAmount, currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-app-border pt-2 font-bold text-app-text text-sm">
                <span>{t('total')}</span>
                <span className="tabular-nums font-mono">
                  {formatCurrency(finalTotal, currency)}
                </span>
              </div>
            </div>
          )}

          {/* Tip Selection -- pushed to bottom */}
          <div className="space-y-2 mt-auto">
            <p className="text-xs font-medium uppercase tracking-widest text-app-text-muted">
              {t('tip')}
            </p>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                onClick={() => {
                  setTipFixed(0);
                  setShowCustomTip(false);
                  setCustomTip('');
                }}
                className={cn(
                  'flex-1 rounded-lg py-2 min-h-[40px] text-xs font-bold',
                  !showCustomTip && tipFixed === 0
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-app-border bg-app-elevated/30 text-app-text-secondary hover:bg-app-elevated/60',
                )}
              >
                0
              </Button>
              {TIP_AMOUNTS.map((amount) => (
                <Button
                  key={amount}
                  variant="outline"
                  onClick={() => {
                    setTipFixed(amount);
                    setShowCustomTip(false);
                    setCustomTip('');
                  }}
                  className={cn(
                    'flex-1 rounded-lg py-2 min-h-[40px] text-xs font-bold tabular-nums',
                    !showCustomTip && tipFixed === amount
                      ? 'border-accent/40 bg-accent/10 text-accent'
                      : 'border-app-border bg-app-elevated/30 text-app-text-secondary hover:bg-app-elevated/60',
                  )}
                >
                  {amount.toLocaleString()}
                </Button>
              ))}
              <Button
                variant="outline"
                onClick={() => {
                  setShowCustomTip(true);
                  setTipFixed(0);
                }}
                className={cn(
                  'flex-1 rounded-lg py-2 min-h-[40px] text-xs font-bold',
                  showCustomTip
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-app-border bg-app-elevated/30 text-app-text-secondary hover:bg-app-elevated/60',
                )}
              >
                {t('customTip')}
              </Button>
            </div>
            {showCustomTip && (
              <Input
                type="number"
                placeholder="0"
                value={customTip}
                onChange={(e) => setCustomTip(e.target.value)}
                className="w-full rounded-lg border border-app-border bg-app-elevated/30 px-3 py-2 text-base font-bold text-app-text placeholder:text-app-text-muted outline-none focus:border-accent/30"
              />
            )}
          </div>
        </div>

        {/* ━━━ RIGHT: Payment Input (full width on mobile) ━━━ */}
        <div className="flex-1 flex flex-col overflow-y-auto min-h-0 p-3 sm:p-4 lg:p-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {/* Mobile: compact summary (hidden on desktop) */}
          <div className="flex items-center justify-between mb-3 @md:hidden shrink-0">
            <p className="text-xs font-medium uppercase tracking-widest text-app-text-muted">
              {t('amountToPay')}
            </p>
            <p className="text-xl sm:text-2xl font-bold text-app-text tabular-nums">
              {formatCurrency(totalWithTip, currency)}
            </p>
          </div>

          {/* Payment Method -- compact row */}
          <div className="grid grid-cols-3 gap-1.5 mb-3 shrink-0">
            {(
              [
                { key: 'cash' as const, icon: Banknote, label: t('cash') },
                { key: 'card' as const, icon: CreditCard, label: t('card') },
                { key: 'mobile_money' as const, icon: Coins, label: t('mobile') },
              ] as const
            ).map((pm) => (
              <Button
                key={pm.key}
                variant="outline"
                onClick={() => setMethod(pm.key)}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg p-2 min-h-[44px]',
                  method === pm.key
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-app-border bg-app-elevated/30 text-app-text-muted hover:bg-app-elevated/60 hover:text-app-text-secondary',
                )}
              >
                <pm.icon className="h-4 w-4" />
                <span className="text-xs font-medium">{pm.label}</span>
              </Button>
            ))}
          </div>

          {/* Mobile: inline tip row (hidden on desktop where tips are in left col) */}
          <div className="flex gap-1.5 mb-3 @md:hidden shrink-0">
            <Button
              variant="outline"
              onClick={() => {
                setTipFixed(0);
                setShowCustomTip(false);
                setCustomTip('');
              }}
              className={cn(
                'flex-1 rounded-lg py-1.5 min-h-[36px] text-[10px] font-bold',
                !showCustomTip && tipFixed === 0
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-app-border bg-app-elevated/30 text-app-text-secondary',
              )}
            >
              0
            </Button>
            {TIP_AMOUNTS.map((amount) => (
              <Button
                key={amount}
                variant="outline"
                onClick={() => {
                  setTipFixed(amount);
                  setShowCustomTip(false);
                  setCustomTip('');
                }}
                className={cn(
                  'flex-1 rounded-lg py-1.5 min-h-[36px] text-[10px] font-bold tabular-nums',
                  !showCustomTip && tipFixed === amount
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-app-border bg-app-elevated/30 text-app-text-secondary',
                )}
              >
                {amount.toLocaleString()}
              </Button>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                setShowCustomTip(true);
                setTipFixed(0);
              }}
              className={cn(
                'flex-1 rounded-lg py-1.5 min-h-[36px] text-[10px] font-bold',
                showCustomTip
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-app-border bg-app-elevated/30 text-app-text-secondary',
              )}
            >
              {t('customTip')}
            </Button>
          </div>

          {/* Cash: received, change, shortcuts, numpad, validate */}
          {method === 'cash' && (
            <div className="flex-1 min-h-0 flex flex-col gap-2 sm:gap-3">
              <div className="grid grid-cols-2 gap-2 shrink-0">
                <div className="rounded-xl border border-app-border bg-app-elevated/40 p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-app-text-muted">
                    {t('received')}
                  </p>
                  <p className="mt-1 text-xl sm:text-2xl font-bold text-app-text tabular-nums leading-none">
                    {formatCurrency(receivedAmount, currency)}
                  </p>
                  {!cashIsValid && amountRemaining > 0 && (
                    <p className="mt-1.5 text-[10px] font-medium text-amber-500">
                      {t('amountRemaining', { amount: formatCurrency(amountRemaining, currency) })}
                    </p>
                  )}
                </div>
                <div
                  className={cn(
                    'rounded-xl border p-3 text-center',
                    cashIsValid && change > 0
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : 'border-app-border bg-app-elevated/40',
                  )}
                >
                  <p
                    className={cn(
                      'text-[10px] font-semibold uppercase tracking-widest',
                      cashIsValid && change > 0 ? 'text-emerald-500' : 'text-app-text-muted',
                    )}
                  >
                    {t('change')}
                  </p>
                  <p
                    className={cn(
                      'mt-1 text-xl sm:text-2xl font-bold tabular-nums leading-none',
                      cashIsValid && change > 0 ? 'text-emerald-500' : 'text-app-text',
                    )}
                  >
                    {formatCurrency(change, currency)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={setExactCashAmount}
                  className="min-h-[44px] rounded-lg border-accent/40 bg-accent/10 text-accent text-xs font-bold px-3"
                >
                  {t('exactAmount')}
                </Button>
                {CASH_QUICK_ADD.map((increment) => (
                  <Button
                    key={increment}
                    type="button"
                    variant="outline"
                    onClick={() => addCashAmount(increment)}
                    className="min-h-[44px] rounded-lg border-app-border bg-app-elevated/30 text-xs font-bold tabular-nums px-3"
                  >
                    <Plus className="w-3 h-3 mr-0.5 opacity-70" />
                    {t('quickAdd', { amount: increment.toLocaleString() })}
                  </Button>
                ))}
              </div>

              <div className="grid grid-cols-4 gap-1.5 sm:gap-2 shrink-0">
                {NUMPAD_KEYS.map((key) => (
                  <Button
                    key={key}
                    type="button"
                    variant="outline"
                    onClick={() => handleKeypadPress(key)}
                    className={cn(
                      'flex items-center justify-center rounded-xl border-app-border bg-app-elevated/50 min-h-[48px] sm:min-h-[52px] text-lg sm:text-xl font-bold text-app-text active:scale-95 touch-manipulation hover:bg-app-elevated',
                      key === 'C' && 'text-red-400',
                      key === '⌫' && 'text-amber-400',
                      key === '0' && 'col-span-2',
                    )}
                    aria-label={
                      key === 'C' ? t('numpadClear') : key === '⌫' ? t('numpadBackspace') : key
                    }
                  >
                    {key === 'C' ? (
                      <X className="h-5 w-5" />
                    ) : key === '⌫' ? (
                      <Delete className="h-5 w-5" />
                    ) : (
                      key
                    )}
                  </Button>
                ))}
              </div>

              <Button
                type="button"
                variant="default"
                onClick={handleProcessPayment}
                disabled={!cashIsValid || isProcessing}
                className={cn(
                  'w-full min-h-[52px] rounded-xl text-base font-bold shrink-0 touch-manipulation',
                  cashIsValid ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'opacity-60',
                )}
              >
                {isProcessing ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Check className="mr-2 h-5 w-5" />
                )}
                {t('validatePayment')}
              </Button>
            </div>
          )}

          {/* Card/Mobile: Centered confirmation area */}
          {method !== 'cash' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-app-elevated/30 border border-app-border flex items-center justify-center mb-3">
                {method === 'card' ? (
                  <CreditCard className="w-6 h-6 sm:w-8 sm:h-8 text-app-text-secondary" />
                ) : (
                  <Coins className="w-6 h-6 sm:w-8 sm:h-8 text-app-text-secondary" />
                )}
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-app-text tabular-nums mb-1">
                {formatCurrency(totalWithTip, currency)}
              </p>
              <p className="text-xs text-app-text-muted">
                {method === 'card' ? t('card') : t('mobile')}
              </p>
            </div>
          )}

          {/* Action Buttons -- card/mobile; cash uses validate button above */}
          <div
            className={cn(
              'flex gap-2 shrink-0 mt-auto pt-2 border-t border-app-border',
              method === 'cash' && '@md:border-t-0 @md:pt-0',
            )}
          >
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isProcessing}
              className={cn('rounded-xl min-h-[44px]', method === 'cash' ? 'flex-1' : '')}
            >
              {t('cancel')}
            </Button>
            {method !== 'cash' && (
              <Button
                variant="default"
                onClick={handleProcessPayment}
                disabled={!isValid() || isProcessing}
                className="flex-1 rounded-xl py-2.5 min-h-[44px] text-sm font-bold"
              >
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('confirmPayment')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
