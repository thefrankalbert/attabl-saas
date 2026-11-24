import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';

/**
 * Choix de desabonnement des relances commerciales, PAR ADRESSE (un
 * proprietaire de plusieurs restaurants se desabonne une fois pour toutes).
 *
 * Table `email_unsubscribes`: aucun droit anon/authenticated, le client recu
 * ici est donc le client service_role (route de desabonnement, envois de
 * relance). Les adresses recues sont DEJA normalisees
 * (`normalizeEmailAddress`): c'est la forme exigee par la contrainte de table.
 *
 * Une erreur de lecture LEVE: l'appelant n'envoie alors rien (une relance a
 * une personne desabonnee est pire qu'une relance manquee).
 */
export function createEmailUnsubscribeService(supabase: SupabaseClient) {
  return {
    /** Parmi ces adresses normalisees, celles qui sont desabonnees. */
    async findUnsubscribed(emails: string[]): Promise<Set<string>> {
      if (emails.length === 0) return new Set();
      const { data, error } = await supabase
        .from('email_unsubscribes')
        .select('email_normalized')
        .in('email_normalized', [...new Set(emails)]);
      if (error) throw new ServiceError('Lecture des desabonnements impossible', 'INTERNAL', error);
      return new Set((data ?? []).map((row: { email_normalized: string }) => row.email_normalized));
    },

    async isUnsubscribed(email: string): Promise<boolean> {
      return (await this.findUnsubscribed([email])).has(email);
    },

    /** Idempotent: une adresse deja desabonnee le reste, sans erreur. */
    async unsubscribe(email: string): Promise<void> {
      const { error } = await supabase
        .from('email_unsubscribes')
        .upsert(
          { email_normalized: email },
          { onConflict: 'email_normalized', ignoreDuplicates: true },
        );
      if (error) throw new ServiceError('Desabonnement impossible', 'INTERNAL', error);
    },

    /** Idempotent: une adresse jamais desabonnee ne change pas, sans erreur. */
    async resubscribe(email: string): Promise<void> {
      const { error } = await supabase
        .from('email_unsubscribes')
        .delete()
        .eq('email_normalized', email);
      if (error) throw new ServiceError('Reabonnement impossible', 'INTERNAL', error);
    },
  };
}

export type EmailUnsubscribeService = ReturnType<typeof createEmailUnsubscribeService>;
