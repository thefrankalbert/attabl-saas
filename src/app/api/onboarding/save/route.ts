import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { resolveSessionAdminUser } from '@/lib/auth/session-admin-user';
import { logger } from '@/lib/logger';
import { onboardingSaveSchema, readOnboardingSiteParam } from '@/lib/validations/onboarding.schema';
import { onboardingSaveLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { createOnboardingService } from '@/services/onboarding.service';
import { getStorageCleanup } from '@/services/storage-cleanup.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { isRoleAllowed, ONBOARDING_COMPLETE_ROLES } from '@/lib/admin-roles';

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await onboardingSaveLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const supabase = await createClient();

    // 2. Validate input with Zod
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }

    const parseResult = onboardingSaveSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message ?? 'Données invalides';
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { step, data } = parseResult.data;

    const siteSlug = readOnboardingSiteParam(request.url);
    if (siteSlug === undefined) {
      return NextResponse.json({ error: 'Parametre site invalide' }, { status: 400 });
    }

    const session = await resolveSessionAdminUser({
      requireActive: true,
      provisionIfMissing: true,
      siteSlug,
      ownerOnly: true,
    });
    if (!session.ok) {
      return NextResponse.json({ error: session.error }, { status: session.status });
    }

    // Same roles as the completion: the save writes the tenant's name, address
    // and colors, which only the owner may set up here.
    if (!isRoleAllowed(session.adminUser.role, ONBOARDING_COMPLETE_ROLES)) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    // A finished establishment is edited from its Settings, never from a draft.
    // Without this, an onboarding tab left open (or the save-on-leave beacon)
    // rewrote the name, address and colors with the values of that old tab.
    if (session.adminUser.onboarding_completed) {
      return NextResponse.json(
        { error: 'ONBOARDING_ALREADY_COMPLETED', slug: session.adminUser.tenant_slug },
        { status: 409 },
      );
    }

    // 4. Save step via service (pass full data as draft for complete restoration)
    const onboardingService = createOnboardingService(supabase);
    const tenantId = session.adminUser.tenant_id;
    // Etape 3 = logo: l'ancien fichier est libere apres l'ecriture (R-05).
    const cleanup = getStorageCleanup();
    const previousLogo = step === 3 ? await cleanup.logoUrlOf(tenantId) : [];
    await onboardingService.saveStep(tenantId, step, data, data);
    if (step === 3) await cleanup.release(tenantId, previousLogo);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Onboarding save error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
