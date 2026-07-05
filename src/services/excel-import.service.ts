import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';
import { bulkImportMenuRows, type MenuBulkImportRow } from '@/lib/menu-bulk-import';
import { parseExcelBuffer } from './excel-import/parser';
import { generateExcelTemplate } from './excel-import/template';
import type { ImportResult, ImportRowError, ParsedRow } from './excel-import/types';

export type { ImportResult, ImportRowError, ParsedRow } from './excel-import/types';

// --- Service --------------------------------------------------

export interface ExcelImportService {
  parseExcel(buffer: ArrayBuffer): Promise<{ rows: ParsedRow[]; errors: ImportRowError[] }>;
  groupByCategory(
    rows: ParsedRow[],
  ): Map<string, { categoryEn: string | null; items: ParsedRow[] }>;
  importToDatabase(tenantId: string, menuId: string, rows: ParsedRow[]): Promise<ImportResult>;
  importFromExcel(tenantId: string, menuId: string, buffer: ArrayBuffer): Promise<ImportResult>;
  generateTemplate(): Promise<Buffer>;
}

/**
 * Excel import service for menu data.
 *
 * Parses an Excel file with menu items grouped by category,
 * validates each row, and imports them into the database.
 *
 * Follows the project DI pattern: receives a SupabaseClient.
 */
export function createExcelImportService(supabase: SupabaseClient): ExcelImportService {
  return {
    /**
     * Parses an Excel ArrayBuffer into validated rows.
     * Collects errors per row instead of throwing on the first invalid row.
     */
    async parseExcel(
      buffer: ArrayBuffer,
    ): Promise<{ rows: ParsedRow[]; errors: ImportRowError[] }> {
      return parseExcelBuffer(buffer);
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
      const grouped = this.groupByCategory(rows);
      const bulkGrouped = new Map<
        string,
        { categoryEn: string | null; items: MenuBulkImportRow[] }
      >();

      for (const [categoryName, group] of grouped) {
        bulkGrouped.set(categoryName, {
          categoryEn: group.categoryEn,
          items: group.items.map((item) => ({
            rowKey: item.rowNumber,
            category: item.category,
            categoryEn: item.categoryEn,
            name: item.name,
            nameEn: item.nameEn,
            description: item.description,
            descriptionEn: item.descriptionEn,
            price: item.price,
            isAvailable: item.isAvailable,
            isFeatured: item.isFeatured,
          })),
        });
      }

      const bulk = await bulkImportMenuRows(supabase, tenantId, menuId, bulkGrouped);

      return {
        categoriesCreated: bulk.categoriesCreated,
        categoriesExisting: bulk.categoriesExisting,
        itemsCreated: bulk.itemsCreated,
        itemsSkipped: bulk.itemsSkipped,
        errors: bulk.errors.map((e) => ({ row: e.key, message: e.message })),
      };
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

      const { rows, errors: parseErrors } = await this.parseExcel(buffer);

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
    async generateTemplate(): Promise<Buffer> {
      return generateExcelTemplate();
    },
  };
}
