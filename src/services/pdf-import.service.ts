import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';

// ─── Types ────────────────────────────────────────────────────

export interface PdfExtractedItem {
  category: string;
  name: string;
  description: string | null;
  price: number;
}

export interface PdfExtractionResult {
  items: PdfExtractedItem[];
  pageCount: number;
  textLength: number;
}

export interface PdfImportResult {
  categoriesCreated: number;
  categoriesExisting: number;
  itemsCreated: number;
  itemsSkipped: number;
  errors: Array<{ index: number; message: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────

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

/**
 * PDF import service for menu data.
 *
 * Extracts structured menu data from a PDF using Claude AI,
 * then imports into the database following the same pattern
 * as the Excel import service.
 *
 * Follows the project DI pattern: receives a SupabaseClient.
 */
export function createPdfImportService(supabase: SupabaseClient) {
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
      const result: PdfImportResult = {
        categoriesCreated: 0,
        categoriesExisting: 0,
        itemsCreated: 0,
        itemsSkipped: 0,
        errors: [],
      };

      if (items.length === 0) {
        return result;
      }

      // Group items by category, preserving order
      const grouped = new Map<string, PdfExtractedItem[]>();
      for (const item of items) {
        const existing = grouped.get(item.category);
        if (existing) {
          existing.push(item);
        } else {
          grouped.set(item.category, [item]);
        }
      }

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

      let globalIndex = 0;

      for (const [categoryName, categoryItems] of grouped) {
        // Check if category already exists for this tenant + menu
        const { data: existingCategory, error: catLookupError } = await supabase
          .from('categories')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('menu_id', menuId)
          .eq('name', categoryName)
          .single();

        if (catLookupError && catLookupError.code !== 'PGRST116') {
          logger.error('Error looking up category', catLookupError, {
            categoryName,
            tenantId,
          });
          for (let i = 0; i < categoryItems.length; i++) {
            result.errors.push({
              index: globalIndex,
              message: `Failed to look up category "${categoryName}"`,
            });
            result.itemsSkipped += 1;
            globalIndex += 1;
          }
          continue;
        }

        let categoryId: string;

        if (existingCategory) {
          categoryId = existingCategory.id;
          result.categoriesExisting += 1;
        } else {
          const { data: newCategory, error: catCreateError } = await supabase
            .from('categories')
            .insert({
              tenant_id: tenantId,
              menu_id: menuId,
              name: categoryName,
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
            for (let i = 0; i < categoryItems.length; i++) {
              result.errors.push({
                index: globalIndex,
                message: `Failed to create category "${categoryName}"`,
              });
              result.itemsSkipped += 1;
              globalIndex += 1;
            }
            continue;
          }

          categoryId = newCategory.id;
          nextCategoryOrder += 1;
          result.categoriesCreated += 1;
        }

        // Count existing items in this category to determine insertion order
        const { count: existingCount } = await supabase
          .from('menu_items')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('category_id', categoryId);

        let nextItemOrder = (existingCount ?? 0);

        for (const item of categoryItems) {
          const { error: itemError } = await supabase.from('menu_items').insert({
            tenant_id: tenantId,
            category_id: categoryId,
            name: item.name,
            description: item.description || null,
            price: item.price,
            is_available: true,
            is_featured: false,
            slug: slugify(item.name),
          });

          if (itemError) {
            logger.error('Error inserting menu item', itemError, {
              itemName: item.name,
              index: globalIndex,
            });
            result.errors.push({
              index: globalIndex,
              message: `Failed to insert item "${item.name}": ${itemError.message}`,
            });
            result.itemsSkipped += 1;
          } else {
            nextItemOrder += 1;
            result.itemsCreated += 1;
          }

          globalIndex += 1;
        }
      }

      logger.info('PDF import completed', {
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
  };
}
