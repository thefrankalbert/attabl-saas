/**
 * Le canal d'assistance humaine d'ATTABL. Un lien wa.me ouvre une conversation
 * que le RESTAURATEUR commence: c'est gratuit pour lui comme pour nous (seuls
 * les messages envoyes automatiquement par un logiciel sont factures par Meta).
 *
 * Le numero se change dans la console de la plateforme (onglet Reglages),
 * sans redeployer: table platform_settings, cle 'support_contact'. La valeur
 * ci-dessous ne sert que tant que personne ne l'a enregistre, ou si la lecture
 * echoue.
 */

export interface SupportContact {
  /** Le numero tel qu'on l'affiche, ex: +226 55 21 22 93. */
  display: string;
  /** Chiffres seuls, indicatif compris: ce qu'attendent wa.me et tel:. */
  digits: string;
}

export const DEFAULT_SUPPORT_CONTACT: SupportContact = toSupportContact('+226 55 21 22 93');

/** Un seul format d'affichage: "+", puis les chiffres et espaces saisis, sans doublon. */
export function toSupportContact(phone: string): SupportContact {
  const digits = phone.replace(/\D/g, '');
  const body = phone
    .replace(/[^\d ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { display: `+${body}`, digits };
}

/** Lien wa.me avec un premier message pre-rempli (le restaurant, pour aller vite). */
export function supportWhatsAppLink(contact: SupportContact, message: string): string {
  return `https://wa.me/${contact.digits}?text=${encodeURIComponent(message)}`;
}

/** Appel telephonique direct au meme numero (lien tel:). */
export function supportPhoneLink(contact: SupportContact): string {
  return `tel:+${contact.digits}`;
}
