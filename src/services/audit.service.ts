import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { ServiceError } from './errors';

export type AuditAction = 'create' | 'update' | 'delete';
export type AuditEntityType =
  | 'order'
  | 'menu'
  | 'item'
  | 'category'
  | 'user'
  | 'permission'
  | 'setting'
  | 'ingredient'
  | 'coupon'
  | 'supplier';

interface LogAuditInput {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export function createAuditService(
  supabase: SupabaseClient,
  context: { tenantId: string; userId?: string; userEmail?: string; userRole?: string },
) {
  return {
    /**
     * Log an audit event. Fire-and-forget - never throws.
     * The audit log should never block the primary operation.
     */
    async log({ action, entityType, entityId, oldData, newData, metadata }: LogAuditInput) {
      try {
        await supabase.from('audit_log').insert({
          tenant_id: context.tenantId,
          user_id: context.userId || null,
          user_email: context.userEmail || null,
          user_role: context.userRole || null,
          action,
          entity_type: entityType,
          entity_id: entityId || null,
          old_data: oldData || null,
          new_data: newData || null,
          metadata: metadata || null,
        });
      } catch (error) {
        // Audit logging should NEVER fail the parent operation
        logger.error('Audit log insert failed', error, { action, entityType, entityId });
      }
    },
  };
}

interface ListAuditInput {
  tenantId: string;
  page: number;
  pageSize: number;
  action?: string;
  entityType?: string;
  searchEmail?: string;
}

interface ListAuditResult {
  logs: unknown[];
  count: number;
}

/**
 * Read-side service for the audit log admin dashboard. Separate factory
 * because listing audit logs has no write context (no userId/userEmail).
 */
export function createAuditReadService(supabase: SupabaseClient) {
  return {
    async listLogs(input: ListAuditInput): Promise<ListAuditResult> {
      let query = supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .eq('tenant_id', input.tenantId)
        .order('created_at', { ascending: false })
        .range(input.page * input.pageSize, (input.page + 1) * input.pageSize - 1);

      if (input.action) query = query.eq('action', input.action);
      if (input.entityType) query = query.eq('entity_type', input.entityType);
      if (input.searchEmail) query = query.ilike('user_email', `%${input.searchEmail}%`);

      const { data, count, error } = await query;
      if (error) {
        throw new ServiceError("Erreur lors du chargement de l'audit log", 'INTERNAL', error);
      }
      return { logs: (data as unknown[]) || [], count: count || 0 };
    },
  };
}
