import type { AbstractIntlMessages } from 'next-intl';

/**
 * Messages envoyes au navigateur, par zone du site.
 *
 * POURQUOI (mesure du 2026-11-24, production, mobile) : le layout racine
 * passait TOUT le catalogue (260 Ko de JSON) a NextIntlClientProvider. Il etait
 * donc recopie dans le HTML de chaque page : 55 Ko compresses sur 72 Ko pour
 * l'accueil, soit les trois quarts du document, avant meme le CSS. Sur un
 * telephone en 3G, c'est du temps d'affichage perdu sur chaque page publique.
 *
 * Seuls les composants client lisent ces messages (les composants serveur
 * passent par getTranslations, qui lit le catalogue complet cote serveur).
 * Chaque zone publique n'envoie donc que les espaces de noms que ses composants
 * client utilisent. Les autres zones (tableau de bord, vitrine des restaurants,
 * onboarding...) recoivent toujours le catalogue complet, via leur propre
 * layout.
 *
 * Le test `src/i18n/__tests__/client-messages.test.ts` parcourt le graphe
 * d'imports de chaque zone : si un composant client utilise un espace de noms
 * absent de sa liste, le test echoue. Ajouter alors le chemin a la liste.
 */

/** Composants client rendus par le layout racine lui-meme (error.tsx...). */
export const ROOT_CLIENT_NAMESPACES = ['common'] as const;

/** Vitrine : accueil, tarifs, blog, materiel, contact, legal... */
export const MARKETING_CLIENT_NAMESPACES = [
  'common',
  'contact',
  'marketing.blog',
  'marketing.header',
  'marketing.nouveautes',
  'marketing.pricing',
] as const;

/** Connexion, inscription, mot de passe oublie et reinitialisation. */
export const AUTH_CLIENT_NAMESPACES = ['common', 'auth', 'authShell'] as const;

/**
 * Parent commun des restaurants (`sites/` et `sites/[site]`) : ses propres
 * error.tsx et not-found.tsx. Le tableau de bord (`[site]/admin`) re-fournit le
 * catalogue complet dans son layout, le menu convive son sous-ensemble.
 */
export const SITES_CLIENT_NAMESPACES = ['common', 'tenant'] as const;

/** Menu convive ouvert sur le telephone du client : accueil, carte, panier... */
export const STOREFRONT_CLIENT_NAMESPACES = [
  'bottomNav',
  'common',
  'homeHeader',
  'homePage',
  'qrScanner',
  'tenant',
] as const;

/**
 * Copie les sous-arbres demandes du catalogue. Un chemin peut etre un espace
 * de noms ('auth') ou un sous-espace ('marketing.header'). Un chemin absent du
 * catalogue est ignore.
 */
export function pickMessages(
  messages: AbstractIntlMessages,
  paths: readonly string[],
): AbstractIntlMessages {
  const picked: AbstractIntlMessages = {};
  for (const path of paths) {
    const keys = path.split('.');
    let source: AbstractIntlMessages | string | undefined = messages;
    for (const key of keys) {
      source = typeof source === 'object' ? source[key] : undefined;
    }
    if (source === undefined) continue;

    let target = picked;
    keys.forEach((key, i) => {
      if (i === keys.length - 1) {
        target[key] = source as AbstractIntlMessages | string;
        return;
      }
      const next = target[key];
      if (typeof next !== 'object') target[key] = {};
      target = target[key] as AbstractIntlMessages;
    });
  }
  return picked;
}
