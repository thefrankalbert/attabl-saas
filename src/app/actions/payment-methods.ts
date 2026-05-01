'use server';

import { revalidateTag } from 'next/cache';
import { tenantConfigTag } from '@/lib/cache-tags';
import { logger } from '@/lib/logger';
import { getAuthenticatedUserWithTenant } from '@/lib/auth/get-session';
import { z } from 'zod';

const VALID_PAYMENT_METHODS = ['cash', 'card', 'wave', 'orange_money', 'mtn_momo', 'free_money'];

const updatePaymentMethodsSchema = z.object({
  methods: z
    .array(z.enum(['cash', 'card', 'wave', 'orange_money', 'mtn_momo', 'free_money']))
    .min(1, 'Au moins un moyen de paiement requis'),
});

export async function actionUpdatePaymentMethods(
  methods: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const { tenantId, supabase } = await getAuthenticatedUserWithTenant();

    const validated = updatePaymentMethodsSchema.safeParse({ methods });
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0]?.message };
    }

    const { error } = await supabase
      .from('tenants')
      .update({ enabled_payment_methods: validated.data.methods })
      .eq('id', tenantId);

    if (error) {
      logger.error('actionUpdatePaymentMethods: DB error', { error, tenantId });
      return { success: false, error: 'Erreur lors de la mise a jour' };
    }

    revalidateTag(tenantConfigTag(tenantId), 'max');
    return { success: true };
  } catch (err) {
    logger.error('actionUpdatePaymentMethods: unexpected error', { err });
    return { success: false, error: 'Erreur serveur' };
  }
}

export { VALID_PAYMENT_METHODS };
