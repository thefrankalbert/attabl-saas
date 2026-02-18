'use client';

import { useAssignments } from '@/hooks/queries/useAssignments';
import { useOrders } from '@/hooks/queries/useOrders';
import { useReleaseAssignment, useClaimOrder } from '@/hooks/mutations/useAssignment';
import { UserCheck, ShoppingCart, LogOut } from 'lucide-react';
import type { Order } from '@/types/admin.types';

interface Props {
  tenantId: string;
  currentServerId: string;
}

export default function ServerDashboard({ tenantId, currentServerId }: Props) {
  const { data: allAssignments = [] } = useAssignments(tenantId);
  const { data: orders = [] } = useOrders(tenantId);
  const releaseAssignment = useReleaseAssignment(tenantId);
  const claimOrder = useClaimOrder(tenantId);

  const myAssignments = allAssignments.filter((a) => a.server_id === currentServerId);
  const myTableIds = new Set(myAssignments.map((a) => a.table_id));
  const myOrders = orders.filter(
    (o: Order) =>
      o.server_id === currentServerId && o.status !== 'delivered' && o.status !== 'cancelled',
  );
  const unassignedOrders = orders.filter(
    (o: Order) => !o.server_id && o.status !== 'delivered' && o.status !== 'cancelled',
  );

  return (
    <div className="space-y-6">
      {/* My Tables */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-[#CCFF00]" />
          Mes tables ({myAssignments.length})
        </h2>
        {myAssignments.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucune table assignee.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {myAssignments.map((assignment) => {
              const tableOrders = myOrders.filter(
                (o: Order) =>
                  o.table_id === assignment.table_id ||
                  (o.table_number && myTableIds.has(assignment.table_id)),
              );
              return (
                <div
                  key={assignment.id}
                  className="rounded-xl border border-[#CCFF00]/30 bg-[#CCFF00]/5 p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-bold text-white">
                      {assignment.table?.display_name ?? assignment.table?.table_number ?? 'Table'}
                    </span>
                    <button
                      onClick={() => releaseAssignment.mutate(assignment.id)}
                      className="flex items-center gap-1 text-xs text-neutral-500 hover:text-red-400 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Liberer
                    </button>
                  </div>
                  <div className="text-sm text-neutral-400">
                    {tableOrders.length} commande{tableOrders.length !== 1 ? 's' : ''} active
                    {tableOrders.length !== 1 ? 's' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Unassigned Orders */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-neutral-400" />
          Non assignees ({unassignedOrders.length})
        </h2>
        {unassignedOrders.length === 0 ? (
          <p className="text-sm text-neutral-500">Toutes les commandes sont assignees.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {unassignedOrders.map((order: Order) => (
              <div
                key={order.id}
                className="rounded-xl border border-neutral-800 bg-neutral-900 p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold text-white">
                    {order.table_number ?? '—'}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {order.items?.length ?? 0} article
                    {(order.items?.length ?? 0) !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">
                    {(order.total_price / 100).toFixed(2)} €
                  </span>
                  <button
                    onClick={() =>
                      claimOrder.mutate({ orderId: order.id, serverId: currentServerId })
                    }
                    className="rounded-lg bg-[#CCFF00] px-3 py-1 text-xs font-semibold text-black hover:bg-[#CCFF00]/80 transition-colors"
                  >
                    Prendre en charge
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
