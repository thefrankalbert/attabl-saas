import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import type { ReminderRule } from '@/lib/validations/reminders.schema';
import type { ServicePush } from '@/services/push.service';
import type { StaffMember } from './rules';
import type { ReminderMessage } from './messages';

/** Une personne ne recoit pas deux rappels de la meme regle a moins de 2 min: on groupe. */
const BATCH_INTERVAL_MIN = 2;
const MINUTE = 60_000;

export interface ReminderGroup {
  tenant: { id: string; slug: string };
  recipient: StaffMember;
  rule: ReminderRule;
  level: 1 | 2;
  subjects: { key: string; label: string }[];
  message: (labels: string[]) => ReminderMessage;
}

/** Envoi des rappels: anti-doublon en base, cloche de l'application, push. */
export function createReminderDelivery(supabase: SupabaseClient, push: ServicePush) {
  /**
   * Destinataires qui ont DEJA recu ce rappel a heure fixe (ce jour, cette
   * semaine). B86: la reprise se fait destinataire par destinataire. L'ancien
   * test "une ligne existe pour ce sujet" sautait tout l'envoi au passage
   * suivant des que la cloche d'UN destinataire avait reussi: celui dont la
   * livraison avait echoue ne recevait jamais le rappel.
   */
  async function recipientsAlreadySent(
    tenantId: string,
    rule: ReminderRule,
    subject: string,
  ): Promise<Set<string>> {
    const { data, error } = await supabase
      .from('reminders')
      .select('recipient_id')
      .eq('tenant_id', tenantId)
      .eq('rule', rule)
      .eq('subject_key', subject);
    if (error) throw error;
    return new Set((data ?? []).map((r) => r.recipient_id as string));
  }

  /** Envoie un groupe: reserve les lignes (anti-doublon), puis cloche, puis push. */
  async function sendGroup(group: ReminderGroup, now: Date): Promise<boolean> {
    const { tenant, recipient, rule, level } = group;

    const since = new Date(now.getTime() - BATCH_INTERVAL_MIN * MINUTE).toISOString();
    const { data: recent, error: rErr } = await supabase
      .from('reminders')
      .select('id')
      .eq('recipient_id', recipient.id)
      .eq('rule', rule)
      // Par niveau: une escalade ne doit jamais attendre derriere des niveaux 1.
      .eq('level', level)
      .gte('created_at', since)
      .limit(1);
    if (rErr) throw rErr;
    // Trop tot: les sujets restent dus et partiront groupes au prochain passage.
    if (recent?.length) return false;

    const { data: claimed, error: iErr } = await supabase
      .from('reminders')
      .upsert(
        group.subjects.map((s) => ({
          tenant_id: tenant.id,
          rule,
          subject_key: s.key,
          recipient_id: recipient.id,
          level,
        })),
        { onConflict: 'tenant_id,rule,subject_key,recipient_id,level', ignoreDuplicates: true },
      )
      .select('id, subject_key');
    if (iErr) throw iErr;
    if (!claimed?.length) return false;

    const claimedKeys = new Set(claimed.map((c) => c.subject_key as string));
    const labels = group.subjects.filter((s) => claimedKeys.has(s.key)).map((s) => s.label);
    const message = group.message(labels);

    const claimedIds = claimed.map((c) => c.id as string);
    // Une livraison ratee libere la reservation: sinon la cle unique bloquerait
    // le rappel pour toujours. Le prochain passage reessaiera.
    const release = async (reason: string, error: unknown) => {
      logger.warn(`Reminders: ${reason}, claim released for retry`, { error, rule });
      // B86: une liberation ratee laisse la cle unique bloquer ce rappel; le dire.
      const { error: dErr } = await supabase.from('reminders').delete().in('id', claimedIds);
      if (dErr) {
        logger.error('Reminders: claim release failed, reminder blocked until cleanup', dErr, {
          rule,
          tenantId: tenant.id,
        });
      }
      return false;
    };

    if (recipient.userId) {
      const { data: notif, error: nErr } = await supabase
        .from('notifications')
        .insert({
          tenant_id: tenant.id,
          user_id: recipient.userId,
          type: `reminder:${rule}`,
          title: message.title,
          body: message.body,
          link: message.url,
        })
        .select('id')
        .single();
      if (nErr || !notif) return release('in-app notification failed', nErr);
      // Sans ce lien, le reglement ne retirerait jamais la notification de la cloche.
      const { error: lErr } = await supabase
        .from('reminders')
        .update({ notification_id: notif.id })
        .in('id', claimedIds);
      if (lErr) {
        await supabase.from('notifications').delete().eq('id', notif.id);
        return release('notification link failed', lErr);
      }
    }

    await push.envoyerAuxAppareilsDuTenant(
      tenant.id,
      {
        titre: message.title,
        corps: message.body,
        // Un tag par personne et par regle: le nouveau resume remplace l'ancien.
        tag: `rappel-${rule}-${recipient.id}`,
        url: message.url,
        slug: tenant.slug,
        alerte: message.urgent,
      },
      { membres: [recipient.id] },
    );
    return true;
  }

  return { recipientsAlreadySent, sendGroup };
}
