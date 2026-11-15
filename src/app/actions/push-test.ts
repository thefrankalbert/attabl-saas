'use server';

import { logger } from '@/lib/logger';
import { getAuthenticatedUserWithTenant } from '@/lib/auth/get-session';
import { pushSubscriptionLimiter } from '@/lib/rate-limit';
import { createPushService } from '@/services/push.service';
import { localeOf } from '@/services/reminders/messages';

/** Codes traduits par l'interface (pushNotifications.testErrors.*). */
export type TestAlertError = 'noDevice' | 'tooMany' | 'failed';
type Result = { success: true; sent: number } | { success: false; error: TestAlertError };

/**
 * Envoie une alerte urgente de test sur les appareils de la personne
 * connectee, et seulement les siens: c'est la seule facon de verifier sur un
 * vrai telephone que l'alerte vibre, sonne et reste affichee. Le client
 * serveur (RLS) ne lit de toute facon que ses propres abonnements.
 */
export async function actionSendTestAlert(): Promise<Result> {
  try {
    const { tenantId, adminUserId, supabase } = await getAuthenticatedUserWithTenant();
    const { success: allowed } = await pushSubscriptionLimiter.check(`test-alert:${adminUserId}`);
    if (!allowed) return { success: false, error: 'tooMany' };

    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('slug, default_locale')
      .eq('id', tenantId)
      .maybeSingle();
    if (error || !tenant) return { success: false, error: 'failed' };

    const en = localeOf(tenant.default_locale as string | null) === 'en';
    const result = await createPushService(supabase).envoyerAuxAppareilsDuTenant(
      tenantId,
      {
        titre: en
          ? 'Test: order ready for 3 min - Table 4'
          : 'Test : commande prête depuis 3 min - Table 4',
        corps: en
          ? 'This is a test. Your phone should vibrate and keep this message on screen.'
          : 'Ceci est un essai. Votre téléphone doit vibrer et garder ce message affiché.',
        tag: `test-alerte-${adminUserId}`,
        alerte: true,
        url: '/service',
        slug: tenant.slug as string,
      },
      { membres: [adminUserId] },
    );
    // Aucun envoi: aucun appareil abonne pour CE restaurant (ou un super
    // administrateur qui n'en est pas membre).
    if (result.envoyees === 0) return { success: false, error: 'noDevice' };
    return { success: true, sent: result.envoyees };
  } catch (err) {
    logger.error('actionSendTestAlert: unexpected error', err);
    return { success: false, error: 'failed' };
  }
}
