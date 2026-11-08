import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';
import { getTranslations } from 'next-intl/server';
import { createInventoryService } from '@/services/inventory.service';
import { createPlanEnforcementService } from '@/services/plan-enforcement.service';
import { determineOrderEventKey, sendOrderEmailForKey } from '@/services/trigger-emails.service';

// Fallback translations for API routes where locale may not be resolved
export const FALLBACK_ERRORS: Record<string, string> = {
  rateLimited: 'Trop de requetes. Reessayez plus tard.',
  tenantNotIdentified: 'Tenant non identifie',
  invalidRequestBody: 'Corps de requete invalide',
  invalidOrderData: 'Donnees de commande invalides',
  tenantConfigNotFound: 'Configuration du restaurant non trouvee',
  invalidCoupon: 'Coupon invalide',
  orderSuccess: 'Commande envoyee avec succes',
  serverError: 'Erreur serveur',
  connectionError: 'Erreur de connexion',
};

export async function getT(): Promise<(key: string) => string> {
  try {
    return await getTranslations('errors');
  } catch {
    return (key: string) => FALLBACK_ERRORS[key] || key;
  }
}

// Tenant shape accepted by getMonthlyOrderUsage (subset of the validated tenant).
type QuotaTenant = {
  id: string;
  subscription_plan?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
};

// 9. Create in-app notification for admins (scheduled via after() so Vercel
// serverless runs it after the response instead of racing a fire-and-forget promise).
//
// LA NOTIFICATION DANS L'APPLICATION NE SUFFIT PAS. La ligne `notifications`
// n'est vue que si quelqu'un regarde l'ecran, application ouverte. Une tablette
// en veille au comptoir ne montre rien. On envoie donc AUSSI un push, qui
// reveille l'appareil - c'est la difference entre une commande vue tout de
// suite et une commande vue au prochain passage en cuisine.
//
// Les deux partent du meme endroit et portent le meme texte: deux sources
// divergentes finiraient par annoncer deux choses differentes pour une seule
// commande.
export function scheduleOrderNotification(
  adminSupabase: SupabaseClient,
  params: {
    tenantId: string;
    tableNumber: string | undefined;
    itemsCount: number;
    total: number;
    currency: string | null | undefined;
    orderId: string;
  },
): void {
  const { tenantId, tableNumber, itemsCount, total, currency, orderId } = params;
  const titre = `Nouvelle commande - Table ${tableNumber}`;
  const corps = `${itemsCount} article${itemsCount > 1 ? 's' : ''} - ${total.toLocaleString('fr-FR')} ${currency || 'XAF'}`;

  after(async () => {
    const { error: notifError } = await adminSupabase.from('notifications').insert({
      tenant_id: tenantId,
      user_id: null, // broadcast to all tenant admins
      type: 'info',
      title: titre,
      body: corps,
      link: `/orders`,
    });
    if (notifError) {
      logger.error('Failed to create order notification', notifError, {
        tenantId,
        orderId,
      });
    }

    try {
      const { createPushService } = await import('@/services/push.service');
      await createPushService(adminSupabase).envoyerAuxAppareilsDuTenant(tenantId, {
        titre,
        corps,
        // Meme `tag` pour toutes les commandes: un service de midi ne doit pas
        // laisser quarante notifications empilees dans la barre de l'appareil.
        tag: 'nouvelle-commande',
        // Chemin dans l'origine du restaurant (slug.attabl.com), ou le service
        // worker est enregistre - pas le chemin interne /sites/<slug>/...
        url: '/admin/orders',
      });
    } catch (erreurPush) {
      // Une commande ne doit jamais dependre d'une notification.
      logger.error('Envoi push de nouvelle commande impossible', erreurPush, {
        tenantId,
        orderId,
      });
    }
  });
}

// 10. Behavioral email triggers (scheduled via after() so Vercel serverless
// guarantees the work runs after the response is sent, instead of racing
// a fire-and-forget promise that the platform may freeze/terminate).
export function scheduleTriggerEmails(
  adminSupabase: SupabaseClient,
  params: { tenantId: string; tenantSlug: string },
): void {
  const { tenantId, tenantSlug } = params;
  after(async () => {
    try {
      const [countResult, ownerResult, tenantExtResult] = await Promise.all([
        adminSupabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
        adminSupabase
          .from('admin_users')
          .select('email')
          .eq('tenant_id', tenantId)
          .eq('role', 'owner')
          .maybeSingle(),
        adminSupabase.from('tenants').select('name, activation_events').eq('id', tenantId).single(),
      ]);

      const ordersCount = countResult.count ?? 0;
      const adminEmail = ownerResult.data?.email;
      if (!adminEmail) return;

      const restaurantName = (tenantExtResult.data?.name as string | undefined) ?? tenantSlug;
      const activationEvents =
        (tenantExtResult.data?.activation_events as Record<string, string> | undefined) ?? {};
      const dashboardUrl = `https://${tenantSlug}.attabl.com/admin`;

      const eventKey = determineOrderEventKey({ ordersCount, activationEvents });
      if (eventKey) {
        // Atomically claim the event slot server-side - merges into the live row
        // (no stale snapshot), so a concurrent writer's key is never clobbered.
        const { data: claimed } = await adminSupabase.rpc('claim_activation_event', {
          p_tenant_id: tenantId,
          p_event_key: eventKey,
        });
        if (claimed) {
          await sendOrderEmailForKey(eventKey, { adminEmail, restaurantName, dashboardUrl });
        }
      }
    } catch (triggerErr) {
      logger.warn('Order trigger email check failed (non-blocking)', { err: triggerErr });
    }
  });
}

// 11. Auto-destock inventory (non-blocking - order succeeds even if destock fails)
// Scheduled via after() so destock + low-stock check survive serverless
// freeze after the response (was a raced fire-and-forget chain).
export function scheduleDestock(
  adminSupabase: SupabaseClient,
  params: { orderId: string; tenantId: string },
): void {
  const { orderId, tenantId } = params;
  after(async () => {
    try {
      const inventoryService = createInventoryService(adminSupabase);
      await inventoryService.destockOrder(orderId, tenantId);
      const { checkAndNotifyLowStock } = await import('@/services/notification.service');
      await checkAndNotifyLowStock(tenantId);
    } catch (err) {
      logger.error('Auto-destock failed (non-blocking)', err);
      Sentry.captureException(err, {
        tags: { area: 'inventory-destock' },
        extra: { orderId, tenantId },
      });
    }
  });
}

// 12. Monthly order quota check (NON-blocking - never rejects an order).
// Scheduled via after() so it survives serverless freeze, like the blocks above.
// Warns admins once per month when the plan's monthly order quota is exceeded.
export function scheduleMonthlyQuotaCheck(
  adminSupabase: SupabaseClient,
  params: { tenant: QuotaTenant; tenantId: string },
): void {
  const { tenant, tenantId } = params;
  after(async () => {
    try {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const enforcement = createPlanEnforcementService(adminSupabase);
      const usage = await enforcement.getMonthlyOrderUsage(tenant, monthStart);
      if (!usage.exceeded) return;

      const monthKey = `monthly_quota_exceeded_${now.getUTCFullYear()}_${now.getUTCMonth() + 1}`;
      // Atomically claim the monthly slot server-side - merges into the live row,
      // so a concurrent writer's key is never clobbered. Notify once per month.
      const { data: claimed } = await adminSupabase.rpc('claim_activation_event', {
        p_tenant_id: tenantId,
        p_event_key: monthKey,
      });
      if (claimed) {
        await adminSupabase.from('notifications').insert({
          tenant_id: tenantId,
          user_id: null,
          type: 'warning',
          title: 'Quota de commandes mensuel atteint',
          body: `Votre plan inclut ${usage.limit} commandes par mois. Passez au plan superieur pour lever cette limite.`,
          link: `/admin/subscription`,
        });
      }
    } catch (quotaErr) {
      logger.warn('Monthly quota check failed (non-blocking)', { err: quotaErr });
    }
  });
}
