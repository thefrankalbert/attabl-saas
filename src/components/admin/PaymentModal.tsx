'use client';

import { useState, useEffect } from 'react';
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

export default function PaymentModal({ isOpen, onClose, order, total, tableNumber, orderNumber, onSuccess }: PaymentModalProps) {
    const finalTotal = total ?? order?.total_price ?? 0;
    const finalTable = tableNumber ?? order?.table_number ?? 'Inconnue';
    const finalOrderNum = orderNumber ?? (order ? parseInt(order.id.slice(0, 4), 16) : undefined); // rudimentary fallback

    const [method, setMethod] = useState<PaymentMethod>('cash');
    const [amountReceived, setAmountReceived] = useState<string>('');
    const [change, setChange] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setAmountReceived('');
            setChange(0);
            setMethod('cash');
        }
    }, [isOpen]);

    const handleAmountChange = (val: string) => {
        setAmountReceived(val);
        const received = parseFloat(val) || 0;
        setChange(Math.max(0, received - finalTotal));
    };

    const handleProcessPayment = async () => {
        setIsProcessing(true);
        // Simulate API call
        setTimeout(() => {
            setIsProcessing(false);
            onSuccess();
        }, 1500);
    };

    const isValid = () => {
        if (method === 'cash') {
            const received = parseFloat(amountReceived) || 0;
            return received >= finalTotal;
        }
        return true;
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        Encaissement
                        {finalOrderNum && <span className="ml-2 text-gray-400">#{finalOrderNum}</span>}
                        {finalTable && <span className="ml-2 block text-sm font-normal text-gray-500">Table {finalTable}</span>}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Total */}
                    <div className="text-center p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <p className="text-sm text-gray-500 uppercase font-medium">Montant à payer</p>
                        <p className="text-3xl font-black text-gray-900">{finalTotal.toLocaleString()} FCFA</p>
                    </div>

                    {/* Method Selection */}
                    <div className="space-y-3">
                        <Label>Mode de paiement</Label>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                type="button"
                                onClick={() => setMethod('cash')}
                                className={cn(
                                    "flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-all hover:bg-accent",
                                    method === 'cash'
                                        ? "border-primary bg-primary/5 text-primary"
                                        : "border-muted bg-popover text-muted-foreground"
                                )}
                            >
                                <Banknote className="mb-2 h-6 w-6" />
                                <span className="text-sm font-medium">Espèces</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setMethod('card')}
                                className={cn(
                                    "flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-all hover:bg-accent",
                                    method === 'card'
                                        ? "border-primary bg-primary/5 text-primary"
                                        : "border-muted bg-popover text-muted-foreground"
                                )}
                            >
                                <CreditCard className="mb-2 h-6 w-6" />
                                <span className="text-sm font-medium">Carte</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setMethod('mobile_money')}
                                className={cn(
                                    "flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-all hover:bg-accent",
                                    method === 'mobile_money'
                                        ? "border-primary bg-primary/5 text-primary"
                                        : "border-muted bg-popover text-muted-foreground"
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
                                    <Label htmlFor="received">Reçu</Label>
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
                                    <div className={cn(
                                        "flex h-10 w-full rounded-md border border-input px-3 py-2 text-lg font-bold ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                                        change > 0 ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-400"
                                    )}>
                                        {change.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose} disabled={isProcessing}>Annuler</Button>
                    <Button onClick={handleProcessPayment} disabled={!isValid() || isProcessing} className="w-full sm:w-auto">
                        {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirmer l&apos;encaissement
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
