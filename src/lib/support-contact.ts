/**
 * Le canal d'assistance humaine d'ATTABL. Un lien wa.me ouvre une conversation
 * que le RESTAURATEUR commence: c'est gratuit pour lui comme pour nous (seuls
 * les messages envoyes automatiquement par un logiciel sont factures par Meta).
 */
// Numero provisoire (2026-11-15), WhatsApp et appel. Un seul endroit a changer.
export const SUPPORT_WHATSAPP_NUMBER = '22655212293';

/** Lien wa.me avec un premier message pre-rempli (le restaurant, pour aller vite). */
export function supportWhatsAppLink(message: string): string {
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

/** Appel telephonique direct au meme numero (lien tel:). */
export const SUPPORT_PHONE_LINK = `tel:+${SUPPORT_WHATSAPP_NUMBER}`;

/** Le numero tel qu'on l'affiche: +226 55 21 22 93. */
export const SUPPORT_PHONE_DISPLAY = '+226 55 21 22 93';
