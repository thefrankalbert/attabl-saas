import type { Menu } from '@/types/admin.types';

// --- Types ----------------------------------------------

export interface PdfExtractedItem {
  category: string;
  name: string;
  description: string | null;
  price: number;
}

export interface ImportResult {
  categoriesCreated: number;
  categoriesExisting: number;
  itemsCreated: number;
  itemsSkipped: number;
  errors: Array<{ index: number; message: string }>;
}

export type Step = 'upload' | 'extracting' | 'preview' | 'importing' | 'done';

export interface MenuImportPDFProps {
  menus: Menu[];
  onImportComplete: () => void;
  onCancel: () => void;
}

// --- Helpers --------------------------------------------

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatPrice(price: number): string {
  if (price === 0) return ' - ';
  return price.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
