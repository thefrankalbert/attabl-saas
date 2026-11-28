import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminUser, Table, Zone } from '@/types/admin.types';
import { hasPermission, toPermissionMap, toPostes, type PosteOverrides } from '@/lib/permissions';
import type { StaffPoste } from '@/types/permission.types';
import { ServiceError } from './errors';

interface ServerRow {
  id: string;
  tenant_id: string;
  user_id: string;
  full_name: string | null;
  postes: unknown;
  permission_overrides: unknown;
  is_active: boolean;
}
import { createOrderService } from './order.service';

/** A `zones` row with its tables and the venue's tenant_id (for the !inner filter). */
type ServiceZoneRow = Zone & {
  tables: Table[];
  venues: { tenant_id: string };
};

/** An open table session - the canonical "table is occupied" signal (keyed by table_number). */
export interface OpenTableSession {
  table_number: string;
  opened_at: string;
}

export interface ServiceManagerService {
  loadDashboard(tenantId: string): Promise<{
    zones: ServiceZoneRow[];
    servers: AdminUser[];
    // readyOrders is typed unknown[] because it is produced by the protected
    // order.service (listReadyOrdersToday), whose signature is out of scope here.
    readyOrders: unknown[];
    openSessions: OpenTableSession[];
  }>;
  listOpenSessions(tenantId: string): Promise<OpenTableSession[]>;
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
     * - servers (members whose effective rights include `orders.take`)
     * - today's ready orders (kitchen-ready, for the "ready to serve" list)
     * - open table sessions (the canonical "table occupied" signal, same one
     *   the tenant dashboard uses; a dine-in order opens one, settling closes it)
     */
    async loadDashboard(tenantId: string): Promise<{
      zones: ServiceZoneRow[];
      servers: AdminUser[];
      readyOrders: unknown[];
      openSessions: OpenTableSession[];
    }> {
      const [zonesResult, serversResult, postesResult, sessionsResult, readyOrders] =
        await Promise.all([
          supabase
            .from('zones')
            .select('*, tables(*), venues!inner(tenant_id)')
            .eq('venues.tenant_id', tenantId)
            .order('display_order'),
          supabase
            .from('admin_users')
            // Le plan de salle n'affiche que id/full_name/postes/is_active: ni
            // email ni telephone. `permission_overrides` ne sert qu'au filtre
            // ci-dessous et n'est pas rendu.
            .select('id, tenant_id, user_id, full_name, postes, permission_overrides, is_active')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .is('deleted_at', null)
            .order('full_name'),
          supabase.from('poste_permissions').select('poste, permissions').eq('tenant_id', tenantId),
          supabase
            .from('table_sessions')
            .select('table_number, opened_at')
            .eq('tenant_id', tenantId)
            .eq('status', 'open'),
          orderService.listReadyOrdersToday(tenantId),
        ]);

      if (zonesResult.error) {
        throw new ServiceError('Erreur chargement zones', 'INTERNAL', zonesResult.error);
      }
      if (serversResult.error) {
        throw new ServiceError('Erreur chargement serveurs', 'INTERNAL', serversResult.error);
      }
      if (postesResult.error) {
        // Echec ferme: sans les reglages du restaurant, on ne sait pas qui a
        // garde le droit de prendre des commandes.
        throw new ServiceError('Erreur chargement des droits', 'INTERNAL', postesResult.error);
      }
      if (sessionsResult.error) {
        throw new ServiceError('Erreur chargement sessions', 'INTERNAL', sessionsResult.error);
      }

      // Qui peut etre affecte a une table: ceux qui peuvent PRENDRE une
      // commande, d'apres leurs droits EFFECTIFS (cumul des postes, reglages du
      // restaurant, reglage par personne), pas d'apres un nom de poste. Un
      // serveur a qui l'on a retire `orders.take` n'est plus proposable.
      const posteOverrides: PosteOverrides = {};
      for (const row of (postesResult.data ?? []) as { poste: string; permissions: unknown }[]) {
        const map = toPermissionMap(row.permissions);
        if (map) posteOverrides[row.poste as StaffPoste] = map;
      }
      const servers = ((serversResult.data ?? []) as ServerRow[])
        .filter((row) =>
          hasPermission(
            {
              postes: toPostes(row.postes),
              permission_overrides: toPermissionMap(row.permission_overrides),
            },
            'orders.take',
            posteOverrides,
          ),
        )
        // Le reglage par personne ne quitte pas le service.
        .map((row) => ({
          id: row.id,
          tenant_id: row.tenant_id,
          user_id: row.user_id,
          full_name: row.full_name ?? undefined,
          postes: toPostes(row.postes),
          is_active: row.is_active,
        }));

      return {
        zones: (zonesResult.data as ServiceZoneRow[]) || [],
        // La salle n'utilise que ces champs d'un membre (ni email ni date).
        servers: servers as unknown as AdminUser[],
        readyOrders,
        openSessions: (sessionsResult.data as OpenTableSession[]) || [],
      };
    },

    /**
     * Reload just the open table sessions (occupancy signal). Used by the
     * realtime subscription: an order insert opens a session, settling closes it.
     */
    async listOpenSessions(tenantId: string): Promise<OpenTableSession[]> {
      const { data, error } = await supabase
        .from('table_sessions')
        .select('table_number, opened_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'open');
      if (error) {
        throw new ServiceError('Erreur chargement sessions', 'INTERNAL', error);
      }
      return (data as OpenTableSession[]) || [];
    },
  };
}
