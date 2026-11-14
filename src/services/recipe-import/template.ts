import { buildStyledWorkbook, type StyledColumn } from '@/lib/exports/styled-workbook';
import type { IngredientUnit } from '@/types/inventory.types';
import { RECIPE_UNITS } from './units';

/** Data needed to pre-fill the recipe workbook (already tenant-scoped). */
export interface RecipeTemplateData {
  categories: Array<{ id: string; name: string; display_order: number | null }>;
  menuItems: Array<{ id: string; name: string; category_id: string | null }>;
  recipes: Array<{
    menu_item_id: string;
    quantity_needed: number;
    notes: string | null;
    ingredient: { name: string; unit: IngredientUnit } | null;
  }>;
  ingredientNames: string[];
}

// French headers, read by the restaurateur. The parser keeps the old English
// aliases (Dish / Ingredient / Unit / Quantity), so files downloaded before
// this change still import. "Catégorie" is for reading only: the import
// ignores it (the dish name alone identifies the dish).
const RECIPE_COLUMNS: StyledColumn[] = [
  { header: 'Catégorie', width: 22 },
  { header: 'Plat', width: 30 },
  { header: 'Ingrédient', width: 26 },
  { header: 'Unité', width: 11 },
  { header: 'Quantité', width: 11, numeric: true },
  { header: 'Notes', width: 30 },
];

const NO_CATEGORY = 'Sans catégorie';

const GUIDE = [
  "Mode d'emploi - fiches techniques",
  '',
  'Ce fichier contient déjà vos plats et leurs fiches :',
  "  Une ligne = un ingrédient d'un plat. Le nom du plat est répété sur chaque ligne.",
  '  Un plat sans fiche a une ligne vide : remplissez Ingrédient, Unité et Quantité.',
  '  Pour ajouter un ingrédient, ajoutez une ligne avec le même nom de plat.',
  '',
  'Les unités :',
  '  kg, g, L, cl, pièce ou bouteille.',
  '  g et kg se convertissent tout seuls (50 g = 0,05 kg), cl et L aussi.',
  "  Une unité d'une autre nature (pièce pour un ingrédient en kg) est refusée.",
  '',
  'Modifier ou retirer :',
  '  Changez la quantité ou les notes, puis rechargez le fichier.',
  "  Pour retirer un ingrédient d'un plat, mettez sa quantité à 0.",
  '  Effacer une ligne ne retire rien : utilisez la quantité 0.',
  '',
  'Recharger :',
  '  Fiches techniques > Importer fiches techniques > choisissez ce fichier.',
  '  Les lignes inchangées ne sont pas réécrites.',
  '  La colonne Catégorie sert seulement à vous repérer.',
];

/**
 * Build the pre-filled recipe workbook: one row per recipe line, ordered like
 * the menu (category order, then dish name, then ingredient name). Dishes
 * without a recipe get one empty line to fill in.
 */
export async function buildRecipeWorkbook(data: RecipeTemplateData): Promise<Buffer> {
  const catById = new Map(data.categories.map((c) => [c.id, c]));
  const linesByItem = new Map<string, RecipeTemplateData['recipes']>();
  for (const r of data.recipes) {
    if (!r.ingredient) continue;
    const list = linesByItem.get(r.menu_item_id);
    if (list) list.push(r);
    else linesByItem.set(r.menu_item_id, [r]);
  }

  const catOrder = (id: string | null): number => {
    const c = id ? catById.get(id) : undefined;
    return c ? (c.display_order ?? 0) : Number.MAX_SAFE_INTEGER;
  };
  const catName = (id: string | null): string => (id && catById.get(id)?.name) || NO_CATEGORY;
  const collator = new Intl.Collator('fr', { sensitivity: 'base' });

  const items = [...data.menuItems].sort(
    (a, b) =>
      catOrder(a.category_id) - catOrder(b.category_id) ||
      collator.compare(catName(a.category_id), catName(b.category_id)) ||
      collator.compare(a.name, b.name),
  );

  const rows: Array<Array<string | number>> = [];
  for (const item of items) {
    const lines = [...(linesByItem.get(item.id) ?? [])].sort((a, b) =>
      collator.compare(a.ingredient?.name ?? '', b.ingredient?.name ?? ''),
    );
    if (lines.length === 0) {
      rows.push([catName(item.category_id), item.name, '', '', '', '']);
      continue;
    }
    for (const line of lines) {
      rows.push([
        catName(item.category_id),
        item.name,
        line.ingredient?.name ?? '',
        line.ingredient?.unit ?? '',
        Number(line.quantity_needed),
        line.notes ?? '',
      ]);
    }
  }

  return buildStyledWorkbook({
    sheetName: 'Fiches techniques',
    title: 'Fiches techniques - ATTABL',
    subtitle:
      "Une ligne par ingrédient. Quantité 0 = retirer l'ingrédient. Mode d'emploi dans le 2e onglet.",
    columns: RECIPE_COLUMNS,
    rows,
    lists: [
      {
        column: 2,
        title: 'Ingrédients',
        values: [...data.ingredientNames].sort(collator.compare),
        strict: false,
      },
      { column: 3, title: 'Unités', values: RECIPE_UNITS, strict: true },
    ],
    guide: { sheetName: "Mode d'emploi", lines: GUIDE },
  });
}
