import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import type { UnsubscribeSubject } from '@/lib/email/unsubscribe-token';

/**
 * Desinscription des e-mails de relance (R5/T9).
 *
 * Recoit le client service_role: la route qui l'appelle est publique (le lien
 * vient d'un e-mail, sans session) et l'autorisation est le jeton signe deja
 * verifie par l'appelant. La colonne n'est pas inscriptible par `authenticated`
 * (migration 20261125090000).
 */
export function createEmailUnsubscribeService(supabase: SupabaseClient) {
  return {
    /**
     * Pose la desinscription de la personne pour ce restaurant. Idempotent: une
     * date deja posee est conservee (la premiere demande fait foi).
     */
    async optOut(subject: UnsubscribeSubject, now: Date = new Date()): Promise<void> {
      const { error } = await supabase
        .from('admin_users')
        .update({ lifecycle_emails_opt_out_at: now.toISOString() })
        .eq('id', subject.adminUserId)
        .eq('tenant_id', subject.tenantId)
        .is('lifecycle_emails_opt_out_at', null);
      if (error) throw new ServiceError('Desinscription impossible', 'INTERNAL', error);
    },
  };
}
