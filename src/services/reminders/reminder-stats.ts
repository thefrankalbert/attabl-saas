import type { SupabaseClient } from '@supabase/supabase-js';
import { REMINDER_RULES, type ReminderRule } from '@/lib/validations/reminders.schema';

/** "Regle" en 5 minutes apres le rappel: le seuil de reussite affiche a l'administration. */
export const RESOLVED_WITHIN_MIN = 5;

export interface ReminderRuleStats {
  rule: ReminderRule;
  /** service = pendant le service (mesure: reglement); scheduled = a heure fixe (mesure: ouverture). */
  kind: 'service' | 'scheduled';
  sent: number;
  escalated: number;
  restaurants: number;
  /** Rappels de service: part reglee en moins de 5 min (null = aucun rappel). */
  resolvedWithinRate: number | null;
  /** Rappels de service: minutes medianes entre le rappel et le reglement. */
  medianMinutesToResolve: number | null;
  /** Rappels a heure fixe: part des notifications ouvertes par leur destinataire. */
  openedRate: number | null;
  muted: number;
}

const SERVICE: readonly ReminderRule[] = ['order_ready_not_served', 'order_not_started'];

interface StatsRow {
  rule: string;
  sent: number;
  escalated: number;
  restaurants: number;
  resolved_within: number;
  median_minutes: number | null;
  notifications: number;
  opened: number;
}

/**
 * Mesures des 30 derniers jours, pour la console de la plateforme (service_role,
 * tous les restaurants). Agregees EN BASE (reminder_rule_stats): l'API plafonne
 * chaque reponse a 1000 lignes. Des faits seulement: aucune regle n'est jamais
 * coupee automatiquement, la decision revient a l'administration.
 */
export async function loadReminderStats(
  admin: SupabaseClient,
  now: Date,
  days = 30,
): Promise<ReminderRuleStats[]> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60_000).toISOString();
  const [statsRes, ...muteRes] = await Promise.all([
    admin.rpc('reminder_rule_stats', {
      p_since: since,
      p_resolved_within_min: RESOLVED_WITHIN_MIN,
    }),
    // Compte exact sans rapatrier les lignes (pas de plafond de 1000).
    ...REMINDER_RULES.map((rule) =>
      admin
        .from('reminder_preferences')
        .select('rule', { count: 'exact', head: true })
        .eq('rule', rule)
        .eq('muted', true),
    ),
  ]);
  if (statsRes.error) throw statsRes.error;
  for (const r of muteRes) if (r.error) throw r.error;
  const rows = (statsRes.data ?? []) as StatsRow[];

  return REMINDER_RULES.map((rule, i) => {
    const row = rows.find((r) => r.rule === rule);
    const isService = SERVICE.includes(rule);
    const sent = Number(row?.sent ?? 0);
    const notifications = Number(row?.notifications ?? 0);
    return {
      rule,
      kind: isService ? 'service' : 'scheduled',
      sent,
      escalated: Number(row?.escalated ?? 0),
      restaurants: Number(row?.restaurants ?? 0),
      resolvedWithinRate: isService && sent ? Number(row?.resolved_within ?? 0) / sent : null,
      medianMinutesToResolve:
        isService && row?.median_minutes != null ? Number(row.median_minutes) : null,
      openedRate: !isService && notifications ? Number(row?.opened ?? 0) / notifications : null,
      muted: muteRes[i].count ?? 0,
    };
  });
}
