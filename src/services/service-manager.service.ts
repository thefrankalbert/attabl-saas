import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminUser, Table, Zone } from '@/types/admin.types';
import { ServiceError } from './errors';
import { createOrderService } from './order.service';

/** A `zones` row with its tables and the venue's tenant_id (for the !inner filter). */
type ServiceZoneRow = Zone & {
  tables: Table[];
  venues: { tenant_id: string };
};

export interface ServiceManagerService {
  loadDashboard(tenantId: string): Promise<{
    zones: ServiceZoneRow[];
    servers: AdminUser[];
    // readyOrders is typed unknown[] because it is produced by the protected
    // order.service (listReadyOrdersToday), whose signature is out of scope here.
    readyOrders: unknown[];
  }>;
}

/**
 * Service for the Service Manager dashboard (floor view with tables,
 * servers, and ready orders).
 */
export function createServiceManagerService(supabase: SupabaseClient): ServiceManagerService {
  const orderService = createOrderService(supabase);

  return {
    /**
     * Load the initial service-manager dashboard state:
     * - zones (with their tables) for the tenant's venues
     * - servers (admin_users with a service-floor role)
     * - today's ready orders
     */
    async loadDashboard(tenantId: string): Promise<{
      zones: ServiceZoneRow[];
      servers: AdminUser[];
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
          // Floor view only renders id/full_name/role/is_active - do not pull
          // email/phone/permissions for every team member.
          .select('id, tenant_id, user_id, full_name, role, is_active')
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
        zones: (zonesResult.data as ServiceZoneRow[]) || [],
        servers: (serversResult.data as AdminUser[]) || [],
        readyOrders,
      };
    },
  };
}
