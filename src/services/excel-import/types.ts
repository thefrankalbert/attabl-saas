// --- Types ----------------------------------------------------

export interface ImportResult {
  categoriesCreated: number;
  categoriesExisting: number;
  itemsCreated: number;
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
  isAvailable: boolean;
  isFeatured: boolean;
}
