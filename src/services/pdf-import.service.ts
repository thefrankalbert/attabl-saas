import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';
import { bulkImportMenuRows, type MenuBulkImportRow } from '@/lib/menu-bulk-import';

// ─── Types ────────────────────────────────────────────────────

export interface PdfExtractedItem {
  category: string;
  name: string;
  description: string | null;
  price: number;
}

interface PdfExtractionResult {
  items: PdfExtractedItem[];
  pageCount: number;
  textLength: number;
}

interface PdfImportResult {
  categoriesCreated: number;
  categoriesExisting: number;
  itemsCreated: number;
  itemsSkipped: number;
  errors: Array<{ index: number; message: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Cleans the AI response to extract valid JSON.
 * Handles markdown code fences and leading/trailing whitespace.
 */
function cleanJsonResponse(raw: string): string {
  let cleaned = raw.trim();

  // Remove markdown code fences (```json ... ``` or ``` ... ```)
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  return cleaned.trim();
}

// ─── Service ──────────────────────────────────────────────────

export interface PdfImportService {
  extractFromPdf(pdfBuffer: Buffer): Promise<PdfExtractionResult>;
  importItems(
    tenantId: string,
    menuId: string,
    items: PdfExtractedItem[],
  ): Promise<PdfImportResult>;
}

/**
 * PDF import service for menu data.
 *
 * Extracts structured menu data from a PDF using Claude AI,
 * then imports into the database following the same pattern
 * as the Excel import service.
 *
 * Follows the project DI pattern: receives a SupabaseClient.
 */
export function createPdfImportService(supabase: SupabaseClient): PdfImportService {
  return {
    /**
     * Extracts structured menu items from a PDF buffer using Claude AI.
     *
     * 1. Parses the PDF text with pdf-parse
     * 2. Sends the text to Claude Haiku for structured extraction
     * 3. Returns an array of extracted items with category, name, description, price
     */
    async extractFromPdf(pdfBuffer: Buffer): Promise<PdfExtractionResult> {
      const apiKey = process.env.ANTHROPIC_API_KEY;

      if (!apiKey) {
        throw new ServiceError(
          'ANTHROPIC_API_KEY is not configured. PDF import requires a valid Anthropic API key.',
          'INTERNAL',
        );
      }

      // Dynamic import for pdf-parse v2 (class-based API)
      const { PDFParse } = await import('pdf-parse');

      let pdfText: string;
      let pageCount: number;
      try {
        const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
        const textResult = await parser.getText();
        pdfText = textResult.text.trim();
        pageCount = textResult.pages.length;
        await parser.destroy();
      } catch (err) {
        logger.error('Failed to parse PDF', err);
        throw new ServiceError(
          'Failed to parse the PDF file. Ensure it is a valid, non-corrupted PDF.',
          'VALIDATION',
        );
      }

      if (!pdfText || pdfText.length < 10) {
        throw new ServiceError(
          'The PDF appears to be empty or contains only images. Text-based PDFs are required.',
          'VALIDATION',
        );
      }

      logger.info('PDF parsed successfully', {
        pageCount,
        textLength: pdfText.length,
      });

      // Call Claude API for structured extraction
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey });

      const prompt = `You are a menu data extraction assistant. Extract all menu items from the following restaurant menu text.

Return a JSON array where each element is an object with these fields:
- "category": the menu category/section name (e.g., "Entrées", "Plats", "Desserts")
- "name": the dish name
- "description": a brief description of the dish (null if not provided)
- "price": the price as a number (no currency symbol, just the numeric value)

Rules:
- Preserve the exact order of items as they appear in the menu
- If a dish has no description, set description to null
- If a price contains a comma as decimal separator (e.g., "12,50"), convert it to a dot (12.50)
- If you cannot determine the price, set it to 0
- Group items under their correct category as shown in the menu
- Do NOT invent or hallucinate items that are not in the text
- Return ONLY the JSON array, no other text

Menu text:
---
${pdfText.substring(0, 15000)}
---`;

      let response;
      try {
        response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        });
      } catch (err) {
        logger.error('Claude API call failed', err);
        throw new ServiceError(
          'Failed to extract menu data from PDF. The AI service is unavailable.',
          'INTERNAL',
        );
      }

      // Extract text from response
      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new ServiceError('Claude returned an empty response', 'INTERNAL');
      }

      const rawJson = cleanJsonResponse(textBlock.text);

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        logger.error('Failed to parse Claude JSON response', { rawResponse: textBlock.text });
        throw new ServiceError(
          'Failed to parse the extracted menu data. The AI response was not valid JSON.',
          'INTERNAL',
        );
      }

      if (!Array.isArray(parsed)) {
        throw new ServiceError('Expected a JSON array from the AI extraction', 'INTERNAL');
      }

      // Validate and clean each item
      const items: PdfExtractedItem[] = [];

      for (const raw of parsed) {
        if (typeof raw !== 'object' || raw === null) continue;

        const item = raw as Record<string, unknown>;
        const category = typeof item.category === 'string' ? item.category.trim() : '';
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        const description =
          typeof item.description === 'string' ? item.description.trim() || null : null;
        let price = typeof item.price === 'number' ? item.price : 0;

        if (typeof item.price === 'string') {
          const cleaned = item.price.replace(/[^0-9.,]/g, '').replace(',', '.');
          price = parseFloat(cleaned) || 0;
        }

        // Skip items without a name or category
        if (!name || !category) continue;

        items.push({ category, name, description, price });
      }

      logger.info('PDF extraction completed', {
        itemCount: items.length,
        pageCount,
      });

      return {
        items,
        pageCount,
        textLength: pdfText.length,
      };
    },

    /**
     * Imports extracted PDF items into the database.
     *
     * Groups items by category, creates categories if needed,
     * and inserts menu_items with proper display_order.
     */
    async importItems(
      tenantId: string,
      menuId: string,
      items: PdfExtractedItem[],
    ): Promise<PdfImportResult> {
      if (items.length === 0) {
        return {
          categoriesCreated: 0,
          categoriesExisting: 0,
          itemsCreated: 0,
          itemsSkipped: 0,
          errors: [],
        };
      }

      const grouped = new Map<string, PdfExtractedItem[]>();
      for (const item of items) {
        const existing = grouped.get(item.category);
        if (existing) {
          existing.push(item);
        } else {
          grouped.set(item.category, [item]);
        }
      }

      let globalIndex = 0;
      const bulkGrouped = new Map<
        string,
        { categoryEn: string | null; items: MenuBulkImportRow[] }
      >();

      for (const [categoryName, categoryItems] of grouped) {
        bulkGrouped.set(categoryName, {
          categoryEn: null,
          items: categoryItems.map((item) => {
            const rowKey = globalIndex;
            globalIndex += 1;
            return {
              rowKey,
              category: item.category,
              name: item.name,
              description: item.description,
              price: item.price,
              isAvailable: true,
              isFeatured: false,
            };
          }),
        });
      }

      const bulk = await bulkImportMenuRows(supabase, tenantId, menuId, bulkGrouped);

      return {
        categoriesCreated: bulk.categoriesCreated,
        categoriesExisting: bulk.categoriesExisting,
        itemsCreated: bulk.itemsCreated,
        itemsSkipped: bulk.itemsSkipped,
        errors: bulk.errors.map((e) => ({ index: e.key, message: e.message })),
      };
    },
  };
}
