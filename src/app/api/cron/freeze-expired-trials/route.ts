import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { runApiRoute } from '@/lib/api-route-context';
import {
  FREEZE_REASONS,
  updateTolerantToMissingFreezeReason,
  type FreezeReason,
} from '@/lib/billing/freeze-reason';

/**
 * Freeze trials that expired without ever subscribing.
 *
 * A tenant that signs up starts on a 14-day (or 7-day A/B) trial with
 * subscription_status='trial' and NO Stripe subscription. If they never pay,
 * nothing ever freezes them: there is no Stripe subscription, so no webhook
 * fires, and getEffectivePlan/isSubscriptionUsable still treat 'trial' as
 * usable. This cron closes that gap by flipping such tenants to 'frozen', which
 * the middleware already redirects to the subscription page (proxy.ts B2).
 *
 * Tenants that DID subscribe (stripe_subscription_id set) are left untouched -
 * Stripe drives their lifecycle via the webhook.
 *
 * subscription_status is a service_role-only column (see migration
 * 20260420000002_restrict_tenant_billing_updates), so this must run with the
 * admin client.
 */
// Vercel cron jobs trigger a GET request (with Authorization: Bearer CRON_SECRET
// when the secret is set). A POST-only handler would 405 and the cron would never
// run - keep this as GET so the scheduled job actually fires.
/** Delai avant de geler un impaye, aligne sur la duree de relance Stripe. */
const PAST_DUE_GRACE_DAYS = 15;

/** Plafond de gels d'impayes par execution (voir le commentaire au point d'appel). */
const MAX_PAST_DUE_FREEZES_PER_RUN = 25;

export async function GET(request: Request) {
  return runApiRoute(request, async () => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      logger.error('CRON_SECRET is not configured');
      return NextResponse.json({ error: 'Service indisponible' }, { status: 503 });
    }

    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
    }

    const nowIso = new Date().toISOString();
    const supabase = createAdminClient();
    // F6: le webhook customer.subscription.deleted met is_active=false; ce cron
    // ne le faisait pas. Or le middleware ne protege que /sites/<slug>/admin: la
    // vitrine et POST /api/orders restaient ouverts, et validateTenant ne
    // regardait que is_active. Un essai expire continuait donc d'encaisser.
    //
    // Les deux gels de ce cron ne partagent PLUS un seul payload: ils ont deux
    // causes distinctes. `charge.dispute.closed` ne leve que le gel dont la
    // cause est un litige, donc un gel sans cause - ou avec la mauvaise - ne se
    // leve pas sur un litige gagne. Voir lib/billing/freeze-reason.
    const freezeUpdate = (reason: FreezeReason) =>
      ({ subscription_status: 'frozen', is_active: false, freeze_reason: reason }) as const;

    const { data, error } = await updateTolerantToMissingFreezeReason(
      freezeUpdate(FREEZE_REASONS.TRIAL_EXPIRED),
      (payload) =>
        supabase
          .from('tenants')
          .update(payload)
          .eq('subscription_status', 'trial')
          .lt('trial_ends_at', nowIso)
          .is('stripe_subscription_id', null)
          .select('id'),
      { cause: FREEZE_REASONS.TRIAL_EXPIRED },
    );

    if (error) {
      logger.error('freeze_expired_trials failed', error);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }

    // F3: borner l'impaye. Sans borne, un tenant dont la relance Stripe s'acheve
    // sur "unpaid" garde son plan a vie. PAST_DUE_GRACE_DAYS est aligne sur la
    // duree de relance Stripe par defaut (~15 jours): geler plus tot punirait un
    // client dont le paiement va encore aboutir.
    const graceCutoff = new Date(
      Date.now() - PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Le gel d'impaye est PLAFONNE par execution. La migration qui introduit
    // past_due_since retro-remplit tous les tenants deja en impaye avec la meme
    // valeur (`now()`), faute de connaitre leur vraie date d'entree: ils
    // franchissent donc le seuil LE MEME JOUR. Sans plafond, une seule execution
    // pourrait eteindre d'un coup toute la population impayee - vitrines et
    // commandes comprises. Le plafond etale l'effet sur plusieurs executions et
    // laisse le temps de voir passer une anomalie dans les logs.
    //
    // Ce que le plafond coute, chiffre (CTR-4). Chaque execution retire jusqu'a
    // MAX_PAST_DUE_FREEZES_PER_RUN candidats de l'ensemble `past_due`, et le cron
    // tourne une fois par jour ("0 2 * * *", vercel.json). La borne reelle d'un
    // impaye est donc:
    //
    //     PAST_DUE_GRACE_DAYS + ceil(K / MAX_PAST_DUE_FREEZES_PER_RUN) jours
    //
    // ou K est le nombre de candidats dont la date est anterieure ou egale a la
    // sienne. Soit 15 + ceil(K/25): 19 jours pour K=100, 35 jours pour K=500.
    // Ce n'est donc pas "sous 24 h", et ce n'est pas non plus "24 h x N" sans
    // plus de precision.
    //
    // Deuxieme chose a savoir: le tri ci-dessous ne DISCRIMINE PAS des dates
    // egales, et le retro-remplissage de la migration donne le meme `now()` a
    // toute la population heritee. Un second critere deterministe (`id`) evite
    // qu'un meme tenant soit repousse d'execution en execution au gre du plan
    // d'execution Postgres.
    //
    // Relever le plafond echangerait ce retard contre le risque d'eteindre toute
    // la population impayee d'un coup: le choix est assume, pas oublie. A revoir
    // si le journal ci-dessous se met a crier a chaque execution.
    const { data: pastDueCandidates, error: candidatesError } = await supabase
      .from('tenants')
      .select('id')
      .eq('subscription_status', 'past_due')
      // Un past_due_since NULL ne satisfait pas la comparaison (NULL < x vaut
      // NULL en SQL): les tenants sans date sont exclus sans clause de plus.
      .lt('past_due_since', graceCutoff)
      .order('past_due_since', { ascending: true })
      // Ordre total: `past_due_since` seul laisse les dates egales (tout le
      // retro-remplissage) dans un ordre non defini.
      .order('id', { ascending: true })
      .limit(MAX_PAST_DUE_FREEZES_PER_RUN);

    if (candidatesError) {
      logger.error('freeze_expired_past_due candidates failed', candidatesError);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }

    const candidateIds = (pastDueCandidates ?? []).map((t) => t.id);
    let pastDue: { id: string }[] = [];

    if (candidateIds.length > 0) {
      const { data: updated, error: pastDueError } = await updateTolerantToMissingFreezeReason(
        freezeUpdate(FREEZE_REASONS.PAST_DUE_OVERDUE),
        (payload) =>
          supabase
            .from('tenants')
            .update(payload)
            .in('id', candidateIds)
            // Re-verifie le statut a l'ecriture: un tenant peut avoir paye entre
            // la selection et la mise a jour, et il ne doit pas etre gele.
            .eq('subscription_status', 'past_due')
            .select('id'),
        { cause: FREEZE_REASONS.PAST_DUE_OVERDUE },
      );

      if (pastDueError) {
        logger.error('freeze_expired_past_due failed', pastDueError);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
      }
      pastDue = updated ?? [];
    }

    if (candidateIds.length === MAX_PAST_DUE_FREEZES_PER_RUN) {
      logger.warn('Plafond de gels d impayes atteint, le reste suivra', {
        cap: MAX_PAST_DUE_FREEZES_PER_RUN,
      });
    }

    const frozen = data?.length ?? 0;
    const frozenPastDue = pastDue?.length ?? 0;
    logger.info('Expired unpaid trials frozen', { frozen, frozenPastDue });

    return NextResponse.json({ success: true, frozen, frozenPastDue });
  });
}
