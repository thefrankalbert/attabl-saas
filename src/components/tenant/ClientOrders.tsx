'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Clock, ShoppingBag, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/currency';

// ─── Types ──────────────────────────────────────────────

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

interface OrderRecord {
  id: string;
  order_number: string;
  status: string;
  total: number;
  table_number: string | null;
  items: OrderItem[];
  created_at: string;
  service_type: string | null;
}

interface ClientOrdersProps {
  tenantSlug: string;
  tenantId: string;
  currency?: string;
}

// ─── Statuts annulables (seul "pending" permet l'annulation) ───

const CANCELLABLE_STATUSES = ['pending'];

// ─── Composant principal ────────────────────────────────

// Lire les IDs stockés côté client (hors du composant pour le SSR)
function getStoredOrderIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('attabl_order_ids') || '[]');
  } catch {
    return [];
  }
}

export default function ClientOrders({
  tenantSlug,
  tenantId,
  currency = 'XAF',
}: ClientOrdersProps) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());

  // ─── Initialisation : charger les commandes + Supabase Realtime ─────

  useEffect(() => {
    let cancelled = false;
    const supabase = supabaseRef.current;
    const storedIds = getStoredOrderIds();

    if (storedIds.length === 0) {
      // Pas d'IDs → on reste sur l'état initial (orders=[], loading via .then)
      // On utilise .then pour éviter setState synchrone dans l'effet
      Promise.resolve().then(() => {
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    // Charger les commandes depuis Supabase
    supabase
      .from('orders')
      .select('id, order_number, status, total, table_number, items, created_at, service_type')
      .eq('tenant_id', tenantId)
      .in('id', storedIds)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load orders:', error);
        } else {
          setOrders((data as OrderRecord[]) || []);
        }
        setLoading(false);
      });

    // Écouter les changements de statut en temps réel
    const channel = supabase
      .channel('client_orders_realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const updated = payload.new as OrderRecord;
          // Ne mettre à jour que les commandes du client
          if (storedIds.includes(updated.id)) {
            setOrders((prev) =>
              prev.map((o) =>
                o.id === updated.id ? { ...o, status: updated.status, total: updated.total } : o,
              ),
            );
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  // ─── Annuler une commande ───────────────────────────

  const handleCancel = async (orderId: string) => {
    setCancellingId(orderId);
    setConfirmCancelId(null);

    const supabase = supabaseRef.current;

    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId)
      .in('status', CANCELLABLE_STATUSES);

    if (error) {
      console.error('Failed to cancel order:', error);
    } else {
      // Mise à jour optimiste
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: 'cancelled' } : o)));
    }

    setCancellingId(null);
  };

  // ─── États de chargement et vide ────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-400">
          <ShoppingBag size={32} />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Aucune commande</h2>
        <p className="text-gray-500 mb-8 max-w-xs">
          Vous n&apos;avez pas encore passé de commande. Découvrez notre menu !
        </p>
        <Link
          href={`/sites/${tenantSlug}`}
          className="bg-gray-900 text-white px-6 py-3 rounded-xl font-medium shadow-lg shadow-gray-200 active:scale-95 transition-all"
        >
          Voir le menu
        </Link>
      </div>
    );
  }

  // ─── Rendu des commandes ────────────────────────────

  return (
    <div className="space-y-4 pb-24">
      {/* Indicateur temps réel */}
      <div className="flex items-center gap-2 text-xs text-gray-400 px-1">
        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        Suivi en direct
      </div>

      {orders.map((order) => (
        <div
          key={order.id}
          className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col gap-3"
        >
          {/* En-tête de commande */}
          <div className="flex items-center justify-between border-b border-gray-50 pb-3">
            <div className="flex items-center gap-2">
              <StatusIcon status={order.status} />
              <div>
                <p className="text-xs text-gray-500">
                  Commande #{order.order_number || order.id.slice(0, 5)}
                </p>
                <p className="text-sm font-bold text-gray-900">
                  {format(new Date(order.created_at), 'dd MMM HH:mm', { locale: fr })}
                </p>
              </div>
            </div>
            <div className="text-right">
              <BadgeStatus status={order.status} />
            </div>
          </div>

          {/* Articles */}
          <div className="space-y-1">
            {(order.items || []).map((item: OrderItem, idx: number) => (
              <div key={idx} className="flex justify-between text-sm text-gray-600">
                <span>
                  {item.quantity}x {item.name}
                </span>
                <span>{formatCurrency(item.price * item.quantity, currency)}</span>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="flex justify-between items-center pt-2 border-t border-gray-50">
            <span className="text-gray-500 text-sm">Total</span>
            <span className="font-bold text-lg text-gray-900">
              {formatCurrency(order.total, currency)}
            </span>
          </div>

          {/* Bouton annulation (uniquement pending) */}
          {CANCELLABLE_STATUSES.includes(order.status) && (
            <div className="pt-1">
              {confirmCancelId === order.id ? (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-100">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700 flex-1">Annuler cette commande ?</p>
                  <button
                    onClick={() => handleCancel(order.id)}
                    disabled={cancellingId === order.id}
                    className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {cancellingId === order.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      'Confirmer'
                    )}
                  </button>
                  <button
                    onClick={() => setConfirmCancelId(null)}
                    className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Non
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmCancelId(order.id)}
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Annuler la commande
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Sous-composants ──────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  const iconStyles: Record<string, string> = {
    pending: 'bg-yellow-50 text-yellow-600',
    confirmed: 'bg-blue-50 text-blue-600',
    preparing: 'bg-purple-50 text-purple-600',
    ready: 'bg-green-50 text-green-600',
    served: 'bg-gray-50 text-gray-600',
    cancelled: 'bg-red-50 text-red-500',
  };

  return (
    <div className={`p-2 rounded-lg ${iconStyles[status] || iconStyles.pending}`}>
      <Clock size={16} />
    </div>
  );
}

function BadgeStatus({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-100',
    confirmed: 'bg-blue-50 text-blue-700 border-blue-100',
    preparing: 'bg-purple-50 text-purple-700 border-purple-100',
    ready: 'bg-green-50 text-green-700 border-green-100',
    served: 'bg-gray-50 text-gray-700 border-gray-100',
    cancelled: 'bg-red-50 text-red-700 border-red-100',
  };

  const labels: Record<string, string> = {
    pending: 'En attente',
    confirmed: 'Confirmée',
    preparing: 'En cuisine',
    ready: 'Prête',
    served: 'Servie',
    cancelled: 'Annulée',
  };

  return (
    <span
      className={`px-2.5 py-1 rounded-md text-xs font-medium border ${styles[status] || styles.pending}`}
    >
      {labels[status] || status}
    </span>
  );
}
