import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { createPushService } from '@/services/push.service';

/**
 * Tells the waiter that an order is ready to be served (owner decision
 * 2026-11-14: sound + vibration). Recipients are the staff member who took the
 * order (`orders.server_id`) and the server currently assigned to its table.
 *
 * Needs the service_role client (push subscriptions are not readable otherwise).
 * Never throws: it runs after a kitchen status change that must succeed without it.
 */
export function createOrderReadyService(supabase: SupabaseClient) {
  return {
    async notifyReady(tenantId: string, orderId: string): Promise<void> {
      try {
        const { data: order } = await supabase
          .from('orders')
          .select('order_number, table_number, server_id, table_id')
          .eq('id', orderId)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if (!order) return;

        const recipients = new Set<string>();
        if (order.server_id) recipients.add(order.server_id as string);
        if (order.table_id) {
          const { data: assignment } = await supabase
            .from('table_assignments')
            .select('server_id')
            .eq('tenant_id', tenantId)
            .eq('table_id', order.table_id)
            .is('ended_at', null)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (assignment?.server_id) recipients.add(assignment.server_id as string);
        }
        if (recipients.size === 0) return;

        const { data: tenant } = await supabase
          .from('tenants')
          .select('slug')
          .eq('id', tenantId)
          .maybeSingle();
        if (!tenant?.slug) return;

        await createPushService(supabase).envoyerAuxAppareilsDuTenant(
          tenantId,
          {
            titre: order.table_number
              ? `Commande prête - Table ${order.table_number}`
              : `Commande prête - ${order.order_number}`,
            corps: 'À servir maintenant.',
            // One tag per order: a shared tag would silently replace the
            // previous ready ticket on the waiter's phone.
            tag: `prete-${orderId}`,
            url: '/service',
            slug: tenant.slug as string,
            alerte: true,
          },
          { membres: [...recipients] },
        );
      } catch (err) {
        logger.error('Order ready notification failed', err, { tenantId, orderId });
      }
    },
  };
}
