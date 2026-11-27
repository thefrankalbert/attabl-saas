import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ResendWebhookEvent } from '@/lib/validations/webhooks.schema';
import { ServiceError } from './errors';

/**
 * Liste des adresses a ne plus ecrire (rebond definitif, plainte), tenue par le
 * webhook Resend et lue par le service d'envoi.
 *
 * Donnees de la PLATEFORME, sans restaurant: le client recu est le client
 * service_role (la table n'a aucune politique pour anon ou authenticated).
 * Aucune adresse en clair: seulement son empreinte.
 */

export type RaisonBlocage = 'rebond_definitif' | 'plainte';

/** SHA-256 complet de l'adresse en minuscules, sans espaces autour. */
export function empreinteAdresse(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

/** Ce qu'un evenement Resend demande: rien, ou bloquer ses destinataires. */
export function raisonDeLEvenement(event: ResendWebhookEvent): RaisonBlocage | null {
  if (event.type === 'email.complained') return 'plainte';
  if (event.type === 'email.bounced') {
    // Resend n'emet `email.bounced` que pour un refus definitif; un rebond
    // explicitement temporaire (boite pleine, serveur indisponible) ne bloque pas.
    const nature = event.data?.bounce?.type?.toLowerCase();
    return nature === 'transient' || nature === 'temporary' ? null : 'rebond_definitif';
  }
  return null;
}

/** `Nom <a@b.c>` ou `a@b.c` -> `a@b.c`; null si ce n'est pas une adresse. */
function adresseNue(valeur: string): string | null {
  const entre = /<([^<>]+)>/.exec(valeur);
  const adresse = (entre ? entre[1] : valeur).trim();
  return /^[^\s@]+@[^\s@]+$/.test(adresse) ? adresse : null;
}

export interface EmailSuppressionService {
  /**
   * Applique un evenement Resend deja authentifie: bloque ses destinataires si
   * c'est un rebond definitif ou une plainte. Rend le nombre d'adresses traitees.
   */
  appliquerEvenement(event: ResendWebhookEvent, evenementId: string): Promise<number>;
  /** Vrai si l'adresse est bloquee. Leve sur erreur de lecture (l'appelant tranche). */
  estBloquee(email: string): Promise<boolean>;
}

export function createEmailSuppressionService(supabase: SupabaseClient): EmailSuppressionService {
  /** Bloque l'adresse. Idempotent: un evenement rejoue ne cree pas de doublon. */
  async function bloquer(email: string, raison: RaisonBlocage, evenementId: string): Promise<void> {
    // Une plainte l'emporte sur un rebond (elle dit "ne m'ecrivez plus"):
    // on ne la remplace jamais par un rebond arrive plus tard.
    const hash = empreinteAdresse(email);
    const { data: existante, error: erreurLecture } = await supabase
      .from('adresses_email_bloquees')
      .select('raison')
      .eq('email_hash', hash)
      .maybeSingle();
    if (erreurLecture) {
      throw new ServiceError('Lecture des adresses bloquees impossible', 'INTERNAL', erreurLecture);
    }
    if (existante && (existante.raison === raison || existante.raison === 'plainte')) return;

    const { error } = await supabase.from('adresses_email_bloquees').upsert(
      {
        email_hash: hash,
        raison,
        evenement_id: evenementId.slice(0, 200),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email_hash' },
    );
    if (error) {
      throw new ServiceError('Blocage de l adresse impossible', 'INTERNAL', error);
    }
  }

  return {
    async appliquerEvenement(event, evenementId) {
      const raison = raisonDeLEvenement(event);
      if (!raison) return 0;
      const adresses = (event.data?.to ?? [])
        .map(adresseNue)
        .filter((a): a is string => a !== null);
      for (const adresse of adresses) {
        await bloquer(adresse, raison, evenementId);
      }
      return adresses.length;
    },

    async estBloquee(email) {
      const { data, error } = await supabase
        .from('adresses_email_bloquees')
        .select('id')
        .eq('email_hash', empreinteAdresse(email))
        .maybeSingle();
      if (error) {
        throw new ServiceError('Lecture des adresses bloquees impossible', 'INTERNAL', error);
      }
      return data !== null;
    },
  };
}
