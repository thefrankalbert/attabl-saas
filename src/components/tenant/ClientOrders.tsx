'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Clock, CheckCircle2, XCircle, ChevronRight, ShoppingBag } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import Link from 'next/link';

interface OrderHistoryItem {
    id: string;
    date: string;
    items: { name: string; quantity: number; price: number }[];
    totalPrice: number;
    tableNumber: string;
    status: string;
}

export default function ClientOrders({ tenantSlug }: { tenantSlug: string }) {
    const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Load from localStorage
        const saved = localStorage.getItem('order_history');
        if (saved) {
            try {
                setOrders(JSON.parse(saved).reverse()); // Newest first
            } catch (e) {
                console.error("Failed to parse order history");
            }
        }
        setLoading(false);
    }, []);

    if (loading) return <div className="p-8 text-center text-gray-500">Chargement...</div>;

    if (orders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-400">
                    <ShoppingBag size={32} />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Aucune commande</h2>
                <p className="text-gray-500 mb-8 max-w-xs">Vous n'avez pas encore passé de commande. Découvrez notre menu !</p>
                <Link
                    href={`/sites/${tenantSlug}`}
                    className="bg-gray-900 text-white px-6 py-3 rounded-xl font-medium shadow-lg shadow-gray-200 active:scale-95 transition-all"
                >
                    Voir le menu
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-4 pb-24">
            {orders.map((order) => (
                <div key={order.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-gray-50 pb-3">
                        <div className="flex items-center gap-2">
                            <div className="bg-blue-50 text-blue-600 p-2 rounded-lg">
                                <Clock size={16} />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Commande #{order.id.slice(0, 5)}</p>
                                <p className="text-sm font-bold text-gray-900">
                                    {format(new Date(order.date), 'dd MMM HH:mm', { locale: fr })}
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <BadgeStatus status={order.status} />
                        </div>
                    </div>

                    <div className="space-y-1">
                        {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-sm text-gray-600">
                                <span>{item.quantity}x {item.name}</span>
                                <span>{item.price * item.quantity} F</span>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                        <span className="text-gray-500 text-sm">Total</span>
                        <span className="font-bold text-lg text-gray-900">{order.totalPrice.toLocaleString('fr-FR')} F</span>
                    </div>
                </div>
            ))}
        </div>
    );
}

function BadgeStatus({ status }: { status: string }) {
    const styles: Record<string, string> = {
        'pending': 'bg-yellow-50 text-yellow-700 border-yellow-100',
        'confirmed': 'bg-blue-50 text-blue-700 border-blue-100',
        'preparing': 'bg-purple-50 text-purple-700 border-purple-100',
        'ready': 'bg-green-50 text-green-700 border-green-100',
        'served': 'bg-gray-50 text-gray-700 border-gray-100',
        'cancelled': 'bg-red-50 text-red-700 border-red-100',
    };

    const labels: Record<string, string> = {
        'pending': 'En attente',
        'confirmed': 'Confirmée',
        'preparing': 'En cuisine',
        'ready': 'Prête',
        'served': 'Servie',
        'cancelled': 'Annulée',
    };

    return (
        <span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${styles[status] || styles.pending}`}>
            {labels[status] || status}
        </span>
    );
}
