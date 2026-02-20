'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Coins, CreditCard, Banknote, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils/currency';
import { useToast } from '@/components/ui/use-toast';
import type { Order } from '@/types/admin.types';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  order?: Order;
  total?: number;
  tableNumber?: string;
  orderNumber?: number;
  onSuccess: () => void;
}

type PaymentMethod = 'cash' | 'card' | 'mobile_money';

const TIP_PERCENTAGES = [5, 10, 15] as const;
const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '00', 'C'] as const;

export default function PaymentModal({
  isOpen,
  onClose,
  order,
  total,
  tableNumber,
  orderNumber,
  onSuccess,
}: PaymentModalProps) {
  const t = useTranslations('payment');

  const finalTotal = total ?? order?.total_price ?? 0;
  const finalTable = tableNumber ?? order?.table_number ?? t('unknownTable');
  const finalOrderNum = orderNumber ?? (order ? parseInt(order.id.slice(0, 4), 16) : undefined);

  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Tip state
  const [tipPercent, setTipPercent] = useState<number | null>(0);
  const [customTip, setCustomTip] = useState<string>('');
  const [showCustomTip, setShowCustomTip] = useState(false);

  const { toast } = useToast();

  // Compute tip amount and total with tip
  const tipAmount = useMemo(() => {
    if (showCustomTip) {
      return parseFloat(customTip) || 0;
    }
    if (tipPercent !== null) {
      return Math.round((finalTotal * tipPercent) / 100);
    }
    return 0;
  }, [finalTotal, tipPercent, customTip, showCustomTip]);

  const totalWithTip = useMemo(() => finalTotal + tipAmount, [finalTotal, tipAmount]);

  // Change calculation based on totalWithTip
  const change = useMemo(() => {
    const received = parseFloat(amountReceived) || 0;
    return Math.max(0, received - totalWithTip);
  }, [amountReceived, totalWithTip]);

  const resetForm = () => {
    setAmountReceived('');
    setMethod('cash');
    setTipPercent(0);
    setCustomTip('');
    setShowCustomTip(false);
  };

  // Numeric keypad handler
  const handleKeypadPress = useCallback((key: string) => {
    if (key === 'C') {
      setAmountReceived('');
    } else {
      setAmountReceived((prev) => prev + key);
    }
  }, []);

  const handleProcessPayment = async () => {
    if (!finalTable || finalTable === t('unknownTable')) {
      toast({
        title: t('tableRequired'),
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);

    try {
      // If we have an order object, update it in the database
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
          toast({
            title: t('paymentError'),
            description: error.message,
            variant: 'destructive',
          });
          setIsProcessing(false);
          return;
        }
      }

      toast({ title: t('paymentSuccess') });
      setIsProcessing(false);
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : undefined;
      toast({
        title: t('paymentError'),
        description: message,
        variant: 'destructive',
      });
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

  // Price breakdown values
  const subtotal = order?.subtotal;
  const taxAmount = order?.tax_amount;
  const serviceChargeAmount = order?.service_charge_amount;
  const discountAmount = order?.discount_amount;
  const hasBreakdown = subtotal !== undefined && subtotal !== null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (open) {
          resetForm();
        } else {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl p-0">
        <DialogHeader className="border-b border-neutral-100 px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            {t('title')}
            {finalOrderNum && <span className="text-neutral-400">#{finalOrderNum}</span>}
            {finalTable && (
              <span className="text-sm font-normal text-neutral-500">
                {t('tableLabel', { table: finalTable })}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {/* ─── Left Column: Receipt / Summary ─── */}
          <div className="border-r border-neutral-100 p-6 space-y-4">
            {/* Price Breakdown */}
            {hasBreakdown && (
              <div className="space-y-2 rounded-lg border border-neutral-100 bg-neutral-50 p-4 text-sm">
                <div className="flex justify-between text-neutral-600">
                  <span>{t('subtotal')}</span>
                  <span>{formatCurrency(subtotal!, 'XAF')}</span>
                </div>
                {taxAmount !== undefined && taxAmount !== null && taxAmount > 0 && (
                  <div className="flex justify-between text-neutral-600">
                    <span>{t('taxes')}</span>
                    <span>{formatCurrency(taxAmount, 'XAF')}</span>
                  </div>
                )}
                {serviceChargeAmount !== undefined &&
                  serviceChargeAmount !== null &&
                  serviceChargeAmount > 0 && (
                    <div className="flex justify-between text-neutral-600">
                      <span>{t('service')}</span>
                      <span>{formatCurrency(serviceChargeAmount, 'XAF')}</span>
                    </div>
                  )}
                {discountAmount !== undefined && discountAmount !== null && discountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>{t('discount')}</span>
                    <span>-{formatCurrency(discountAmount, 'XAF')}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-neutral-200 pt-2 font-bold text-neutral-900">
                  <span>{t('total')}</span>
                  <span>{formatCurrency(finalTotal, 'XAF')}</span>
                </div>
              </div>
            )}

            {/* Summary Display: Amount Due, Received, Change, Tip */}
            <div className="space-y-3 rounded-lg border border-neutral-100 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">{t('amountDue')}</span>
                <span className="font-bold text-neutral-900 tabular-nums">
                  {formatCurrency(totalWithTip, 'XAF')}
                </span>
              </div>

              {tipAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">{t('tip')}</span>
                  <span className="font-medium text-neutral-700 tabular-nums">
                    {formatCurrency(tipAmount, 'XAF')}
                  </span>
                </div>
              )}

              {method === 'cash' && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-500">{t('received')}</span>
                    <span className="font-bold text-neutral-900 tabular-nums">
                      {amountReceived
                        ? formatCurrency(parseFloat(amountReceived) || 0, 'XAF')
                        : formatCurrency(0, 'XAF')}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-neutral-100 pt-2 text-sm">
                    <span className="text-neutral-500">{t('change')}</span>
                    <span
                      className={cn(
                        'font-bold tabular-nums',
                        change > 0 ? 'text-green-600' : 'text-neutral-400',
                      )}
                    >
                      {formatCurrency(change, 'XAF')}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Tip Selection */}
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                {t('tip')}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTipPercent(0);
                    setShowCustomTip(false);
                    setCustomTip('');
                  }}
                  className={cn(
                    'flex-1 rounded-lg border py-2 text-sm font-bold transition-all',
                    !showCustomTip && tipPercent === 0
                      ? 'border-[#CCFF00] bg-[#CCFF00]/10 text-neutral-900'
                      : 'border-neutral-100 bg-white text-neutral-600 hover:bg-neutral-50',
                  )}
                >
                  0%
                </button>
                {TIP_PERCENTAGES.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      setTipPercent(pct);
                      setShowCustomTip(false);
                      setCustomTip('');
                    }}
                    className={cn(
                      'flex-1 rounded-lg border py-2 text-sm font-bold transition-all',
                      !showCustomTip && tipPercent === pct
                        ? 'border-[#CCFF00] bg-[#CCFF00]/10 text-neutral-900'
                        : 'border-neutral-100 bg-white text-neutral-600 hover:bg-neutral-50',
                    )}
                  >
                    {pct}%
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomTip(true);
                    setTipPercent(null);
                  }}
                  className={cn(
                    'flex-1 rounded-lg border py-2 text-sm font-bold transition-all',
                    showCustomTip
                      ? 'border-[#CCFF00] bg-[#CCFF00]/10 text-neutral-900'
                      : 'border-neutral-100 bg-white text-neutral-600 hover:bg-neutral-50',
                  )}
                >
                  {t('customTip')}
                </button>
              </div>
              {showCustomTip && (
                <Input
                  type="number"
                  placeholder="0"
                  value={customTip}
                  onChange={(e) => setCustomTip(e.target.value)}
                  className="rounded-lg text-lg font-bold animate-in fade-in slide-in-from-top-2"
                />
              )}
            </div>

            {/* Payment Method Selection */}
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                {t('paymentMethod')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setMethod('cash')}
                  className={cn(
                    'flex flex-col items-center justify-center rounded-lg border p-3 transition-all hover:bg-accent',
                    method === 'cash'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-neutral-100 bg-white text-muted-foreground',
                  )}
                >
                  <Banknote className="mb-1 h-5 w-5" />
                  <span className="text-xs font-medium">{t('cash')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod('card')}
                  className={cn(
                    'flex flex-col items-center justify-center rounded-lg border p-3 transition-all hover:bg-accent',
                    method === 'card'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-neutral-100 bg-white text-muted-foreground',
                  )}
                >
                  <CreditCard className="mb-1 h-5 w-5" />
                  <span className="text-xs font-medium">{t('card')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod('mobile_money')}
                  className={cn(
                    'flex flex-col items-center justify-center rounded-lg border p-3 transition-all hover:bg-accent',
                    method === 'mobile_money'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-neutral-100 bg-white text-muted-foreground',
                  )}
                >
                  <Coins className="mb-1 h-5 w-5" />
                  <span className="text-xs font-medium">{t('mobile')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* ─── Right Column: Numpad + Confirm ─── */}
          <div className="flex flex-col p-6">
            {/* Amount Due display */}
            <div className="mb-4 rounded-lg border border-neutral-100 bg-neutral-50 p-4 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                {tipAmount > 0 ? t('totalWithTip') : t('amountToPay')}
              </p>
              <p className="text-3xl font-black text-neutral-900 tabular-nums">
                {formatCurrency(totalWithTip, 'XAF')}
              </p>
              {tipAmount > 0 && (
                <p className="mt-1 text-xs text-neutral-400">
                  {t('tipAmount', { amount: formatCurrency(tipAmount, 'XAF') })}
                </p>
              )}
            </div>

            {/* Cash: Received amount display */}
            {method === 'cash' && (
              <div className="mb-4 rounded-lg border border-neutral-100 bg-white p-3 text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  {t('received')}
                </p>
                <p className="text-2xl font-black text-neutral-900 tabular-nums">
                  {amountReceived
                    ? formatCurrency(parseFloat(amountReceived) || 0, 'XAF')
                    : formatCurrency(0, 'XAF')}
                </p>
              </div>
            )}

            {/* Numpad (3x4 grid) */}
            {method === 'cash' && (
              <div className="mb-4 grid grid-cols-3 gap-2">
                {NUMPAD_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleKeypadPress(key)}
                    className={cn(
                      'flex items-center justify-center rounded-lg border border-neutral-100 bg-white py-3 text-lg font-bold transition-all active:scale-95 hover:bg-neutral-50',
                      key === 'C' && 'text-red-500',
                    )}
                    aria-label={key === 'C' ? t('numpadClear') : key}
                  >
                    {key === 'C' ? <X className="h-5 w-5" /> : key}
                  </button>
                ))}
              </div>
            )}

            {/* Cash: Change display */}
            {method === 'cash' && (
              <div
                className={cn(
                  'mb-4 rounded-lg border p-3 text-center',
                  change > 0
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-neutral-100 bg-neutral-50 text-neutral-400',
                )}
              >
                <p className="text-xs font-medium uppercase tracking-wide">{t('change')}</p>
                <p className="text-xl font-bold tabular-nums">{formatCurrency(change, 'XAF')}</p>
              </div>
            )}

            {/* Spacer to push buttons to bottom */}
            <div className="flex-1" />

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isProcessing}
                className="rounded-lg"
              >
                {t('cancel')}
              </Button>
              <Button
                variant="lime"
                onClick={handleProcessPayment}
                disabled={!isValid() || isProcessing}
                className="flex-1 rounded-lg"
              >
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('confirmPayment')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
