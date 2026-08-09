import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import {
  assignmentLimiter,
  orderSettlementLimiter,
  kitchenItemLimiter,
  getClientIp,
} from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import {
  orderMutationSchema,
  type OrderMutationInput,
} from '@/lib/validations/order-mutation.schema';
import {
  actionUpdateOrderStatus,
  actionMarkOrderPaid,
  actionUpdateItemStatus,
  actionSetCourseHeld,
} from '@/app/actions/orders';
import { actionAssignServer, actionReleaseAssignment } from '@/app/actions/assignments';

// Single idempotent endpoint for offline-replayable order mutations (status
// change, server assignment, release). The durable outbox on a tablet POSTs
// here with a client_request_id; on reconnect it may replay the same request,
// so we dedup on that key (order_mutation_requests) to guarantee the underlying
// action - including a cancel that restocks and releases a coupon - runs exactly
// once. Thin controller: it derives the tenant server-side and delegates to the
// same server actions the online path uses.

/**
 * Age au-dela duquel une reservation d'idempotence non traitee est consideree
 * abandonnee et peut etre reprise.
 *
 * Choisi tres au-dessus de la duree d'une requete normale (une mutation de
 * commande repond en dizaines de millisecondes, et la fonction serveur elle-meme
 * est plafonnee bien en dessous d'une minute). Descendre ce seuil risquerait de
 * relancer une mutation encore en vol; le monter laisserait un encaissement
 * reel bloque plus longtemps en "non synchronise" cote caisse.
 */
const STALE_CLAIM_MS = 60_000;

/** Runs the mutation for a given (already tenant-derived) request. */
async function dispatch(
  tenantId: string,
  input: OrderMutationInput,
): Promise<{ success?: boolean; error?: string; paid?: boolean }> {
  switch (input.type) {
    case 'status':
      return actionUpdateOrderStatus(tenantId, input.orderId, input.status);
    case 'assign':
      return actionAssignServer(tenantId, input.tableId, input.serverId);
    case 'release':
      return actionReleaseAssignment(tenantId, input.assignmentId);
    case 'pay':
      return actionMarkOrderPaid(tenantId, input.orderId, input.method, input.tipMinor);
    case 'item_status':
      return actionUpdateItemStatus(tenantId, input.orderId, input.itemIds, input.status);
    case 'course_held':
      return actionSetCourseHeld(tenantId, input.orderId, input.course, input.held);
  }
}

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // Le corps est lu AVANT la limitation de debit, contrairement a l'ordre
    // habituel des routes. Raison: le compartiment depend du type de mutation, et
    // un encaissement ne doit pas partager le budget des changements de statut.
    // Le cout est borne (un JSON.parse, taille plafonnee par la plateforme) et
    // verifyOrigin a deja filtre les appels hors domaine juste au-dessus.
    const body = await request.json().catch(() => null);
    const parsed = orderMutationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Donnees invalides' }, { status: 400 });
    }
    const input = parsed.data;

    // Compartiment propre (pas celui de la creation de commande): une rafale de
    // rejeux de statut/assignation a la reconnexion ne doit pas affamer la prise
    // de NOUVELLES commandes derriere l'IP NAT unique du restaurant.
    //
    // Les encaissements ont leur PROPRE compartiment, plus large: partager les
    // 30/min des assignations les faisait tomber en 429 en coup de feu, et comme
    // un 429 est classe transitoire, le paiement partait en file avec le message
    // "en attente de reseau" alors que le reseau allait tres bien.
    // Les gestes article de la cuisine ont eux aussi leur compartiment: le KDS
    // envoie une requete PAR article, donc leur cadence n'a rien de commun avec
    // celle des assignations (OFF-12).
    const limiter =
      input.type === 'pay'
        ? orderSettlementLimiter
        : input.type === 'item_status' || input.type === 'course_held'
          ? kitchenItemLimiter
          : assignmentLimiter;
    const ip = getClientIp(request);
    const { success: allowed } = await limiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

    // Derive the tenant server-side - never trust a client-supplied tenant id.
    // Primary: the middleware-injected slug (subdomain or /sites path). Fallback:
    // a Background Sync replay fired by the service worker carries no tenant
    // Referer, so on main-domain access the header is absent - derive from the
    // session instead when the user is an active member of exactly ONE tenant
    // (the common case for restaurant staff). Ambiguous membership -> 400, and
    // the outbox retries from a page context that does carry the slug.
    const tenantSlug = (await headers()).get('x-tenant-slug');
    let tenantId: string | null = null;
    if (tenantSlug) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', tenantSlug)
        .is('deleted_at', null)
        .single();
      if (!tenant) return NextResponse.json({ error: 'Tenant non trouve' }, { status: 404 });
      // Verify the caller belongs to this tenant before touching the idempotency
      // table (RLS also enforces this, but fail fast with a clear 403).
      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('id')
        .eq('user_id', user.id)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .maybeSingle();
      if (!adminUser) return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
      tenantId = tenant.id;
    } else {
      const { data: memberships } = await supabase
        .from('admin_users')
        .select('tenant_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(2);
      if (memberships?.length === 1) {
        tenantId = memberships[0].tenant_id;
      }
    }
    if (!tenantId) return NextResponse.json({ error: 'Tenant non identifie' }, { status: 400 });

    // Idempotency: claim the key first. A duplicate (replayed) request must not
    // re-run the action - but "duplicate" only dedupes as SUCCESS if the first
    // attempt actually completed (processed_at set). A concurrent in-flight
    // claim (page drain + SW background-sync racing after reconnect) gets 409
    // so the outbox keeps the entry and retries: by then the first attempt has
    // either completed (dedupe success) or failed (key deleted, replay re-runs).
    const { error: claimError } = await supabase
      .from('order_mutation_requests')
      .insert({ client_request_id: input.client_request_id, tenant_id: tenantId });
    if (claimError) {
      if (claimError.code === '23505') {
        const { data: existing } = await supabase
          .from('order_mutation_requests')
          .select('processed_at')
          .eq('client_request_id', input.client_request_id)
          .maybeSingle();
        if (existing?.processed_at) {
          return NextResponse.json({ success: true, deduped: true });
        }
        // Reprise d'une reservation abandonnee. Sans elle, un appelant qui meurt
        // entre l'insertion de la cle et la fin de la mutation (onglet ferme,
        // tablette en veille, timeout de la fonction) laisse une ligne
        // processed_at NULL pour toujours: chaque rejeu recoit 409 jusqu'a
        // epuisement du budget de tentatives, et un encaissement reel est
        // signale a l'operateur comme non synchronise alors qu'il n'a jamais
        // ete applique.
        //
        // La prise est ATOMIQUE: l'UPDATE ne matche que si la ligne est encore
        // non traitee ET encore vieille. Deux repreneurs simultanes ne peuvent
        // pas gagner tous les deux - Postgres reevalue le WHERE apres avoir pris
        // le verrou de ligne, donc le second ne matche plus rien et repart en
        // 409. Le delai depasse largement une requete normale: en dessous, on
        // relancerait une mutation encore en vol.
        const staleCutoff = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
        const { data: takenOver } = await supabase
          .from('order_mutation_requests')
          .update({ created_at: new Date().toISOString() })
          .eq('client_request_id', input.client_request_id)
          .is('processed_at', null)
          .lt('created_at', staleCutoff)
          .select('client_request_id')
          .maybeSingle();

        if (!takenOver) {
          // Reservation encore fraiche: une autre tentative est vraiment en vol.
          // 409 -> l'outbox garde l'entree et reessaie.
          return NextResponse.json({ error: 'Requete en cours' }, { status: 409 });
        }
        logger.warn('Order mutation stale claim taken over', {
          tenantId,
          type: input.type,
        });
        // Reservation reprise: on poursuit et on execute la mutation.
      } else {
        logger.error('Order mutation idempotency claim failed', {
          code: claimError.code,
          tenantId,
        });
        return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
      }
    }

    // Run the mutation. If it fails, release the key so the outbox can retry
    // (transient) or the operator can re-enter (permanent) without being blocked
    // by a key that never produced an effect.
    let result: { success?: boolean; error?: string; paid?: boolean };
    try {
      result = await dispatch(tenantId, input);
    } catch (err) {
      await supabase
        .from('order_mutation_requests')
        .delete()
        .eq('client_request_id', input.client_request_id);
      throw err;
    }

    if (result.error) {
      await supabase
        .from('order_mutation_requests')
        .delete()
        .eq('client_request_id', input.client_request_id);
      // The actions signal an UNEXPECTED internal failure with exactly these
      // sentinel messages (orders.ts: 'Erreur interne', assignments.ts:
      // 'Server error'). Those are transient -> 500 so the outbox retries.
      // Everything else is a business rejection (validation, permission,
      // ServiceError) -> 422, permanent, surfaced to the operator.
      const transient = result.error === 'Erreur interne' || result.error === 'Server error';
      return NextResponse.json({ error: result.error }, { status: transient ? 500 : 422 });
    }

    // Mark the claim as completed so a later replay of the same key dedupes as
    // success instead of answering 409 forever.
    await supabase
      .from('order_mutation_requests')
      .update({ processed_at: new Date().toISOString() })
      .eq('client_request_id', input.client_request_id);

    // `paid: false` remonte le no-op idempotent de markPaid (commande deja
    // reglee): la caisse affiche alors "deja encaissee" au lieu de laisser croire
    // que ce tap a pris un second paiement.
    return NextResponse.json({ success: true, paid: result.paid });
  } catch (err) {
    logger.error('Order mutation route failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
