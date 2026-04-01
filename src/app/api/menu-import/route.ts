import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { CACHE_TAG_MENUS } from '@/lib/cache-tags';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { excelImportLimiter, getClientIp } from '@/lib/rate-limit';
import { createExcelImportService } from '@/services/excel-import.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { createPlanEnforcementService } from '@/services/plan-enforcement.service';
import type { Tenant } from '@/types/admin.types';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls'];
const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
];

export async function POST(request: Request) {
  try {
    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await excelImportLimiter.check(ip);
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

    // 4. Parse FormData and extract file
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Corps de requête invalide. Utilisez FormData.' },
        { status: 400 },
      );
    }

    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Aucun fichier fourni. Ajoutez un champ "file" au FormData.' },
        { status: 400 },
      );
    }

    // 5. Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Le fichier dépasse la taille maximale de 5 Mo.' },
        { status: 400 },
      );
    }

    // 6. Validate file extension and MIME type
    const fileName = file.name.toLowerCase();
    const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext));
    const hasValidMimeType = ALLOWED_MIME_TYPES.includes(file.type);

    if (!hasValidExtension || !hasValidMimeType) {
      return NextResponse.json(
        { error: 'Format de fichier invalide. Seuls les fichiers .xlsx et .xls sont acceptés.' },
        { status: 400 },
      );
    }

    // 7. Resolve tenant from slug (with plan info for limit checks)
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select(
        'id, name, slug, subscription_plan, subscription_status, trial_ends_at, is_active, created_at',
      )
      .eq('slug', tenantSlug)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant non trouve' }, { status: 404 });
    }

    // 7b. Verify user belongs to this tenant
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

    // 8. Get menu ID from FormData (required)
    const menuId = formData.get('menuId');

    if (!menuId || typeof menuId !== 'string') {
      return NextResponse.json(
        { error: 'Identifiant du menu requis. Ajoutez un champ "menuId" au FormData.' },
        { status: 400 },
      );
    }

    // 9. Check plan limits before import
    const enforcement = createPlanEnforcementService(supabase);
    await enforcement.canAddMenuItem(tenant as Tenant);

    // 10. Read file buffer and call service
    const buffer = await file.arrayBuffer();
    const importService = createExcelImportService(supabase);
    const result = await importService.importFromExcel(tenant.id, menuId, buffer);

    revalidateTag(CACHE_TAG_MENUS, 'max');

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.details) {
        logger.error('Excel import ServiceError details', {
          code: error.code,
          details: error.details,
        });
      }
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Excel import error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await excelImportLimiter.check(ip);
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

    // 3. Check if the user requested the demo file (?type=demo)
    const url = new URL(request.url);
    const templateType = url.searchParams.get('type');

    if (templateType === 'demo') {
      // Redirect to the static file served by Next.js from public/
      return NextResponse.redirect(new URL('/demo-menu-epicurien.xlsx', request.url));
    }

    // 4. Generate blank template via service
    const importService = createExcelImportService(supabase);
    const templateBuffer = await importService.generateTemplate();

    // 5. Return as downloadable Excel file
    const bytes = new Uint8Array(templateBuffer);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="menu-import-template.xlsx"',
        'Content-Length': String(bytes.byteLength),
      },
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.details) {
        logger.error('Excel template ServiceError details', {
          code: error.code,
          details: error.details,
        });
      }
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Excel template generation error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
