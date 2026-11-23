'use server';

import { revalidateTag, revalidatePath } from 'next/cache';
import { tenantConfigTag } from '@/lib/cache-tags';
import { logger } from '@/lib/logger';
import { getAuthenticatedUserWithTenant } from '@/lib/auth/get-session';
import { assertTenantServing, TenantLockedError } from '@/lib/billing/assert-tenant-serving';
import { z } from 'zod';
import { ACTIVE_PAYMENT_METHOD_IDS } from '@/lib/payments/methods';

const activeMethods = ACTIVE_PAYMENT_METHOD_IDS as string[];

const updatePaymentMethodsSchema = z.object({
  methods: z
    .array(z.string())
    .min(1, 'Au moins un moyen de paiement requis')
    .refine(
      (methods) => methods.every((m) => activeMethods.includes(m)),
      'Moyen de paiement non supporte',
    ),
});

export async function actionUpdatePaymentMethods(
  methods: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const { tenantId, supabase } = await getAuthenticatedUserWithTenant('settings.edit');
    // Coupure du restaurant: changer les moyens de paiement est une ecriture.
    await assertTenantServing(tenantId);

    const validated = updatePaymentMethodsSchema.safeParse({ methods });
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0]?.message };
    }

    const { error, count } = await supabase
      .from('tenants')
      .update({ enabled_payment_methods: validated.data.methods }, { count: 'exact' })
      .eq('id', tenantId);

    if (error) {
      logger.error('actionUpdatePaymentMethods: DB error', { error, tenantId });
      return { success: false, error: 'Erreur lors de la mise a jour' };
    }
    // Un UPDATE refuse par la RLS ne leve aucune erreur: il ne touche aucune
    // ligne. Sans ce controle, un role a qui `settings.edit` a ete accorde mais
    // que la politique de `tenants` refuse lisait "enregistre" pour rien
    // (revue L012, A6).
    if (count === 0) {
      logger.warn('actionUpdatePaymentMethods: update matched no row', { tenantId });
      return {
        success: false,
        error: 'Votre role ne permet pas de modifier les moyens de paiement. Demandez au gerant.',
      };
    }

    // The per-tenant cache is keyed by SLUG, not id - resolve it so the convive
    // storefront reflects the new payment methods immediately (not after TTL).
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('slug')
      .eq('id', tenantId)
      .single();
    if (tenantRow?.slug) {
      revalidateTag(tenantConfigTag(tenantRow.slug), 'max');
      revalidatePath(`/sites/${tenantRow.slug}`);
      revalidatePath(`/sites/${tenantRow.slug}/cart`);
    }
    return { success: true };
  } catch (err) {
    // Avant le message generique: un restaurant coupe doit voir la vraie raison.
    if (err instanceof TenantLockedError) {
      return { success: false, error: err.message };
    }
    logger.error('actionUpdatePaymentMethods: unexpected error', { err });
    return { success: false, error: 'Erreur serveur' };
  }
}
