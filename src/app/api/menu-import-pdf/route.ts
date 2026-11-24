import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { CACHE_TAG_MENUS } from '@/lib/cache-tags';
import { logger } from '@/lib/logger';
import { pdfImportLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { createPdfImportService } from '@/services/pdf-import.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { createPlanEnforcementService } from '@/services/plan-enforcement.service';
import { getAuthenticatedUserWithTenant, AuthError } from '@/lib/auth/get-session';
import { assertTenantServing } from '@/lib/billing/assert-tenant-serving';
import type { Tenant } from '@/types/admin.types';
import type { PdfExtractedItem } from '@/services/pdf-import.service';
import { z } from 'zod';
import {
  MENU_PRICE_MAX,
  MENU_PRICE_REJECTION_LABEL,
  readMenuPrice,
} from '@/lib/utils/parse-price-text';

// Bornes alignees sur l'extraction (pdf-import.service.ts) et le formulaire de
// plat (audit B6): ce chemin recoit la liste renvoyee par le navigateur, qui
// n'est pas une entree de confiance. `nullish`: l'apercu produit
// `description: null` pour un plat sans description (audit B5).
const pdfItemSchema = z.object({
  category: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  // B72 (contre-audit 2): un plat a 0 serait en vente gratuitement. La liste
  // vient du navigateur: un prix nul ou negatif est refuse ici aussi.
  price: z
    .number()
    .finite()
    .positive('Un plat sans prix ne peut pas etre importe : ajoutez-le a la main avec son prix.')
    .max(MENU_PRICE_MAX, 'Prix trop eleve (99 999 999 au plus).'),
  description: z.string().max(1000).nullish(),
});

const pdfItemsSchema = z.array(pdfItemSchema).min(1).max(500);

/**
 * Contre-audit 3: la liste vient du navigateur. Chaque prix est rejoue avec la
 * regle de la devise du restaurant de la SESSION (entier strictement positif
 * en francs CFA, dans la borne). Renvoie le message du premier prix refuse.
 */
function invalidPriceMessage(
  items: Array<{ name: string; price: number }>,
  currency: string | null | undefined,
): string | null {
  for (const item of items) {
    const reading = readMenuPrice(item.price, currency);
    if (!reading.ok) {
      return `${item.name} : ${MENU_PRICE_REJECTION_LABEL[reading.reason]} (${item.price}). Corrigez le prix avant d importer.`;
    }
  }
  return null;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await pdfImportLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    // 2. Authenticate user and derive tenant from session (not from header)
    const { tenantId, supabase } = await getAuthenticatedUserWithTenant('menu.edit');
    // Coupure du restaurant: un import est une ecriture (403 + message via AuthError).
    await assertTenantServing(tenantId);

    // 3. Parse FormData
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Corps de requete invalide. Utilisez FormData.' },
        { status: 400 },
      );
    }

    const action = formData.get('action');
    const menuId = formData.get('menuId');

    if (!menuId || typeof menuId !== 'string') {
      return NextResponse.json(
        { error: 'Identifiant du menu requis. Ajoutez un champ "menuId" au FormData.' },
        { status: 400 },
      );
    }

    // 4. Resolve tenant by ID from session (with plan info for limit checks)
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select(
        'id, name, slug, currency, subscription_plan, subscription_status, trial_ends_at, is_active, created_at',
      )
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant non trouve' }, { status: 404 });
    }

    // SECURITY: verify the target menu belongs to the session tenant before
    // importing anything into it (no cross-tenant import via a foreign menuId).
    // Parity with the Excel import route (menu-import).
    const { data: menu } = await supabase
      .from('menus')
      .select('id')
      .eq('id', menuId)
      .eq('tenant_id', tenant.id)
      .maybeSingle();

    if (!menu) {
      return NextResponse.json({ error: 'Menu non trouve' }, { status: 404 });
    }

    const importService = createPdfImportService(supabase);
    const enforcement = createPlanEnforcementService(supabase);

    // --- Action: extract (preview only) --------------------
    if (action === 'extract') {
      const file = formData.get('file');

      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: 'Aucun fichier fourni. Ajoutez un champ "file" au FormData.' },
          { status: 400 },
        );
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: 'Le fichier dépasse la taille maximale de 10 Mo.' },
          { status: 400 },
        );
      }

      // Validate file extension
      const fileName = file.name.toLowerCase();
      if (!fileName.endsWith('.pdf')) {
        return NextResponse.json(
          { error: 'Format de fichier invalide. Seuls les fichiers .pdf sont acceptés.' },
          { status: 400 },
        );
      }

      const buffer = await file.arrayBuffer();
      const result = await importService.extractFromPdf(Buffer.from(buffer), tenant.currency);

      return NextResponse.json({
        success: true,
        items: result.items,
        pageCount: result.pageCount,
        textLength: result.textLength,
        // B71: carte lue en partie seulement, l'ecran le signale.
        truncated: result.truncated,
        // B72: plats non importes (prix refuse): l'ecran les nomme.
        notImported: result.notImported,
      });
    }

    // --- Action: import (with items JSON) ------------------
    const itemsJson = formData.get('items');

    if (!itemsJson || typeof itemsJson !== 'string') {
      // If no items JSON provided, try extracting from a file and importing directly
      const file = formData.get('file');

      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: 'Aucun fichier ou données fournis.' }, { status: 400 });
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: 'Le fichier dépasse la taille maximale de 10 Mo.' },
          { status: 400 },
        );
      }

      const fileName = file.name.toLowerCase();
      if (!fileName.endsWith('.pdf')) {
        return NextResponse.json(
          { error: 'Format de fichier invalide. Seuls les fichiers .pdf sont acceptés.' },
          { status: 400 },
        );
      }

      const buffer = await file.arrayBuffer();
      const extraction = await importService.extractFromPdf(Buffer.from(buffer), tenant.currency);

      if (extraction.items.length === 0) {
        return NextResponse.json({ error: 'Aucune donnee extraite du PDF.' }, { status: 400 });
      }
      // B72: sans apercu, des plats manqueraient a la carte sans que personne
      // le sache. On refuse tout et on dit lesquels.
      if (extraction.notImported.length > 0) {
        const noms = extraction.notImported
          .slice(0, 5)
          .map((r) => `${r.name} (${r.price} : ${MENU_PRICE_REJECTION_LABEL[r.reason]})`)
          .join(', ');
        return NextResponse.json(
          {
            error: `Rien n a ete importe. Ces plats ont un prix que nous ne pouvons pas lire : ${noms}. Corrigez le PDF, ou passez par l apercu et ajoutez-les ensuite a la main.`,
          },
          { status: 400 },
        );
      }
      // B71: sans apercu, une carte lue en partie serait importee comme complete.
      if (extraction.truncated) {
        return NextResponse.json(
          {
            error:
              'Ce PDF est trop long pour etre importe en une fois. Coupez-le en plusieurs fichiers, ou passez par l apercu.',
          },
          { status: 400 },
        );
      }

      // B72: meme porte que l'etape "import" avec apercu (prix > 0, bornes),
      // pour qu'aucun plat a 0 n'atteigne l'insertion par ce chemin non plus.
      const directItems = pdfItemsSchema.safeParse(extraction.items);
      if (!directItems.success) {
        const priceIssue = directItems.error.issues.find((issue) => issue.path.at(-1) === 'price');
        return NextResponse.json(
          { error: priceIssue?.message ?? 'Donnees invalides' },
          { status: 400 },
        );
      }

      // Check plan limits before importing items
      await enforcement.canAddItems(tenant as Tenant, extraction.items.length);

      const result = await importService.importItems(tenant.id, menuId, extraction.items);

      revalidateTag(CACHE_TAG_MENUS, 'max');

      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    // Parse the items JSON and validate with Zod
    let rawItems: unknown;
    try {
      rawItems = JSON.parse(itemsJson);
    } catch {
      return NextResponse.json(
        { error: 'Le champ "items" contient un JSON invalide.' },
        { status: 400 },
      );
    }

    const parsed = pdfItemsSchema.safeParse(rawItems);
    if (!parsed.success) {
      // B72: un prix refuse a son propre message (que faire), pas "invalide".
      const priceIssue = parsed.error.issues.find((issue) => issue.path.at(-1) === 'price');
      return NextResponse.json(
        { error: priceIssue?.message ?? 'Donnees invalides', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const items = parsed.data as PdfExtractedItem[];
    const priceError = invalidPriceMessage(items, tenant.currency);
    if (priceError) {
      return NextResponse.json({ error: priceError }, { status: 400 });
    }

    // Check plan limits before importing items
    await enforcement.canAddItems(tenant as Tenant, items.length);

    const result = await importService.importItems(tenant.id, menuId, items);

    revalidateTag(CACHE_TAG_MENUS, 'max');

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ServiceError) {
      if (error.details) {
        logger.error('PDF import ServiceError details', {
          code: error.code,
          details: error.details,
        });
      }
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('PDF import error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
