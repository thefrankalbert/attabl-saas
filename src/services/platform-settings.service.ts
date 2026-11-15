// Ce que la plateforme regle pour tous les restaurants (numero du support) et
// l'etat de ses taches planifiees (battements). Tables globales, sans tenant_id.

import type { SupabaseClient } from '@supabase/supabase-js';
import { CRON_JOBS, cronSilenceLimitMs, type CronJob } from '@/lib/cron-jobs';
import {
  DEFAULT_SUPPORT_CONTACT,
  toSupportContact,
  type SupportContact,
} from '@/lib/support-contact';
import { logger } from '@/lib/logger';
import { ServiceError } from './errors';

export interface CronHeartbeat {
  job: CronJob;
  schedule: string;
  /** null: la tache n'a jamais ete vue passer. */
  lastRunAt: string | null;
  lastStatus: 'ok' | 'error' | null;
  lastDurationMs: number | null;
  /** Silence plus long que prevu, jamais vue, ou dernier passage en erreur. */
  needsAttention: boolean;
}

interface HeartbeatRow {
  job: string;
  last_run_at: string;
  last_status: 'ok' | 'error';
  last_duration_ms: number;
}

/** Une ligne par tache attendue, meme celles qui ne sont jamais passees (service_role). */
export async function loadCronHeartbeats(
  admin: SupabaseClient,
  now: Date,
): Promise<CronHeartbeat[]> {
  const { data, error } = await admin
    .from('cron_heartbeats')
    .select('job, last_run_at, last_status, last_duration_ms');
  if (error) throw error;
  const rows = new Map(((data ?? []) as HeartbeatRow[]).map((r) => [r.job, r]));
  return (Object.keys(CRON_JOBS) as CronJob[]).map((job) => {
    const schedule = CRON_JOBS[job];
    const row = rows.get(job);
    if (!row) {
      return {
        job,
        schedule,
        lastRunAt: null,
        lastStatus: null,
        lastDurationMs: null,
        needsAttention: true,
      };
    }
    const silentMs = now.getTime() - new Date(row.last_run_at).getTime();
    return {
      job,
      schedule,
      lastRunAt: row.last_run_at,
      lastStatus: row.last_status,
      lastDurationMs: row.last_duration_ms,
      needsAttention: row.last_status === 'error' || silentMs > cronSilenceLimitMs(schedule),
    };
  });
}

/** Le numero du support; la valeur par defaut si rien n'est enregistre ou si la lecture echoue. */
export async function loadSupportContact(supabase: SupabaseClient): Promise<SupportContact> {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'support_contact')
    .maybeSingle();
  if (error) {
    logger.warn('Lecture du numero du support impossible: valeur par defaut', {
      error: error.message,
    });
    return DEFAULT_SUPPORT_CONTACT;
  }
  const phone = (data?.value as { phone?: unknown } | null)?.phone;
  return typeof phone === 'string' && phone ? toSupportContact(phone) : DEFAULT_SUPPORT_CONTACT;
}

/**
 * Enregistre le numero du support et le trace dans platform_audit_log.
 * Appeler avec le client service_role APRES requireSuperAdmin().
 */
export async function saveSupportContact(
  admin: SupabaseClient,
  phone: string,
  actor: { userId: string; email?: string },
): Promise<SupportContact> {
  const contact = toSupportContact(phone);
  const previous = await loadSupportContact(admin);
  const { error } = await admin.from('platform_settings').upsert(
    {
      key: 'support_contact',
      value: { phone: contact.display },
      updated_at: new Date().toISOString(),
      updated_by: actor.userId,
    },
    { onConflict: 'key' },
  );
  if (error) {
    logger.error('Enregistrement du numero du support impossible', error);
    throw new ServiceError('Enregistrement impossible', 'INTERNAL');
  }
  const { error: auditError } = await admin.from('platform_audit_log').insert({
    actor_user_id: actor.userId,
    actor_email: actor.email ?? null,
    action: 'update_support_contact',
    target_type: 'platform_setting',
    target_label: 'support_contact',
    metadata: { from: previous.display, to: contact.display },
  });
  if (auditError) logger.error('platform_audit_log insert failed', auditError);
  return contact;
}
