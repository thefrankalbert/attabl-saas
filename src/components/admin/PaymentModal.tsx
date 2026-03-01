'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Coins, CreditCard, Banknote, X, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
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

interface PaymentModalProps {
  onClose: () => void;
  order?: Order;
  total?: number;
  tableNumber?: string;
  orderNumber?: number;
  onSuccess: () => void;
  cartItems?: CartDisplayItem[];
  currency?: CurrencyCode;
}

type PaymentMethod = 'cash' | 'card' | 'mobile_money';

const TIP_AMOUNTS = [1000, 2000, 5000] as const;
const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '00', 'C'] as const;

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
}: PaymentModalProps) {
  const t = useTranslations('payment');

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

  const change = useMemo(() => {
    const received = parseFloat(amountReceived) || 0;
    return Math.max(0, received - totalWithTip);
  }, [amountReceived, totalWithTip]);

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
    } else {
      setAmountReceived((prev) => prev + key);
    }
  }, []);

  const handleProcessPayment = async () => {
    if (!finalTable || finalTable === t('unknownTable')) {
      toast({ title: t('tableRequired'), variant: 'destructive' });
      return;
    }

    setIsProcessing(true);

    try {
      if (order?.id) {
        const supabase = createClient();
        const { error } = await supabase
          .from('orders')
          .update({
            payment_method: method,
            payment_status: 'paid',
            paid_at: new Date().toISOString(),
            status: 'delivered',
          })
          .eq('id', order.id);

        if (error) {
          toast({ title: t('paymentError'), description: error.message, variant: 'destructive' });
          setIsProcessing(false);
          return;
        }
      }

      toast({ title: t('paymentSuccess') });
      setIsProcessing(false);
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : undefined;
      toast({ title: t('paymentError'), description: message, variant: 'destructive' });
      setIsProcessing(false);
    }
  };

  const isValid = () => {
    if (method === 'cash') {
      const received = parseFloat(amountReceived) || 0;
      return received >= totalWithTip;
    }
    return true;
  };

  // Price breakdown from order (admin view)
  const subtotal = order?.subtotal;
  const taxAmount = order?.tax_amount;
  const serviceChargeAmount = order?.service_charge_amount;
  const discountAmount = order?.discount_amount;
  const hasBreakdown = subtotal !== undefined && subtotal !== null;

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950 text-white flex flex-col overflow-hidden animate-in fade-in duration-200">
      {/* ━━━ HEADER ━━━ */}
      <header className="h-12 border-b border-white/[0.06] flex items-center justify-between px-3 sm:px-5 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="p-2 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-secondary hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-sm sm:text-base">{t('title')}</h1>
          {finalOrderNum && (
            <span className="text-xs font-mono text-neutral-500">#{finalOrderNum}</span>
          )}
        </div>
        {finalTable && (
          <span className="text-xs sm:text-sm text-neutral-500">
            {t('tableLabel', { table: finalTable })}
          </span>
        )}
      </header>

      {/* ━━━ MAIN — 2 columns on md+, payment-only on mobile ━━━ */}
      <div className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-2 overflow-hidden">
        {/* ━━━ LEFT: Receipt (hidden on mobile) ━━━ */}
        <div className="hidden md:flex flex-col border-r border-white/[0.06] overflow-y-auto p-5 lg:p-6">
          {/* Hero: Pay Amount */}
          <div className="mb-4">
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-500 mb-1">
              {t('amountToPay')}
            </p>
            <p className="text-3xl lg:text-5xl font-bold text-white tabular-nums tracking-tight">
              {formatCurrency(totalWithTip, currency)}
            </p>
            {tipAmount > 0 && (
              <p className="mt-1 text-xs text-neutral-500">
                {t('tipAmount', { amount: formatCurrency(tipAmount, currency) })}
              </p>
            )}
          </div>

          {/* Cart Items Receipt */}
          {cartItems && cartItems.length > 0 && (
            <div className="border-t border-white/[0.06] py-3 space-y-2 mb-3">
              {cartItems.map((item, idx) => (
                <div key={idx} className="flex justify-between items-start gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-neutral-200 text-xs">{item.name}</span>
                      {item.quantity > 1 && (
                        <span className="text-neutral-500 font-mono text-[10px]">
                          &times;{item.quantity}
                        </span>
                      )}
                    </div>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <p className="text-[10px] text-neutral-600 mt-0.5">
                        {item.modifiers.join(', ')}
                      </p>
                    )}
                  </div>
                  <span className="text-neutral-300 tabular-nums font-mono text-xs shrink-0">
                    {formatCurrency(item.price * item.quantity, currency)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between border-t border-white/[0.06] pt-2 text-sm font-bold text-white">
                <span>{t('total')}</span>
                <span className="tabular-nums font-mono">
                  {formatCurrency(finalTotal, currency)}
                </span>
              </div>
            </div>
          )}

          {/* Order Breakdown (admin view) */}
          {hasBreakdown && (
            <div className="space-y-1.5 border-t border-white/[0.06] py-3 text-sm mb-3">
              <div className="flex justify-between text-neutral-400 text-xs">
                <span>{t('subtotal')}</span>
                <span className="tabular-nums font-mono">
                  {formatCurrency(subtotal!, currency)}
                </span>
              </div>
              {taxAmount !== undefined && taxAmount !== null && taxAmount > 0 && (
                <div className="flex justify-between text-neutral-400 text-xs">
                  <span>{t('taxes')}</span>
                  <span className="tabular-nums font-mono">
                    {formatCurrency(taxAmount, currency)}
                  </span>
                </div>
              )}
              {serviceChargeAmount !== undefined &&
                serviceChargeAmount !== null &&
                serviceChargeAmount > 0 && (
                  <div className="flex justify-between text-neutral-400 text-xs">
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
              <div className="flex justify-between border-t border-white/[0.06] pt-2 font-bold text-white text-sm">
                <span>{t('total')}</span>
                <span className="tabular-nums font-mono">
                  {formatCurrency(finalTotal, currency)}
                </span>
              </div>
            </div>
          )}

          {/* Tip Selection — pushed to bottom */}
          <div className="space-y-2 mt-auto">
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">
              {t('tip')}
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setTipFixed(0);
                  setShowCustomTip(false);
                  setCustomTip('');
                }}
                className={cn(
                  'flex-1 rounded-lg border py-2 min-h-[40px] text-xs font-bold transition-all',
                  !showCustomTip && tipFixed === 0
                    ? 'border-[#CCFF00]/40 bg-[#CCFF00]/10 text-[#CCFF00]'
                    : 'border-white/[0.08] bg-white/[0.03] text-neutral-400 hover:bg-white/[0.06]',
                )}
              >
                0
              </button>
              {TIP_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => {
                    setTipFixed(amount);
                    setShowCustomTip(false);
                    setCustomTip('');
                  }}
                  className={cn(
                    'flex-1 rounded-lg border py-2 min-h-[40px] text-xs font-bold transition-all tabular-nums',
                    !showCustomTip && tipFixed === amount
                      ? 'border-[#CCFF00]/40 bg-[#CCFF00]/10 text-[#CCFF00]'
                      : 'border-white/[0.08] bg-white/[0.03] text-neutral-400 hover:bg-white/[0.06]',
                  )}
                >
                  {amount.toLocaleString()}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setShowCustomTip(true);
                  setTipFixed(0);
                }}
                className={cn(
                  'flex-1 rounded-lg border py-2 min-h-[40px] text-xs font-bold transition-all',
                  showCustomTip
                    ? 'border-[#CCFF00]/40 bg-[#CCFF00]/10 text-[#CCFF00]'
                    : 'border-white/[0.08] bg-white/[0.03] text-neutral-400 hover:bg-white/[0.06]',
                )}
              >
                {t('customTip')}
              </button>
            </div>
            {showCustomTip && (
              <input
                type="number"
                placeholder="0"
                value={customTip}
                onChange={(e) => setCustomTip(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-base font-bold text-white placeholder:text-neutral-600 outline-none focus:border-[#CCFF00]/30"
              />
            )}
          </div>
        </div>

        {/* ━━━ RIGHT: Payment Input (full width on mobile) ━━━ */}
        <div className="flex-1 flex flex-col overflow-hidden p-3 sm:p-4 lg:p-5">
          {/* Mobile: compact summary (hidden on desktop) */}
          <div className="flex items-center justify-between mb-3 md:hidden shrink-0">
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">
              {t('amountToPay')}
            </p>
            <p className="text-2xl font-bold text-white tabular-nums">
              {formatCurrency(totalWithTip, currency)}
            </p>
          </div>

          {/* Payment Method — compact row */}
          <div className="grid grid-cols-3 gap-1.5 mb-3 shrink-0">
            {(
              [
                { key: 'cash' as const, icon: Banknote, label: t('cash') },
                { key: 'card' as const, icon: CreditCard, label: t('card') },
                { key: 'mobile_money' as const, icon: Coins, label: t('mobile') },
              ] as const
            ).map((pm) => (
              <button
                key={pm.key}
                type="button"
                onClick={() => setMethod(pm.key)}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg border p-2 min-h-[44px] transition-all',
                  method === pm.key
                    ? 'border-[#CCFF00]/40 bg-[#CCFF00]/10 text-[#CCFF00]'
                    : 'border-white/[0.08] bg-white/[0.03] text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-300',
                )}
              >
                <pm.icon className="h-4 w-4" />
                <span className="text-xs font-medium">{pm.label}</span>
              </button>
            ))}
          </div>

          {/* Mobile: inline tip row (hidden on desktop where tips are in left col) */}
          <div className="flex gap-1.5 mb-3 md:hidden shrink-0">
            <button
              type="button"
              onClick={() => {
                setTipFixed(0);
                setShowCustomTip(false);
                setCustomTip('');
              }}
              className={cn(
                'flex-1 rounded-lg border py-1.5 min-h-[36px] text-[10px] font-bold transition-all',
                !showCustomTip && tipFixed === 0
                  ? 'border-[#CCFF00]/40 bg-[#CCFF00]/10 text-[#CCFF00]'
                  : 'border-white/[0.08] bg-white/[0.03] text-neutral-400',
              )}
            >
              0
            </button>
            {TIP_AMOUNTS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => {
                  setTipFixed(amount);
                  setShowCustomTip(false);
                  setCustomTip('');
                }}
                className={cn(
                  'flex-1 rounded-lg border py-1.5 min-h-[36px] text-[10px] font-bold transition-all tabular-nums',
                  !showCustomTip && tipFixed === amount
                    ? 'border-[#CCFF00]/40 bg-[#CCFF00]/10 text-[#CCFF00]'
                    : 'border-white/[0.08] bg-white/[0.03] text-neutral-400',
                )}
              >
                {amount.toLocaleString()}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setShowCustomTip(true);
                setTipFixed(0);
              }}
              className={cn(
                'flex-1 rounded-lg border py-1.5 min-h-[36px] text-[10px] font-bold transition-all',
                showCustomTip
                  ? 'border-[#CCFF00]/40 bg-[#CCFF00]/10 text-[#CCFF00]'
                  : 'border-white/[0.08] bg-white/[0.03] text-neutral-400',
              )}
            >
              {t('customTip')}
            </button>
          </div>

          {/* Cash: Received amount */}
          {method === 'cash' && (
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2 sm:p-3 text-center mb-2 sm:mb-3 shrink-0">
              <p className="text-[10px] font-medium uppercase tracking-widest text-neutral-500">
                {t('received')}
              </p>
              <p className="text-xl sm:text-2xl font-bold text-white tabular-nums">
                {amountReceived
                  ? formatCurrency(parseFloat(amountReceived) || 0, currency)
                  : formatCurrency(0, currency)}
              </p>
            </div>
          )}

          {/* Cash: Numpad — fills available space */}
          {method === 'cash' && (
            <div className="flex-1 min-h-0 grid grid-cols-3 grid-rows-4 gap-1.5 sm:gap-2 mb-2 sm:mb-3">
              {NUMPAD_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleKeypadPress(key)}
                  className={cn(
                    'flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-lg sm:text-xl font-bold text-neutral-200 transition-all active:scale-95 hover:bg-white/[0.08]',
                    key === 'C' && 'text-red-400',
                  )}
                  aria-label={key === 'C' ? t('numpadClear') : key}
                >
                  {key === 'C' ? <X className="h-4 w-4 sm:h-5 sm:w-5" /> : key}
                </button>
              ))}
            </div>
          )}

          {/* Cash: Change */}
          {method === 'cash' && (
            <div
              className={cn(
                'rounded-lg border p-2 sm:p-3 text-center mb-2 sm:mb-3 shrink-0',
                change > 0
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-white/[0.06] bg-white/[0.03] text-neutral-600',
              )}
            >
              <p className="text-[10px] font-medium uppercase tracking-widest">{t('change')}</p>
              <p className="text-lg sm:text-xl font-bold tabular-nums">
                {formatCurrency(change, currency)}
              </p>
            </div>
          )}

          {/* Card/Mobile: Centered confirmation area */}
          {method !== 'cash' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-3">
                {method === 'card' ? (
                  <CreditCard className="w-6 h-6 sm:w-8 sm:h-8 text-neutral-400" />
                ) : (
                  <Coins className="w-6 h-6 sm:w-8 sm:h-8 text-neutral-400" />
                )}
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-white tabular-nums mb-1">
                {formatCurrency(totalWithTip, currency)}
              </p>
              <p className="text-xs text-neutral-500">
                {method === 'card' ? t('card') : t('mobile')}
              </p>
            </div>
          )}

          {/* Action Buttons — always pinned at bottom */}
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 min-h-[44px] text-sm font-medium text-neutral-400 hover:bg-white/[0.06] hover:text-white transition-all disabled:opacity-50"
            >
              {t('cancel')}
            </button>
            <Button
              variant="default"
              onClick={handleProcessPayment}
              disabled={!isValid() || isProcessing}
              className="flex-1 rounded-lg py-2.5 min-h-[44px] text-sm font-bold"
            >
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('confirmPayment')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
