'use client';

import { useState, useCallback } from 'react';
import { Loader2, Coins, CreditCard, Banknote } from 'lucide-react';
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

export default function PaymentModal({
  isOpen,
  onClose,
  order,
  total,
  tableNumber,
  orderNumber,
  onSuccess,
}: PaymentModalProps) {
  const finalTotal = total ?? order?.total_price ?? 0;
  const finalTable = tableNumber ?? order?.table_number ?? 'Inconnue';
  const finalOrderNum = orderNumber ?? (order ? parseInt(order.id.slice(0, 4), 16) : undefined); // rudimentary fallback

  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [change, setChange] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const { toast } = useToast();

  const resetForm = useCallback(() => {
    setAmountReceived('');
    setChange(0);
    setMethod('cash');
  }, []);

  const handleAmountChange = (val: string) => {
    setAmountReceived(val);
    const received = parseFloat(val) || 0;
    setChange(Math.max(0, received - finalTotal));
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
            title: 'Erreur lors du paiement',
            description: error.message,
            variant: 'destructive',
          });
          setIsProcessing(false);
          return;
        }
      }

      toast({ title: 'Paiement enregistr\u00e9 avec succ\u00e8s' });
      setIsProcessing(false);
      onSuccess();
    } catch {
      toast({ title: 'Erreur lors du paiement', variant: 'destructive' });
      setIsProcessing(false);
    }
  };

  const isValid = () => {
    if (method === 'cash') {
      const received = parseFloat(amountReceived) || 0;
      return received >= finalTotal;
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
            Encaissement
            {finalOrderNum && <span className="ml-2 text-neutral-400">#{finalOrderNum}</span>}
            {finalTable && (
              <span className="ml-2 block text-sm font-normal text-neutral-500">
                Table {finalTable}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Price Breakdown */}
          {hasBreakdown && (
            <div className="space-y-2 p-3 bg-neutral-50 rounded-lg border border-neutral-100 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Sous-total</span>
                <span>{formatCurrency(subtotal!, 'XAF')}</span>
              </div>
              {taxAmount !== undefined && taxAmount !== null && taxAmount > 0 && (
                <div className="flex justify-between text-neutral-600">
                  <span>Taxes</span>
                  <span>{formatCurrency(taxAmount, 'XAF')}</span>
                </div>
              )}
              {serviceChargeAmount !== undefined &&
                serviceChargeAmount !== null &&
                serviceChargeAmount > 0 && (
                  <div className="flex justify-between text-neutral-600">
                    <span>Service</span>
                    <span>{formatCurrency(serviceChargeAmount, 'XAF')}</span>
                  </div>
                )}
              {discountAmount !== undefined && discountAmount !== null && discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Remise</span>
                  <span>-{formatCurrency(discountAmount, 'XAF')}</span>
                </div>
              )}
              <div className="border-t border-neutral-200 pt-2 flex justify-between font-bold text-neutral-900">
                <span>Total</span>
                <span>{formatCurrency(finalTotal, 'XAF')}</span>
              </div>
            </div>
          )}

          {/* Total */}
          <div className="text-center p-4 bg-neutral-50 rounded-xl border border-neutral-100">
            <p className="text-sm text-neutral-500 uppercase font-medium">Montant \u00e0 payer</p>
            <p className="text-3xl font-black text-neutral-900">
              {formatCurrency(finalTotal, 'XAF')}
            </p>
          </div>

          {/* Method Selection */}
          <div className="space-y-3">
            <Label>Mode de paiement</Label>
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
                <span className="text-sm font-medium">Esp\u00e8ces</span>
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
                <span className="text-sm font-medium">Carte</span>
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
                <span className="text-sm font-medium">Mobile</span>
              </button>
            </div>
          </div>
          {/* Cash Details */}
          {method === 'cash' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="received">Re\u00e7u</Label>
                  <Input
                    id="received"
                    type="number"
                    placeholder="0"
                    value={amountReceived}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    className="text-lg font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rendu</Label>
                  <div
                    className={cn(
                      'flex h-10 w-full rounded-md border border-input px-3 py-2 text-lg font-bold ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                      change > 0
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-neutral-100 text-neutral-400',
                    )}
                  >
                    {formatCurrency(change, 'XAF')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            Annuler
          </Button>
          <Button
            onClick={handleProcessPayment}
            disabled={!isValid() || isProcessing}
            className="w-full sm:w-auto"
          >
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmer l&apos;encaissement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
