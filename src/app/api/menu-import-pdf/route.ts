import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { CACHE_TAG_MENUS } from '@/lib/cache-tags';
import { logger } from '@/lib/logger';
import { pdfImportLimiter, getClientIp } from '@/lib/rate-limit';
import { createPdfImportService } from '@/services/pdf-import.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { createPlanEnforcementService } from '@/services/plan-enforcement.service';
import { getAuthenticatedUserWithTenant, AuthError } from '@/lib/auth/get-session';
import type { Tenant } from '@/types/admin.types';
import type { PdfExtractedItem } from '@/services/pdf-import.service';
import { z } from 'zod';

const pdfItemSchema = z.object({
  category: z.string(),
  name: z.string(),
  price: z.number(),
  description: z.string().optional(),
});

const pdfItemsSchema = z.array(pdfItemSchema).min(1).max(500);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: Request) {
  try {
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
    const { tenantId, supabase } = await getAuthenticatedUserWithTenant();

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
        'id, name, slug, subscription_plan, subscription_status, trial_ends_at, is_active, created_at',
      )
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant non trouve' }, { status: 404 });
    }

    const importService = createPdfImportService(supabase);
    const enforcement = createPlanEnforcementService(supabase);

    // ─── Action: extract (preview only) ────────────────────
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
      const result = await importService.extractFromPdf(Buffer.from(buffer));

      return NextResponse.json({
        success: true,
        items: result.items,
        pageCount: result.pageCount,
        textLength: result.textLength,
      });
    }

    // ─── Action: import (with items JSON) ──────────────────
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
      const extraction = await importService.extractFromPdf(Buffer.from(buffer));

      if (extraction.items.length === 0) {
        return NextResponse.json({ error: 'Aucune donnee extraite du PDF.' }, { status: 400 });
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
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const items = parsed.data as PdfExtractedItem[];

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
