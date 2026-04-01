import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

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
