import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { pdfImportLimiter, getClientIp } from '@/lib/rate-limit';
import { createPdfImportService } from '@/services/pdf-import.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
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

    // 2. Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // 3. Get tenant slug from header
    const headersList = await headers();
    const tenantSlug = headersList.get('x-tenant-slug');

    if (!tenantSlug) {
      return NextResponse.json({ error: 'Tenant non identifié' }, { status: 400 });
    }

    // 4. Parse FormData
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Corps de requête invalide. Utilisez FormData.' },
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

    // 5. Resolve tenant from slug
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant non trouvé' }, { status: 404 });
    }

    // 5b. Verify user belongs to this tenant
    const { data: membership } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const importService = createPdfImportService(supabase);

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
        return NextResponse.json({ error: 'Aucune donnée extraite du PDF.' }, { status: 400 });
      }

      const result = await importService.importItems(tenant.id, menuId, extraction.items);

      revalidateTag('menus', 'max');

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

    const result = await importService.importItems(tenant.id, menuId, items);

    revalidateTag('menus', 'max');

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
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
