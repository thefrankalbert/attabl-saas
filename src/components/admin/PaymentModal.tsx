'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Coins, CreditCard, Banknote, Delete } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const TIP_PERCENTAGES = [0, 5, 10, 15] as const;

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
  const finalOrderNum = orderNumber ?? (order ? parseInt(order.id.slice(0, 4), 16) : undefined); // rudimentary fallback

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

  // Numeric keypad handlers
  const handleKeypadPress = (key: string) => {
    setAmountReceived((prev) => prev + key);
  };

  const handleKeypadBackspace = () => {
    setAmountReceived((prev) => prev.slice(0, -1));
  };

  const handleProcessPayment = async () => {
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('title')}
            {finalOrderNum && <span className="ml-2 text-neutral-400">#{finalOrderNum}</span>}
            {finalTable && (
              <span className="ml-2 block text-sm font-normal text-neutral-500">
                {t('tableLabel', { table: finalTable })}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Price Breakdown */}
          {hasBreakdown && (
            <div className="space-y-2 p-3 bg-neutral-50 rounded-lg border border-neutral-100 text-sm">
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
              <div className="border-t border-neutral-200 pt-2 flex justify-between font-bold text-neutral-900">
                <span>{t('total')}</span>
                <span>{formatCurrency(finalTotal, 'XAF')}</span>
              </div>
            </div>
          )}

          {/* Total */}
          <div className="text-center p-4 bg-neutral-50 rounded-xl border border-neutral-100">
            <p className="text-sm text-neutral-500 uppercase font-medium">
              {tipAmount > 0 ? t('totalWithTip') : t('amountToPay')}
            </p>
            <p className="text-4xl font-black text-neutral-900">
              {formatCurrency(totalWithTip, 'XAF')}
            </p>
            {tipAmount > 0 && (
              <p className="text-sm text-neutral-400 mt-1">
                {t('tipAmount', { amount: formatCurrency(tipAmount, 'XAF') })}
              </p>
            )}
          </div>

          {/* Tip Selection */}
          <div className="space-y-3">
            <Label>{t('tip')}</Label>
            <div className="flex gap-2">
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
                    'flex-1 rounded-xl border-2 py-2 text-sm font-bold transition-all',
                    !showCustomTip && tipPercent === pct
                      ? 'border-[#CCFF00] bg-[#CCFF00]/10 text-neutral-900'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50',
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
                  'flex-1 rounded-xl border-2 py-2 text-sm font-bold transition-all',
                  showCustomTip
                    ? 'border-[#CCFF00] bg-[#CCFF00]/10 text-neutral-900'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50',
                )}
              >
                {t('tipCustom')}
              </button>
            </div>
            {showCustomTip && (
              <Input
                type="number"
                placeholder="0"
                value={customTip}
                onChange={(e) => setCustomTip(e.target.value)}
                className="text-lg font-bold animate-in fade-in slide-in-from-top-2"
              />
            )}
          </div>

          {/* Method Selection */}
          <div className="space-y-3">
            <Label>{t('paymentMethod')}</Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMethod('cash')}
                className={cn(
                  'flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-all hover:bg-accent',
                  method === 'cash'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-muted bg-popover text-muted-foreground',
                )}
              >
                <Banknote className="mb-2 h-6 w-6" />
                <span className="text-sm font-medium">{t('cash')}</span>
              </button>

              <button
                type="button"
                onClick={() => setMethod('card')}
                className={cn(
                  'flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-all hover:bg-accent',
                  method === 'card'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-muted bg-popover text-muted-foreground',
                )}
              >
                <CreditCard className="mb-2 h-6 w-6" />
                <span className="text-sm font-medium">{t('card')}</span>
              </button>

              <button
                type="button"
                onClick={() => setMethod('mobile_money')}
                className={cn(
                  'flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-all hover:bg-accent',
                  method === 'mobile_money'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-muted bg-popover text-muted-foreground',
                )}
              >
                <Coins className="mb-2 h-6 w-6" />
                <span className="text-sm font-medium">{t('mobile')}</span>
              </button>
            </div>
          </div>

          {/* Cash Details with Numeric Keypad */}
          {method === 'cash' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
              {/* Amount display */}
              <div className="space-y-2">
                <Label>{t('receipt')}</Label>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-center">
                  <p className="text-3xl font-black text-neutral-900 tabular-nums">
                    {amountReceived
                      ? formatCurrency(parseFloat(amountReceived) || 0, 'XAF')
                      : formatCurrency(0, 'XAF')}
                  </p>
                </div>
              </div>

              {/* Numeric Keypad */}
              <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '00'].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleKeypadPress(key)}
                    className="rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-lg font-bold py-3 transition-all active:scale-95"
                  >
                    {key}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleKeypadBackspace}
                  className="rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-lg font-bold py-3 transition-all active:scale-95 flex items-center justify-center"
                  aria-label={t('backspace')}
                >
                  <Delete className="h-5 w-5" />
                </button>
              </div>

              {/* Change display */}
              <div className="space-y-2">
                <Label>{t('change')}</Label>
                <div
                  className={cn(
                    'rounded-xl border p-3 text-center text-lg font-bold',
                    change > 0
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-neutral-100 text-neutral-400 border-neutral-200',
                  )}
                >
                  {formatCurrency(change, 'XAF')}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            {t('cancel')}
          </Button>
          <Button
            variant="lime"
            onClick={handleProcessPayment}
            disabled={!isValid() || isProcessing}
            className="w-full sm:w-auto"
          >
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('confirmPayment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
