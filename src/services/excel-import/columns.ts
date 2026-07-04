// --- Column Name Mapping --------------------------------------

/**
 * Normalizes a column header for tolerant matching:
 * - Lowercases
 * - Strips accents (NFD normalization)
 * - Removes all whitespace
 */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}

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
  price: ['price', 'prix', 'tarif', 'cout', 'cost'],
  available: ['available', 'disponible', 'dispo', 'isavailable', 'estdisponible'],
  featured: ['featured', 'vedette', 'envedette', 'isfeatured', 'miseavant', 'highlight'],
};

/**
 * Builds a header-to-field mapping from the actual Excel headers.
 * Returns a map from column index to canonical field name.
 */
export function mapHeaders(headers: string[]): Map<number, string> {
  const mapping = new Map<number, string>();

  // Build a reverse lookup: normalized alias -> canonical field name
  const aliasLookup = new Map<string, string>();
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      aliasLookup.set(alias, field);
    }
  }

  for (let i = 0; i < headers.length; i++) {
    const normalized = normalizeHeader(headers[i]);
    const field = aliasLookup.get(normalized);
    if (field) {
      mapping.set(i, field);
    }
  }

  return mapping;
}
