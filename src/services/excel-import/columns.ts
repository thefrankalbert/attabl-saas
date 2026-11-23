// --- Column Name Mapping --------------------------------------
//
// La lecture des en-tetes (`normalizeHeader`, `mapHeaders`) est celle de
// `@/lib/excel-parse`, partagee avec les autres imports: la PREMIERE colonne
// reconnue gagne. Une copie locale gardait la derniere (audit B45).

/**
 * Maps of normalized header variants to their canonical field names.
 * Supports French, English, with/without accents, various word separators.
 */
export const COLUMN_ALIASES: Record<string, string[]> = {
  category: ['category', 'categorie', 'categoryfr', 'categoriefr', 'cat', 'catfr'],
  categoryEn: ['categoryen', 'categoryenglish', 'categorieen', 'caten'],
  name: [
    'dishname',
    'dishnamefr',
    'nom',
    'nomfr',
    'nomduplat',
    'nomfrancais',
    'name',
    'namefr',
    'plat',
    'item',
    'itemname',
  ],
  nameEn: [
    'nomduplaten',
    'dishnameen',
    'dishnamefrenglish',
    'nomen',
    'nomanglais',
    'nameen',
    'nameenglish',
    'itemen',
    'itemnameen',
  ],
  description: ['description', 'descriptionfr', 'desc', 'descfr'],
  descriptionEn: ['descriptionen', 'descriptionenglish', 'descen'],
  // Audit B45: `cout` / `cost` designent le cout matiere, pas le prix de vente.
  // Reconnus comme prix, une colonne "Cout" ecrasait le prix a l'import.
  price: ['price', 'prix', 'tarif'],
  available: ['available', 'disponible', 'dispo', 'isavailable', 'estdisponible'],
  featured: ['featured', 'vedette', 'envedette', 'isfeatured', 'miseavant', 'highlight'],
};
