// --- Types ----------------------------------------------------

export interface ImportResult {
  categoriesCreated: number;
  categoriesExisting: number;
  itemsCreated: number;
  /** Plats deja presents (meme categorie, meme nom) mis a jour par le fichier. */
  itemsUpdated: number;
  itemsSkipped: number;
  errors: ImportRowError[];
}

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ParsedRow {
  rowNumber: number;
  category: string;
  categoryEn: string | null;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  price: number;
  /** null = case vide: defaut a la creation, valeur actuelle conservee a la mise a jour. */
  isAvailable: boolean | null;
  isFeatured: boolean | null;
}
