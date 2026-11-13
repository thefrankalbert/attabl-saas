import { NextResponse } from 'next/server';
import { readTenantSlug } from '@/lib/auth/tenant-header';
import { stripe, getStripePriceId } from '@/lib/stripe/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { checkoutLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { updateSubscriptionSchema } from '@/lib/validations/checkout.schema';
import { withStripeBreaker } from '@/lib/stripe/circuit-breaker';
import { getTenantBillingIds } from '@/lib/billing/tenant-billing-ids';

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // 0. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await checkoutLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const supabase = await createClient();

    // 1. Authenticate user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    // 2. Resolve the ACTIVE tenant from the middleware-injected slug (multi-tenant safe),
    //    then verify the user is an owner/admin of THAT tenant.
    const tenantSlug = readTenantSlug(request.headers).slug;
    if (!tenantSlug) {
      return NextResponse.json({ error: 'Contexte tenant manquant' }, { status: 400 });
    }

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .maybeSingle();

    if (tenantError || !tenant) {
      logger.error('Update subscription: tenant not found', tenantError, { tenantSlug });
      return NextResponse.json({ error: 'Tenant non trouve' }, { status: 404 });
    }

    const { data: adminUser, error: adminUserError } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .maybeSingle();

    if (adminUserError || !adminUser) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    if (adminUser.role !== 'owner' && adminUser.role !== 'admin') {
      return NextResponse.json(
        { error: "Seuls les proprietaires et administrateurs peuvent modifier l'abonnement." },
        { status: 403 },
      );
    }

    // Membership + role verified above with the session client: the Stripe id
    // is now read with the service role (column not readable by `authenticated`).
    const subscriptionId = (await getTenantBillingIds(tenant.id))?.stripe_subscription_id;
    if (!subscriptionId) {
      return NextResponse.json(
        { error: 'Aucun abonnement actif. Creez un abonnement via le checkout.' },
        { status: 400 },
      );
    }

    // 3. Validate body with Zod
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requete invalide' }, { status: 400 });
    }

    const parseResult = updateSubscriptionSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message ?? 'Donnees invalides';
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { plan, billingInterval } = parseResult.data;

    // 4. Resolve the Stripe price ID server-side (single source of truth)
    let priceId: string;
    try {
      priceId = getStripePriceId(plan, billingInterval);
    } catch (configError) {
      logger.error('Update subscription: missing Stripe price configuration', configError, {
        plan,
        billingInterval,
      });
      return NextResponse.json(
        { error: 'Configuration de facturation manquante' },
        { status: 500 },
      );
    }

    // 5. Retrieve current subscription and update with proration
    const subscription = await withStripeBreaker(() =>
      stripe.subscriptions.retrieve(subscriptionId),
    );

    if (subscription.status === 'canceled') {
      return NextResponse.json(
        { error: "L'abonnement est annule. Creez un nouvel abonnement via le checkout." },
        { status: 400 },
      );
    }

    // Intrusion M-03: un abonnement en impaye pouvait changer de plan, et le
    // webhook appliquait le nouveau plan alors que rien n'etait paye. Le
    // changement n'est ouvert qu'a un abonnement en regle.
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return NextResponse.json(
        { error: "Reglez d'abord la facture en attente avant de changer de formule." },
        { status: 400 },
      );
    }

    const existingItem = subscription.items.data[0];
    if (!existingItem) {
      logger.error('Update subscription: no items found', undefined, {
        subscriptionId,
      });
      return NextResponse.json(
        { error: "Erreur de configuration de l'abonnement" },
        { status: 500 },
      );
    }

    const updatedSubscription = await withStripeBreaker(() =>
      stripe.subscriptions.update(subscriptionId, {
        items: [
          {
            id: existingItem.id,
            price: priceId,
          },
        ],
        // Intrusion M-03: `create_prorations` appliquait la formule superieure
        // tout de suite et laissait la difference en attente jusqu'au
        // renouvellement (11 mois sur une formule annuelle), sans jamais la
        // recouvrer si le client resiliait avant. La difference est maintenant
        // facturee immediatement, et Stripe n'applique le changement QUE si ce
        // paiement reussit: tant qu'il ne l'est pas, l'abonnement garde son
        // ancien prix et porte un `pending_update`.
        proration_behavior: 'always_invoice',
        payment_behavior: 'pending_if_incomplete',
      }),
    );

    if (updatedSubscription.pending_update) {
      // La facture de la difference est restee impayee (carte refusee, ou
      // banque qui exige une validation). On l'annule: mesure contre Stripe,
      // cela efface le changement en attente et laisse l'abonnement actif a
      // l'ancien prix. Sans cela elle restait ouverte, pouvait etre relancee,
      // ou payee plus tard depuis le portail alors que le changement avait
      // expire: le client aurait paye pour rien.
      // LIMITE CONNUE: une carte dont la banque exige une validation (3D
      // Secure) ne peut pas changer de formule depuis cet ecran, puisque la
      // facture est annulee au lieu d'etre presentee au client. Le parcours
      // reste ouvert par la mise a jour de la carte dans la facturation.
      const factureId =
        typeof updatedSubscription.latest_invoice === 'string'
          ? updatedSubscription.latest_invoice
          : updatedSubscription.latest_invoice?.id;
      if (factureId) {
        // Deux essais: une facture restee ouverte pourrait etre relancee par
        // Stripe et appliquer le changement apres qu'on a dit le contraire.
        let annulee = false;
        for (let essai = 0; essai < 2 && !annulee; essai += 1) {
          try {
            await withStripeBreaker(() => stripe.invoices.voidInvoice(factureId));
            annulee = true;
          } catch (voidError) {
            logger.error('Changement de formule: facture refusee non annulee', voidError, {
              subscriptionId: updatedSubscription.id,
              tenantId: tenant.id,
              invoiceId: factureId,
              essai: essai + 1,
            });
          }
        }
        if (!annulee) {
          // L'annulation a echoue deux fois. Avant de repondre, on regarde ce
          // qu'est devenue la facture: elle a pu etre annulee par ailleurs, ou
          // PAYEE entre-temps, auquel cas le changement est applique et dire
          // "contactez le support" serait faux.
          let statutFacture: string | null = null;
          try {
            statutFacture = (await withStripeBreaker(() => stripe.invoices.retrieve(factureId)))
              .status;
          } catch (lectureError) {
            logger.error('Changement de formule: facture refusee illisible', lectureError, {
              tenantId: tenant.id,
              invoiceId: factureId,
            });
          }

          if (statutFacture === 'paid') {
            logger.info('Changement de formule: facture payee entre-temps, changement applique', {
              subscriptionId: updatedSubscription.id,
              tenantId: tenant.id,
            });
            return NextResponse.json({
              subscriptionId: updatedSubscription.id,
              status: updatedSubscription.status,
            });
          }

          if (statutFacture !== 'void') {
            return NextResponse.json(
              {
                error:
                  "Le paiement de la difference n'a pas abouti et la demande n'a pas pu etre annulee. Contactez le support avant de reessayer.",
                code: 'PAYMENT_REQUIRED',
              },
              { status: 402 },
            );
          }
        }
      }
      logger.warn('Changement de formule refuse: paiement de la difference non abouti', {
        subscriptionId: updatedSubscription.id,
        tenantId: tenant.id,
      });
      return NextResponse.json(
        {
          error:
            "Le paiement de la difference n'a pas abouti: votre formule est inchangee et rien n'a ete preleve. Mettez a jour votre carte dans la facturation, puis reessayez.",
          code: 'PAYMENT_REQUIRED',
        },
        { status: 402 },
      );
    }

    logger.info('Subscription updated successfully', {
      subscriptionId: updatedSubscription.id,
      newPriceId: priceId,
      tenantId: tenant.id,
    });

    return NextResponse.json({
      subscriptionId: updatedSubscription.id,
      status: updatedSubscription.status,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Subscription update error', error, { message: msg });
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
