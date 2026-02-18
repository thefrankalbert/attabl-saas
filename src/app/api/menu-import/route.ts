import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { excelImportLimiter, getClientIp } from '@/lib/rate-limit';
import { createExcelImportService } from '@/services/excel-import.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import * as fs from 'fs';
import * as path from 'path';

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
        { status: 429 },
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

    if (!hasValidExtension && !hasValidMimeType) {
      return NextResponse.json(
        { error: 'Format de fichier invalide. Seuls les fichiers .xlsx et .xls sont acceptés.' },
        { status: 400 },
      );
    }

    // 7. Resolve tenant from slug
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant non trouvé' }, { status: 404 });
    }

    // 8. Get menu ID from FormData (required)
    const menuId = formData.get('menuId');

    if (!menuId || typeof menuId !== 'string') {
      return NextResponse.json(
        { error: 'Identifiant du menu requis. Ajoutez un champ "menuId" au FormData.' },
        { status: 400 },
      );
    }

    // 9. Read file buffer and call service
    const buffer = await file.arrayBuffer();
    const importService = createExcelImportService(supabase);
    const result = await importService.importFromExcel(tenant.id, menuId, buffer);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message, ...(error.details ? { details: error.details } : {}) },
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
        { status: 429 },
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
      // Serve the pre-filled demo file from public/
      const demoFilePath = path.join(process.cwd(), 'public', 'demo-menu-epicurien.xlsx');

      if (fs.existsSync(demoFilePath)) {
        const demoBuffer = fs.readFileSync(demoFilePath);
        const bytes = new Uint8Array(demoBuffer);
        return new Response(bytes, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="demo-menu-epicurien.xlsx"',
            'Content-Length': String(bytes.byteLength),
          },
        });
      }

      // Fall through to the blank template if demo file is not found
      logger.warn('Demo Excel file not found, falling back to blank template', {
        path: demoFilePath,
      });
    }

    // 4. Generate blank template via service
    const importService = createExcelImportService(supabase);
    const templateBuffer = importService.generateTemplate();

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
      return NextResponse.json(
        { error: error.message, ...(error.details ? { details: error.details } : {}) },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Excel template generation error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
