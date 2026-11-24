import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

/**
 * Titre d'onglet d'une page du tableau de bord: "Commandes - ATTABL". Les 27
 * pages admin partageaient le titre de la vitrine (audit du 2026-11-23, 2.4.2),
 * ce qui rend l'onglet et l'historique illisibles. Le libelle vient des
 * traductions deja affichees dans le menu (sidebar.nav*), donc il suit la langue.
 */
export async function adminPageMetadata(namespace: string, key: string): Promise<Metadata> {
  const t = await getTranslations(namespace);
  return { title: `${t(key)} - ATTABL` };
}
