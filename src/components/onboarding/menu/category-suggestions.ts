import { getSegmentFamily } from '@/lib/segment-terms';

/**
 * Categories generales proposees a l'onboarding, par type d'etablissement.
 *
 * POURQUOI CE FICHIER EXISTE. L'etape "carte" de l'onboarding presentait une
 * case vide avec un simple exemple grise ("Ex : Entrees, Plats, Boissons...").
 * Devant une case vide, un restaurateur recopie sa carte papier, qui est
 * detaillee: "Grillades", "Riz", "Alloco", "Jus naturels", "Vins rouges". Il
 * se retrouve avec des sous-categories la ou on attend des rubriques
 * generales, et sa carte en ligne devient une longue liste sans rubriques.
 *
 * On propose donc des rubriques a taper. Rien n'est impose: le champ reste
 * libre, et une suggestion n'est qu'un nom pre-rempli qui se modifie.
 *
 * CE FICHIER NE CHANGE RIEN EN BASE. La table `categories` reste plate; ces
 * noms sont de simples valeurs par defaut. Si une hierarchie a deux niveaux
 * est ajoutee plus tard, ces rubriques sont exactement son premier niveau.
 */

/**
 * Cles i18n sous `onboarding.categorySuggestions.*`. Des cles plutot que des
 * noms en dur: la carte d'un etablissement anglophone doit s'ouvrir en
 * anglais.
 */
export type CategorySuggestionKey =
  | 'starters'
  | 'mains'
  | 'sides'
  | 'desserts'
  | 'drinks'
  | 'combos'
  | 'hotDrinks'
  | 'breakfast'
  | 'pastries'
  | 'snacks'
  | 'lightMeals'
  | 'cocktails'
  | 'beers'
  | 'wines'
  | 'burgers'
  | 'roomService';

const BY_ESTABLISHMENT_TYPE: Record<string, readonly CategorySuggestionKey[]> = {
  restaurant: ['starters', 'mains', 'sides', 'desserts', 'drinks', 'combos'],
  bar: ['drinks', 'cocktails', 'beers', 'wines', 'snacks'],
  cafe: ['hotDrinks', 'breakfast', 'pastries', 'snacks', 'lightMeals'],
  hotel: ['breakfast', 'mains', 'desserts', 'drinks', 'roomService'],
  fastfood: ['burgers', 'sides', 'desserts', 'drinks', 'combos'],
  other: ['starters', 'mains', 'desserts', 'drinks'],
};

/**
 * Les rubriques a proposer pour ce type d'etablissement.
 *
 * Rend une liste VIDE hors restauration et hotellerie: proposer "Entrees" a
 * une pharmacie ou un salon (types historiques, encore presents en base)
 * serait pire que la case vide d'aujourd'hui.
 */
export function suggestedCategoryKeys(
  establishmentType: string | undefined,
): readonly CategorySuggestionKey[] {
  if (!establishmentType) return BY_ESTABLISHMENT_TYPE.other;

  const family = getSegmentFamily(establishmentType);
  if (family !== 'food' && family !== 'hospitality') return [];

  return BY_ESTABLISHMENT_TYPE[establishmentType] ?? BY_ESTABLISHMENT_TYPE.other;
}

/**
 * Marques diacritiques combinantes (U+0300 a U+036F), construites depuis une
 * CHAINE plutot qu'ecrites en litteral regex: Prettier remplace la sequence
 * d'echappement par le caractere lui-meme, ce qui ferait entrer dans le code
 * des caracteres non-ASCII invisibles a la relecture - interdit par la regle
 * de typographie du depot.
 */
const DIACRITIQUES = new RegExp('[\\u0300-\\u036f]', 'g');

/**
 * Compare deux noms de categorie comme le ferait un humain: la casse, les
 * espaces de bord et les accents ne distinguent pas deux rubriques. Sans cela,
 * un restaurateur qui a deja tape "entrees" se verrait reproposer "Entrees".
 */
export function sameCategoryName(a: string, b: string): boolean {
  const normalise = (value: string) =>
    value.trim().toLowerCase().normalize('NFD').replace(DIACRITIQUES, '');
  return normalise(a) === normalise(b);
}
