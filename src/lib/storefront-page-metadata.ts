import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getCachedTenant } from '@/lib/cache';

/**
 * Titre d'onglet d'une page de la vitrine convive: "Mon panier - Le Jardin | ATTABL".
 * Six pages (panier, commandes, suivi, parametres, accueil, confirmation) portaient
 * le titre marketing generique (audit du 2026-11-24). Le libelle vient des
 * traductions `tenant` deja affichees dans la page, donc il suit la langue.
 */
export async function storefrontPageMetadata(site: string, key: string): Promise<Metadata> {
  const tenant = await getCachedTenant(site);
  if (!tenant) {
    // Restaurant inexistant: titre honnete, et jamais indexe (voir C-024).
    return { title: 'Page introuvable | ATTABL', robots: { index: false, follow: false } };
  }
  const t = await getTranslations('tenant');
  return { title: `${t(key)} - ${tenant.name} | ATTABL` };
}
