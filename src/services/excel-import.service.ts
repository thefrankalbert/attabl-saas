import type { SupabaseClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';

// ─── Types ────────────────────────────────────────────────────

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

interface ParsedRow {
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

// ─── Column Name Mapping ──────────────────────────────────────

/**
 * Normalizes a column header for tolerant matching:
 * - Lowercases
 * - Strips accents (NFD normalization)
 * - Removes all whitespace
 */
function normalizeHeader(header: string): string {
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
const COLUMN_ALIASES: Record<string, string[]> = {
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
function mapHeaders(headers: string[]): Map<number, string> {
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

// ─── Row Validation Schema ────────────────────────────────────

const excelRowSchema = z.object({
  category: z
    .string({ error: 'Category is required' })
    .min(1, 'Category name cannot be empty')
    .max(100, 'Category name must be 100 characters or fewer'),
  categoryEn: z.string().max(100).nullable().optional(),
  name: z
    .string({ error: 'Dish name is required' })
    .min(1, 'Dish name cannot be empty')
    .max(200, 'Dish name must be 200 characters or fewer'),
  nameEn: z.string().max(200).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  descriptionEn: z.string().max(1000).nullable().optional(),
  price: z
    .number({ error: 'Price must be a valid number' })
    .positive('Price must be a positive number'),
  isAvailable: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
});

// ─── Boolean Parsing ──────────────────────────────────────────

/**
 * Parses a cell value into a boolean.
 * Supports: Y/N, Yes/No, Oui/Non, 1/0, true/false, V/X
 */
function parseBooleanCell(value: unknown, defaultValue: boolean): boolean {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  const normalized = String(value).trim().toLowerCase();
  const truthyValues = ['y', 'yes', 'oui', 'o', 'true', '1', 'v', 'vrai'];
  const falsyValues = ['n', 'no', 'non', 'false', '0', 'x', 'faux'];

  if (truthyValues.includes(normalized)) return true;
  if (falsyValues.includes(normalized)) return false;

  return defaultValue;
}

/**
 * Parses a cell value into a number or null.
 */
function parseNumericCell(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  // Handle string prices like "12,50" or "12.50" or "$12.50"
  const cleaned = String(value)
    .replace(/[^0-9.,]/g, '')
    .replace(',', '.');
  const parsed = parseFloat(cleaned);

  return isNaN(parsed) ? null : parsed;
}

/**
 * Generates a URL-safe slug from a name.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── Service ──────────────────────────────────────────────────

/**
 * Excel import service for menu data.
 *
 * Parses an Excel file with menu items grouped by category,
 * validates each row, and imports them into the database.
 *
 * Follows the project DI pattern: receives a SupabaseClient.
 */
export function createExcelImportService(supabase: SupabaseClient) {
  return {
    /**
     * Parses an Excel ArrayBuffer into validated rows.
     * Collects errors per row instead of throwing on the first invalid row.
     */
    parseExcel(buffer: ArrayBuffer): { rows: ParsedRow[]; errors: ImportRowError[] } {
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];

      if (!sheetName) {
        throw new ServiceError('The Excel file contains no sheets', 'VALIDATION');
      }

      const sheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

      if (rawData.length < 2) {
        throw new ServiceError(
          'The Excel file must contain at least a header row and one data row',
          'VALIDATION',
        );
      }

      // First row is headers
      const headerRow = rawData[0] as string[];
      const headerMapping = mapHeaders(headerRow.map(String));

      // Verify that required columns are present
      const mappedFields = new Set(headerMapping.values());
      const requiredFields = ['category', 'name', 'price'];
      const missingFields = requiredFields.filter((f) => !mappedFields.has(f));

      if (missingFields.length > 0) {
        throw new ServiceError(
          `Missing required columns: ${missingFields.join(', ')}. ` +
            `Expected columns: Category, Dish Name, Price`,
          'VALIDATION',
        );
      }

      const rows: ParsedRow[] = [];
      const errors: ImportRowError[] = [];

      // Process data rows (skip header at index 0)
      for (let i = 1; i < rawData.length; i++) {
        const cells = rawData[i] as unknown[];

        // Skip completely empty rows
        if (
          !cells ||
          cells.length === 0 ||
          cells.every((c) => c === null || c === undefined || c === '')
        ) {
          continue;
        }

        const rowNumber = i + 1; // 1-based for user-facing messages

        // Extract values using the header mapping
        const rawRow: Record<string, unknown> = {};
        for (const [colIndex, fieldName] of headerMapping.entries()) {
          rawRow[fieldName] = cells[colIndex] ?? null;
        }

        // Coerce types before validation
        const rowToValidate = {
          category: rawRow.category != null ? String(rawRow.category).trim() : '',
          categoryEn: rawRow.categoryEn != null ? String(rawRow.categoryEn).trim() || null : null,
          name: rawRow.name != null ? String(rawRow.name).trim() : '',
          nameEn: rawRow.nameEn != null ? String(rawRow.nameEn).trim() || null : null,
          description:
            rawRow.description != null ? String(rawRow.description).trim() || null : null,
          descriptionEn:
            rawRow.descriptionEn != null ? String(rawRow.descriptionEn).trim() || null : null,
          price: parseNumericCell(rawRow.price),
          isAvailable: parseBooleanCell(rawRow.available, true),
          isFeatured: parseBooleanCell(rawRow.featured, false),
        };

        // Handle null price before Zod (Zod expects number, not null)
        if (rowToValidate.price === null) {
          errors.push({ row: rowNumber, message: 'Price is required and must be a valid number' });
          continue;
        }

        const result = excelRowSchema.safeParse(rowToValidate);

        if (!result.success) {
          const messages = result.error.issues.map((issue) => issue.message).join('; ');
          errors.push({ row: rowNumber, message: messages });
          continue;
        }

        rows.push({
          rowNumber,
          category: result.data.category,
          categoryEn: result.data.categoryEn ?? null,
          name: result.data.name,
          nameEn: result.data.nameEn ?? null,
          description: result.data.description ?? null,
          descriptionEn: result.data.descriptionEn ?? null,
          price: result.data.price,
          isAvailable: result.data.isAvailable,
          isFeatured: result.data.isFeatured,
        });
      }

      return { rows, errors };
    },

    /**
     * Groups parsed rows by category name.
     * Returns a Map where keys are category names and values are item arrays.
     */
    groupByCategory(
      rows: ParsedRow[],
    ): Map<string, { categoryEn: string | null; items: ParsedRow[] }> {
      const groups = new Map<string, { categoryEn: string | null; items: ParsedRow[] }>();

      for (const row of rows) {
        const existing = groups.get(row.category);
        if (existing) {
          existing.items.push(row);
          // Use the first non-null English name encountered
          if (!existing.categoryEn && row.categoryEn) {
            existing.categoryEn = row.categoryEn;
          }
        } else {
          groups.set(row.category, {
            categoryEn: row.categoryEn,
            items: [row],
          });
        }
      }

      return groups;
    },

    /**
     * Imports parsed and validated rows into Supabase.
     *
     * For each category:
     * 1. Checks if the category already exists (by name + tenant_id)
     * 2. Creates it if not
     * 3. Inserts all menu items under that category
     *
     * Returns a summary of the import operation.
     */
    async importToDatabase(
      tenantId: string,
      menuId: string,
      rows: ParsedRow[],
    ): Promise<ImportResult> {
      const result: ImportResult = {
        categoriesCreated: 0,
        categoriesExisting: 0,
        itemsCreated: 0,
        itemsSkipped: 0,
        errors: [],
      };

      const grouped = this.groupByCategory(rows);

      // Get the max display_order for categories in this menu
      const { data: maxCatOrder } = await supabase
        .from('categories')
        .select('display_order')
        .eq('tenant_id', tenantId)
        .eq('menu_id', menuId)
        .order('display_order', { ascending: false })
        .limit(1)
        .single();

      let nextCategoryOrder = (maxCatOrder?.display_order ?? -1) + 1;

      for (const [categoryName, group] of grouped) {
        // Check if category already exists for this tenant + menu
        const { data: existingCategory, error: catLookupError } = await supabase
          .from('categories')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('menu_id', menuId)
          .eq('name', categoryName)
          .single();

        if (catLookupError && catLookupError.code !== 'PGRST116') {
          // PGRST116 = "no rows returned" — expected when category doesn't exist
          logger.error('Error looking up category', catLookupError, {
            categoryName,
            tenantId,
          });
          // Record error for all items in this category
          for (const item of group.items) {
            result.errors.push({
              row: item.rowNumber,
              message: `Failed to look up category "${categoryName}"`,
            });
            result.itemsSkipped += 1;
          }
          continue;
        }

        let categoryId: string;

        if (existingCategory) {
          categoryId = existingCategory.id;
          result.categoriesExisting += 1;
        } else {
          // Create the category
          const { data: newCategory, error: catCreateError } = await supabase
            .from('categories')
            .insert({
              tenant_id: tenantId,
              menu_id: menuId,
              name: categoryName,
              name_en: group.categoryEn || null,
              display_order: nextCategoryOrder,
              is_active: true,
            })
            .select('id')
            .single();

          if (catCreateError || !newCategory) {
            logger.error('Error creating category', catCreateError, {
              categoryName,
              tenantId,
            });
            for (const item of group.items) {
              result.errors.push({
                row: item.rowNumber,
                message: `Failed to create category "${categoryName}"`,
              });
              result.itemsSkipped += 1;
            }
            continue;
          }

          categoryId = newCategory.id;
          nextCategoryOrder += 1;
          result.categoriesCreated += 1;
        }

        // Get max display_order for items in this category
        const { data: maxItemOrder } = await supabase
          .from('menu_items')
          .select('display_order')
          .eq('tenant_id', tenantId)
          .eq('category_id', categoryId)
          .order('display_order', { ascending: false })
          .limit(1)
          .single();

        let nextItemOrder = (maxItemOrder?.display_order ?? -1) + 1;

        // Insert menu items for this category
        for (const item of group.items) {
          const { error: itemError } = await supabase.from('menu_items').insert({
            tenant_id: tenantId,
            category_id: categoryId,
            name: item.name,
            name_en: item.nameEn || null,
            description: item.description || null,
            description_en: item.descriptionEn || null,
            price: item.price,
            is_available: item.isAvailable,
            is_featured: item.isFeatured,
            display_order: nextItemOrder,
            slug: slugify(item.name),
          });

          if (itemError) {
            logger.error('Error inserting menu item', itemError, {
              itemName: item.name,
              row: item.rowNumber,
            });
            result.errors.push({
              row: item.rowNumber,
              message: `Failed to insert item "${item.name}": ${itemError.message}`,
            });
            result.itemsSkipped += 1;
          } else {
            nextItemOrder += 1;
            result.itemsCreated += 1;
          }
        }
      }

      logger.info('Excel import completed', {
        tenantId,
        menuId,
        categoriesCreated: result.categoriesCreated,
        categoriesExisting: result.categoriesExisting,
        itemsCreated: result.itemsCreated,
        itemsSkipped: result.itemsSkipped,
        errorCount: result.errors.length,
      });

      return result;
    },

    /**
     * Full import pipeline: parse + validate + insert.
     *
     * @param tenantId - The tenant performing the import
     * @param menuId - The menu to import items into
     * @param buffer - The Excel file as an ArrayBuffer
     * @returns ImportResult with counts and row-level errors
     */
    async importFromExcel(
      tenantId: string,
      menuId: string,
      buffer: ArrayBuffer,
    ): Promise<ImportResult> {
      logger.info('Starting Excel menu import', { tenantId, menuId });

      const { rows, errors: parseErrors } = this.parseExcel(buffer);

      if (rows.length === 0 && parseErrors.length > 0) {
        return {
          categoriesCreated: 0,
          categoriesExisting: 0,
          itemsCreated: 0,
          itemsSkipped: parseErrors.length,
          errors: parseErrors,
        };
      }

      if (rows.length === 0) {
        throw new ServiceError('No valid rows found in the Excel file', 'VALIDATION');
      }

      const result = await this.importToDatabase(tenantId, menuId, rows);

      // Merge parse errors into the final result
      result.errors = [...parseErrors, ...result.errors];
      result.itemsSkipped += parseErrors.length;

      return result;
    },

    /**
     * Generates a blank Excel template with correct headers and example rows.
     * Returns the file as a Buffer ready for download.
     */
    generateTemplate(): Buffer {
      const headers = [
        'Category',
        'Category EN',
        'Dish Name',
        'Dish Name EN',
        'Description',
        'Description EN',
        'Price',
        'Available',
        'Featured',
      ];

      const exampleRows = [
        [
          'Entrées',
          'Starters',
          "Soupe à l'oignon",
          'French Onion Soup',
          'Soupe gratinée traditionnelle',
          'Traditional gratinéed soup',
          12.5,
          'Oui',
          'Non',
        ],
        [
          'Entrées',
          'Starters',
          'Salade César',
          'Caesar Salad',
          'Laitue romaine, croûtons, parmesan',
          'Romaine lettuce, croutons, parmesan',
          14.0,
          'Oui',
          'Oui',
        ],
        [
          'Plats principaux',
          'Main Courses',
          'Steak frites',
          'Steak and Fries',
          'Entrecôte grillée, frites maison',
          'Grilled rib-eye, house fries',
          28.0,
          'Oui',
          'Oui',
        ],
        [
          'Plats principaux',
          'Main Courses',
          'Saumon grillé',
          'Grilled Salmon',
          "Saumon de l'Atlantique, légumes de saison",
          'Atlantic salmon, seasonal vegetables',
          26.5,
          'Oui',
          'Non',
        ],
        [
          'Desserts',
          'Desserts',
          'Crème brûlée',
          'Crème Brûlée',
          'À la vanille de Madagascar',
          'Madagascar vanilla',
          11.0,
          'Oui',
          'Non',
        ],
      ];

      const worksheetData = [headers, ...exampleRows];
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

      // Set column widths for readability
      worksheet['!cols'] = [
        { wch: 20 }, // Category
        { wch: 20 }, // Category EN
        { wch: 25 }, // Dish Name
        { wch: 25 }, // Dish Name EN
        { wch: 40 }, // Description
        { wch: 40 }, // Description EN
        { wch: 10 }, // Price
        { wch: 12 }, // Available
        { wch: 12 }, // Featured
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Menu Import');

      // Write as buffer
      const output = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      return output as Buffer;
    },
  };
}
