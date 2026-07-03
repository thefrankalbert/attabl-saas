import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { excelImportLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { canAccessFeature } from '@/lib/plans/features';
import { createRecipeImportService } from '@/services/recipe-import.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { getAuthenticatedUserWithTenant, AuthError } from '@/lib/auth/get-session';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls'];
const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
];

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await excelImportLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    // 2. Authenticate + role gate (owner/admin/manager via inventory.edit, honours
    // per-user overrides). Bulk recipe/ingredient writes must not be reachable by
    // cashier/waiter/chef.
    const { tenantId, supabase } = await getAuthenticatedUserWithTenant('inventory.edit');

    // 3. Parse FormData and extract file
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Corps de requete invalide. Utilisez FormData.' },
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

    // 4. Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Le fichier depasse la taille maximale de 5 Mo.' },
        { status: 400 },
      );
    }

    // 5. Validate file extension and MIME type
    const fileName = file.name.toLowerCase();
    const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext));
    const hasValidMimeType = ALLOWED_MIME_TYPES.includes(file.type);
    if (!hasValidExtension || !hasValidMimeType) {
      return NextResponse.json(
        { error: 'Format de fichier invalide. Seuls les fichiers .xlsx et .xls sont acceptes.' },
        { status: 400 },
      );
    }

    // 6. Plan gate: inventory feature must be enabled for this tenant's plan.
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('subscription_plan, subscription_status, trial_ends_at')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant non trouve' }, { status: 404 });
    }

    if (
      !canAccessFeature(
        'canAccessInventory',
        tenant.subscription_plan,
        tenant.subscription_status,
        tenant.trial_ends_at,
      )
    ) {
      return NextResponse.json(
        { error: 'La gestion de stock n est pas incluse dans votre plan.' },
        { status: 403 },
      );
    }

    // 7. Read file buffer and call service
    const buffer = await file.arrayBuffer();
    const importService = createRecipeImportService(supabase);
    const result = await importService.importFromExcel(tenantId, buffer);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Recipe import error', error);
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
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    // 2. Authenticate user via session
    const { supabase } = await getAuthenticatedUserWithTenant();

    // 3. Generate blank template
    const importService = createRecipeImportService(supabase);
    const templateBuffer = await importService.generateTemplate();

    const bytes = new Uint8Array(templateBuffer);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="recipe-import-template.xlsx"',
        'Content-Length': String(bytes.byteLength),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Recipe template generation error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
