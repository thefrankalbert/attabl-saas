'use server';

import { revalidateTag } from 'next/cache';
import { tenantConfigTag } from '@/lib/cache-tags';
import { logger } from '@/lib/logger';
import { getAuthenticatedUserWithTenant } from '@/lib/auth/get-session';

export async function actionTrackActivationEvent(event: string): Promise<void> {
  try {
    const { tenantId, supabase } = await getAuthenticatedUserWithTenant();

    const { data: tenant } = await supabase
      .from('tenants')
      .select('activation_events')
      .eq('id', tenantId)
      .single();

    const current = (tenant?.activation_events as Record<string, string>) ?? {};
    if (current[event]) return;

    const now = new Date().toISOString();

    const { error } = await supabase
      .from('tenants')
      .update({
        activation_events: { ...current, [event]: now },
        last_active_at: now,
      })
      .eq('id', tenantId);

    if (error) {
      logger.warn('actionTrackActivationEvent: DB error', { error, tenantId, event });
      return;
    }

    revalidateTag(tenantConfigTag(tenantId), 'max');
  } catch (err) {
    logger.error('actionTrackActivationEvent: unexpected error', { err, event });
  }
}
