import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import { createOrderService } from './order.service';

/**
 * Service for the Service Manager dashboard (floor view with tables,
 * servers, and ready orders).
 */
export function createServiceManagerService(supabase: SupabaseClient) {
  const orderService = createOrderService(supabase);

  return {
    /**
     * Load the initial service-manager dashboard state:
     * - zones (with their tables) for the tenant's venues
     * - servers (admin_users with a service-floor role)
     * - today's ready orders
     */
    async loadDashboard(tenantId: string): Promise<{
      zones: unknown[];
      servers: unknown[];
      readyOrders: unknown[];
    }> {
      const [zonesResult, serversResult, readyOrders] = await Promise.all([
        supabase
          .from('zones')
          .select('*, tables(*), venues!inner(tenant_id)')
          .eq('venues.tenant_id', tenantId)
          .order('display_order'),
        supabase
          .from('admin_users')
          .select('*')
          .eq('tenant_id', tenantId)
          .in('role', ['waiter', 'manager', 'admin', 'owner'])
          .order('full_name'),
        orderService.listReadyOrdersToday(tenantId),
      ]);

      if (zonesResult.error) {
        throw new ServiceError('Erreur chargement zones', 'INTERNAL', zonesResult.error);
      }
      if (serversResult.error) {
        throw new ServiceError('Erreur chargement serveurs', 'INTERNAL', serversResult.error);
      }

      return {
        zones: (zonesResult.data as unknown[]) || [],
        servers: (serversResult.data as unknown[]) || [],
        readyOrders,
      };
    },
  };
}
