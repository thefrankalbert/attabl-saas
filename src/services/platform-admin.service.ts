import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { ServiceError } from './errors';

/**
 * Platform super-admin service (god mode).
 *
 * Pure business logic for the operator-level actions exposed in the Command
 * Center: suspend / soft-delete tenants and ban / soft-delete admin users.
 * Every mutation is reversible (soft-delete) and recorded in
 * `platform_audit_log`, which outlives the tenant it acted on.
 *
 * MUST be called with the service_role admin client (these operations span
 * tenants and bypass RLS by design). Authorization is enforced by the caller
 * via requireSuperAdmin() - this layer assumes the actor is already trusted.
 */

export interface PlatformActor {
  userId: string;
  email?: string;
}

type PlatformAction =
  | 'suspend_tenant'
  | 'unsuspend_tenant'
  | 'soft_delete_tenant'
  | 'restore_tenant'
  | 'ban_user'
  | 'unban_user'
  | 'soft_delete_user'
  | 'restore_user'
  | 'impersonate_tenant';

interface AuditInput {
  action: PlatformAction;
  targetType: 'tenant' | 'admin_user';
  targetId: string;
  targetLabel?: string | null;
  tenantId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface TrashTenant {
  id: string;
  name: string;
  slug: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface PlatformAdminService {
  suspendTenant(tenantId: string, actor: PlatformActor, reason?: string): Promise<void>;
  unsuspendTenant(tenantId: string, actor: PlatformActor): Promise<void>;
  softDeleteTenant(tenantId: string, actor: PlatformActor, reason?: string): Promise<void>;
  restoreTenant(tenantId: string, actor: PlatformActor): Promise<void>;
  banAdminUser(adminUserId: string, actor: PlatformActor, reason?: string): Promise<void>;
  unbanAdminUser(adminUserId: string, actor: PlatformActor): Promise<void>;
  softDeleteAdminUser(adminUserId: string, actor: PlatformActor, reason?: string): Promise<void>;
  restoreAdminUser(adminUserId: string, actor: PlatformActor): Promise<void>;
  recordImpersonation(tenantId: string, actor: PlatformActor): Promise<void>;
  listDeletedTenants(): Promise<TrashTenant[]>;
}

export function createPlatformAdminService(admin: SupabaseClient): PlatformAdminService {
  /**
   * Write a god-mode action to the platform audit trail. Fire-and-forget:
   * losing an audit row must never roll back the action that already happened,
   * but a failure is logged loudly because the trail matters for god mode.
   */
  async function audit(actor: PlatformActor, input: AuditInput): Promise<void> {
    const { error } = await admin.from('platform_audit_log').insert({
      actor_user_id: actor.userId,
      actor_email: actor.email ?? null,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      target_label: input.targetLabel ?? null,
      tenant_id: input.tenantId ?? null,
      reason: input.reason ?? null,
      metadata: input.metadata ?? null,
    });
    if (error) {
      logger.error('platform_audit_log insert failed', error, {
        action: input.action,
        targetId: input.targetId,
      });
    }
  }

  async function getTenantLabel(tenantId: string): Promise<{ name: string; slug: string }> {
    const { data, error } = await admin
      .from('tenants')
      .select('name, slug')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) throw new ServiceError('Erreur lors du chargement du restaurant', 'INTERNAL', error);
    if (!data) throw new ServiceError('Restaurant introuvable', 'NOT_FOUND');
    return data;
  }

  async function getAdminUserLabel(
    adminUserId: string,
  ): Promise<{ email: string; tenant_id: string; role: string }> {
    const { data, error } = await admin
      .from('admin_users')
      .select('email, tenant_id, role')
      .eq('id', adminUserId)
      .maybeSingle();
    if (error) throw new ServiceError('Erreur lors du chargement du compte', 'INTERNAL', error);
    if (!data) throw new ServiceError('Compte introuvable', 'NOT_FOUND');
    return data;
  }

  return {
    async suspendTenant(tenantId, actor, reason) {
      const label = await getTenantLabel(tenantId);
      const { error } = await admin
        .from('tenants')
        .update({
          is_active: false,
          suspended_at: new Date().toISOString(),
          suspended_by: actor.userId,
          suspend_reason: reason ?? null,
        })
        .eq('id', tenantId)
        .is('deleted_at', null);
      if (error) throw new ServiceError('Echec de la suspension', 'INTERNAL', error);
      await audit(actor, {
        action: 'suspend_tenant',
        targetType: 'tenant',
        targetId: tenantId,
        targetLabel: `${label.name} (${label.slug})`,
        tenantId,
        reason,
      });
    },

    async unsuspendTenant(tenantId, actor) {
      const label = await getTenantLabel(tenantId);
      const { error } = await admin
        .from('tenants')
        .update({
          is_active: true,
          suspended_at: null,
          suspended_by: null,
          suspend_reason: null,
        })
        .eq('id', tenantId)
        .is('deleted_at', null);
      if (error) throw new ServiceError('Echec de la reactivation', 'INTERNAL', error);
      await audit(actor, {
        action: 'unsuspend_tenant',
        targetType: 'tenant',
        targetId: tenantId,
        targetLabel: `${label.name} (${label.slug})`,
        tenantId,
      });
    },

    async softDeleteTenant(tenantId, actor, reason) {
      const label = await getTenantLabel(tenantId);
      const { error } = await admin
        .from('tenants')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor.userId,
          is_active: false,
        })
        .eq('id', tenantId)
        .is('deleted_at', null);
      if (error) throw new ServiceError('Echec de la suppression', 'INTERNAL', error);
      await audit(actor, {
        action: 'soft_delete_tenant',
        targetType: 'tenant',
        targetId: tenantId,
        targetLabel: `${label.name} (${label.slug})`,
        tenantId,
        reason,
      });
    },

    async restoreTenant(tenantId, actor) {
      const label = await getTenantLabel(tenantId);
      const { error } = await admin
        .from('tenants')
        .update({
          deleted_at: null,
          deleted_by: null,
          is_active: true,
          suspended_at: null,
          suspended_by: null,
          suspend_reason: null,
        })
        .eq('id', tenantId);
      if (error) throw new ServiceError('Echec de la restauration', 'INTERNAL', error);
      await audit(actor, {
        action: 'restore_tenant',
        targetType: 'tenant',
        targetId: tenantId,
        targetLabel: `${label.name} (${label.slug})`,
        tenantId,
      });
    },

    async banAdminUser(adminUserId, actor, reason) {
      const target = await getAdminUserLabel(adminUserId);
      const { error } = await admin
        .from('admin_users')
        .update({
          is_active: false,
          banned_at: new Date().toISOString(),
          banned_by: actor.userId,
          ban_reason: reason ?? null,
        })
        .eq('id', adminUserId)
        .is('deleted_at', null);
      if (error) throw new ServiceError('Echec du bannissement', 'INTERNAL', error);
      await audit(actor, {
        action: 'ban_user',
        targetType: 'admin_user',
        targetId: adminUserId,
        targetLabel: target.email,
        tenantId: target.tenant_id,
        reason,
      });
    },

    async unbanAdminUser(adminUserId, actor) {
      const target = await getAdminUserLabel(adminUserId);
      const { error } = await admin
        .from('admin_users')
        .update({
          is_active: true,
          banned_at: null,
          banned_by: null,
          ban_reason: null,
        })
        .eq('id', adminUserId)
        .is('deleted_at', null);
      if (error) throw new ServiceError('Echec du debannissement', 'INTERNAL', error);
      await audit(actor, {
        action: 'unban_user',
        targetType: 'admin_user',
        targetId: adminUserId,
        targetLabel: target.email,
        tenantId: target.tenant_id,
      });
    },

    async softDeleteAdminUser(adminUserId, actor, reason) {
      const target = await getAdminUserLabel(adminUserId);
      const { error } = await admin
        .from('admin_users')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor.userId,
          is_active: false,
        })
        .eq('id', adminUserId)
        .is('deleted_at', null);
      if (error) throw new ServiceError('Echec de la suppression du compte', 'INTERNAL', error);
      await audit(actor, {
        action: 'soft_delete_user',
        targetType: 'admin_user',
        targetId: adminUserId,
        targetLabel: target.email,
        tenantId: target.tenant_id,
        reason,
      });
    },

    async restoreAdminUser(adminUserId, actor) {
      const target = await getAdminUserLabel(adminUserId);
      // Restore must return the account to a fully clean state: clearing
      // deleted_* alone but leaving banned_* would resurrect a member who is
      // active (dashboard access granted) yet still labelled "banned" in the
      // console - a contradictory state. Clear the ban metadata too.
      const { error } = await admin
        .from('admin_users')
        .update({
          deleted_at: null,
          deleted_by: null,
          banned_at: null,
          banned_by: null,
          ban_reason: null,
          is_active: true,
        })
        .eq('id', adminUserId);
      if (error) throw new ServiceError('Echec de la restauration du compte', 'INTERNAL', error);
      await audit(actor, {
        action: 'restore_user',
        targetType: 'admin_user',
        targetId: adminUserId,
        targetLabel: target.email,
        tenantId: target.tenant_id,
      });
    },

    async recordImpersonation(tenantId, actor) {
      const label = await getTenantLabel(tenantId);
      await audit(actor, {
        action: 'impersonate_tenant',
        targetType: 'tenant',
        targetId: tenantId,
        targetLabel: `${label.name} (${label.slug})`,
        tenantId,
      });
    },

    async listDeletedTenants() {
      const { data, error } = await admin
        .from('tenants')
        .select('id, name, slug, deleted_at, deleted_by')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });
      if (error)
        throw new ServiceError('Erreur lors du chargement de la corbeille', 'INTERNAL', error);
      return (data as TrashTenant[]) ?? [];
    },
  };
}
