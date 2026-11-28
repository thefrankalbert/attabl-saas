import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { ServiceError } from './errors';

type AuditAction = 'create' | 'update' | 'delete';
type AuditEntityType =
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

export interface AuditService {
  log(input: LogAuditInput): Promise<void>;
  /**
   * Comme `log`, mais LEVE si la ligne n'est pas ecrite. Pour les operations
   * destructives qui ne doivent jamais passer sans trace (remise a zero).
   */
  logOrThrow(input: LogAuditInput): Promise<void>;
}

export function createAuditService(
  supabase: SupabaseClient,
  context: { tenantId: string; userId?: string; userEmail?: string; userRole?: string },
): AuditService {
  const row = ({ action, entityType, entityId, oldData, newData, metadata }: LogAuditInput) => ({
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

  return {
    async logOrThrow(input: LogAuditInput): Promise<void> {
      const { error } = await supabase.from('audit_log').insert(row(input));
      if (error) {
        logger.error('Audit log insert refused (strict)', error, {
          action: input.action,
          entityType: input.entityType,
        });
        throw new ServiceError("Impossible d'enregistrer la trace d'audit", 'INTERNAL');
      }
    },

    /**
     * Log an audit event. Fire-and-forget - never throws.
     * The audit log should never block the primary operation.
     */
    async log({
      action,
      entityType,
      entityId,
      oldData,
      newData,
      metadata,
    }: LogAuditInput): Promise<void> {
      try {
        // B30: PostgREST rend un refus (RLS, contrainte) dans `error` sans lever:
        // non lu, la ligne d'audit disparaissait sans trace.
        const { error } = await supabase
          .from('audit_log')
          .insert(row({ action, entityType, entityId, oldData, newData, metadata }));
        if (error) {
          logger.error('Audit log insert refused', error, { action, entityType, entityId });
        }
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

/**
 * A row from the `audit_log` table as returned by the listing query
 * (select '*'). Mirrors the columns written by AuditService.log.
 */
interface AuditLogRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface ListAuditResult {
  logs: AuditLogRow[];
  count: number;
}

export interface AuditReadService {
  listLogs(input: ListAuditInput): Promise<ListAuditResult>;
}

/**
 * Read-side service for the audit log admin dashboard. Separate factory
 * because listing audit logs has no write context (no userId/userEmail).
 */
export function createAuditReadService(supabase: SupabaseClient): AuditReadService {
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
      return { logs: (data as AuditLogRow[]) || [], count: count || 0 };
    },
  };
}
