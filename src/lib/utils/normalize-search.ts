/**
 * Forme de comparaison d'un texte de recherche: minuscules, sans accents.
 * Une saisie sans accent trouve un plat dont le nom en porte. Partagee par la
 * recherche convive cote serveur (`menu-search.service.ts`) et son affinage
 * dans le navigateur (`useHomeHeader.ts`), pour que les deux disent la meme chose.
 */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Un plat correspond au terme (deja passe par `normalizeSearch`) par son nom,
 * son nom anglais ou sa description. Meme regle cote serveur
 * (`menu-search.service.ts`) et dans le navigateur (`useHomeHeader.ts`).
 */
export function matchesSearch(
  item: { name?: string | null; name_en?: string | null; description?: string | null },
  term: string,
): boolean {
  return [item.name, item.name_en, item.description].some(
    (text) => !!text && normalizeSearch(text).includes(term),
  );
}
