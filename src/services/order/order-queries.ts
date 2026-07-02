import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from '../errors';
import type { TenantValidationResult } from './order-types';

export function createQueryMethods(supabase: SupabaseClient) {
  return {
    /**
     * Validates that a tenant exists and is active.
     * Also returns tenant config (currency, tax, subscription) to avoid a second round-trip.
     * Throws ServiceError if not found or inactive.
     */
    async validateTenant(slug: string): Promise<TenantValidationResult> {
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select(
          'id, is_active, currency, tax_rate, service_charge_rate, enable_tax, enable_service_charge, subscription_plan, subscription_status, trial_ends_at',
        )
        .eq('slug', slug)
        // Soft-deleted tenants accept no orders, independently of is_active.
        .is('deleted_at', null)
        .single();

      if (tenantError || !tenant) {
        throw new ServiceError('Restaurant non trouvé', 'NOT_FOUND');
      }

      if (!tenant.is_active) {
        throw new ServiceError('Ce restaurant est temporairement indisponible', 'VALIDATION');
      }

      return {
        id: tenant.id,
        currency: tenant.currency ?? null,
        tax_rate: tenant.tax_rate ?? null,
        service_charge_rate: tenant.service_charge_rate ?? null,
        enable_tax: tenant.enable_tax ?? null,
        enable_service_charge: tenant.enable_service_charge ?? null,
        subscription_plan: tenant.subscription_plan ?? null,
        subscription_status: tenant.subscription_status ?? null,
        trial_ends_at: tenant.trial_ends_at ?? null,
      };
    },

    /**
     * List orders in 'ready' status created since midnight for a tenant.
     * Used by the ServiceManager dashboard.
     */
    async listReadyOrdersToday(tenantId: string): Promise<unknown[]> {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('tenant_id', tenantId)
        .eq('status', 'ready')
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: true });
      if (error) {
        throw new ServiceError('Erreur chargement commandes pretes', 'INTERNAL', error);
      }
      return (data as unknown[]) || [];
    },

    /**
     * Return the current (not delivered, not cancelled) order for a
     * specific table, if any. Used by ServiceManager table detail panel.
     * Resolves table_number from tables.id (orders.table_id may be absent on older DBs).
     */
    async getCurrentOrderForTable(tenantId: string, tableId: string): Promise<unknown | null> {
      const { data: tableRow, error: tableError } = await supabase
        .from('tables')
        .select('table_number, display_name')
        .eq('id', tableId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (tableError) {
        throw new ServiceError(
          'Erreur chargement table pour commande courante',
          'INTERNAL',
          tableError,
        );
      }
      if (!tableRow) return null;

      const tableNumbers = Array.from(
        new Set(
          [tableRow.table_number, tableRow.display_name].filter(
            (value): value is string => typeof value === 'string' && value.length > 0,
          ),
        ),
      );
      if (tableNumbers.length === 0) return null;

      let query = supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('tenant_id', tenantId)
        .not('status', 'in', '(delivered,cancelled)')
        .order('created_at', { ascending: false })
        .limit(1);

      query =
        tableNumbers.length === 1
          ? query.eq('table_number', tableNumbers[0])
          : query.in('table_number', tableNumbers);

      const { data, error } = await query.maybeSingle();
      if (error) {
        throw new ServiceError(
          'Erreur chargement commande courante pour cette table',
          'INTERNAL',
          error,
        );
      }
      return data || null;
    },
  };
}
