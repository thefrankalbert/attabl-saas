'use client';

import { useState } from 'react';
import { Clock, Printer, Receipt, CreditCard, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import type { Order, OrderStatus } from '@/types/admin.types';
import PaymentModal from './PaymentModal';

interface OrderDetailsProps {
    order: Order;
    onClose: () => void;
    onUpdate: () => void;
}

export default function OrderDetails({ order, onClose, onUpdate }: OrderDetailsProps) {
    const [loading, setLoading] = useState(false);
    const [showPayment, setShowPayment] = useState(false);
    const { toast } = useToast();
    const supabase = createClient();

    const handleStatusUpdate = async (status: OrderStatus) => {
        setLoading(true);
        try {
            const { error } = await supabase.from('orders').update({ status }).eq('id', order.id);
            if (error) throw error;
            toast({ title: 'Statut mis à jour' });
            onUpdate();
            if (status === 'delivered') onClose();
        } catch {
            toast({ title: 'Erreur', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handlePrintKitchen = () => {
        toast({ title: 'Impression ticket cuisine...' });
        // TODO: Implement actual printing logic
    };

    const handlePrintReceipt = () => {
        toast({ title: 'Impression reçu client...' });
        // TODO: Implement actual printing logic
    };

    return (
        <>
            <div className="space-y-6">
                {/* Header Info */}
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h2 className="text-2xl font-bold">Table {order.table_number}</h2>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Clock className="w-4 h-4" />
                            {new Date(order.created_at).toLocaleString('fr-FR')}
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-medium text-gray-500 uppercase">Total</p>
                        <p className="text-2xl font-bold text-primary">{order.total_price.toLocaleString()} FCFA</p>
                    </div>
                </div>

                <div className="border-b border-gray-100" />

                {/* Items */}
                <div className="h-[300px] overflow-y-auto pr-4 custom-scrollbar">
                    <div className="space-y-4">
                        {(order.items || []).map((item, i) => (
                            <div key={i} className="flex justify-between items-start py-2">
                                <div className="flex gap-3">
                                    <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center text-xs font-bold">
                                        {item.quantity}
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm">{item.name}</p>
                                        {item.notes && <p className="text-xs text-red-500 mt-0.5">Note: {item.notes}</p>}
                                    </div>
                                </div>
                                <p className="font-medium text-sm">{(item.price * item.quantity).toLocaleString()} F</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="border-b border-gray-100" />

                {/* Status Actions */}
                <div className="grid grid-cols-2 gap-3">
                    {order.status !== 'delivered' && order.status !== 'cancelled' && (
                        <>
                            <Button variant="outline" onClick={() => handleStatusUpdate('pending')} disabled={loading || order.status === 'pending'}>
                                En attente
                            </Button>
                            <Button variant="outline" onClick={() => handleStatusUpdate('preparing')} disabled={loading || order.status === 'preparing'}>
                                En préparation
                            </Button>
                            <Button variant="outline" onClick={() => handleStatusUpdate('ready')} disabled={loading || order.status === 'ready'}>
                                Prêt à servir
                            </Button>
                            <Button onClick={() => setShowPayment(true)} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
                                <CreditCard className="w-4 h-4 mr-2" /> Encaisser
                            </Button>
                        </>
                    )}
                </div>

                {/* Print Actions */}
                <div className="flex gap-3 pt-2">
                    <Button variant="secondary" className="flex-1" onClick={handlePrintKitchen}>
                        <Printer className="w-4 h-4 mr-2" /> Ticket Cuisine
                    </Button>
                    <Button variant="secondary" className="flex-1" onClick={handlePrintReceipt} disabled={order.status !== 'ready' && order.status !== 'delivered'}>
                        <Receipt className="w-4 h-4 mr-2" /> Reçu Client
                    </Button>
                </div>

                {/* Warnings */}
                {order.status !== 'ready' && order.status !== 'delivered' && (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-800 rounded-lg text-xs">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        Attention: La commande doit être "Prête" avant l&apos;encaissement.
                    </div>
                )}
            </div>

            <PaymentModal
                isOpen={showPayment}
                onClose={() => setShowPayment(false)}
                order={order}
                onSuccess={() => {
                    handleStatusUpdate('delivered');
                    setShowPayment(false);
                    onClose(); // Close details modal too
                }}
            />
        </>
    );
}
