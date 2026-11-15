'use server';

import { logger } from '@/lib/logger';
import { getAuthenticatedUserWithTenant } from '@/lib/auth/get-session';
import { assertTenantServing, TenantLockedError } from '@/lib/billing/assert-tenant-serving';
import {
  reminderMuteSchema,
  reminderSettingsSchema,
  type ReminderRule,
  type ReminderSettings,
} from '@/lib/validations/reminders.schema';

type Result = { success: true } | { success: false; error: string };

/**
 * Reglages des rappels du restaurant (regles actives, delais). Reserve a qui
 * a 'settings.edit'; la RLS de reminder_settings exige le meme droit.
 */
export async function actionUpdateReminderSettings(input: ReminderSettings): Promise<Result> {
  try {
    const { tenantId, adminUserId, supabase } =
      await getAuthenticatedUserWithTenant('settings.edit');
    await assertTenantServing(tenantId);
    const parsed = reminderSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Reglages invalides' };
    }
    const { error } = await supabase.from('reminder_settings').upsert(
      {
        tenant_id: tenantId,
        config: parsed.data,
        updated_at: new Date().toISOString(),
        updated_by: adminUserId,
      },
      { onConflict: 'tenant_id' },
    );
    if (error) {
      logger.error('actionUpdateReminderSettings: DB error', error, { tenantId });
      return { success: false, error: 'Enregistrement impossible' };
    }
    return { success: true };
  } catch (err) {
    if (err instanceof TenantLockedError) return { success: false, error: err.message };
    logger.error('actionUpdateReminderSettings: unexpected error', err);
    return { success: false, error: 'Action non autorisee' };
  }
}

/** Couper (ou rallumer) un type de rappel pour SOI. Ouvert a tout le personnel. */
export async function actionSetReminderMute(rule: ReminderRule, muted: boolean): Promise<Result> {
  try {
    const { tenantId, adminUserId, supabase } = await getAuthenticatedUserWithTenant();
    const parsed = reminderMuteSchema.safeParse({ rule, muted });
    if (!parsed.success) return { success: false, error: 'Rappel inconnu' };
    const { error } = await supabase.from('reminder_preferences').upsert(
      {
        admin_user_id: adminUserId,
        tenant_id: tenantId,
        rule: parsed.data.rule,
        muted: parsed.data.muted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'admin_user_id,rule' },
    );
    if (error) {
      logger.error('actionSetReminderMute: DB error', error, { tenantId });
      return { success: false, error: 'Enregistrement impossible' };
    }
    return { success: true };
  } catch (err) {
    logger.error('actionSetReminderMute: unexpected error', err);
    return { success: false, error: 'Action non autorisee' };
  }
}
