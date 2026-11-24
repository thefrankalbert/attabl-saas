import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { verifyOrigin } from '@/lib/csrf';
import { commandCenterLimiter, getClientIp } from '@/lib/rate-limit';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { AuthError } from '@/lib/auth/get-session';
import { commandCenterQuerySchema } from '@/lib/validations/command-center.schema';
import { createCommandCenterService } from '@/services/command-center.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';

/**
 * Chiffres du Command Center pour le super administrateur (revue L017, A19).
 *
 * Le navigateur lisait `orders` avec la session de l'operateur: la RLS ne lui
 * ouvre que les restaurants dont il est membre, donc la console affichait des
 * chiffres faux pour tous les autres. Ici: super administrateur verifie EN
 * BASE (requireSuperAdmin), PUIS client service_role, borne aux restaurants
 * demandes. Le chiffre d'affaires vient du registre `payments` (A18).
 */
export async function POST(request: Request) {
  const originErr = verifyOrigin(request);
  if (originErr) return originErr;

  const { success: allowed } = await commandCenterLimiter.check(getClientIp(request));
  if (!allowed) {
    return NextResponse.json(
      { error: 'Trop de requetes' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = commandCenterQuerySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Donnees invalides' }, { status: 400 });
  }

  try {
    await requireSuperAdmin();
    const service = createCommandCenterService(createAdminClient());
    const q = parsed.data;
    const data =
      q.kind === 'overview'
        ? await service.loadOverview(q.tenantIds, q.todayStart, q.yesterdayStart)
        : await service.loadChart(q.tenantIds, q.start);
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof ServiceError) {
      logger.error('command-center route: lecture impossible', err);
      return NextResponse.json(
        { error: 'Chiffres indisponibles' },
        { status: serviceErrorToStatus(err.code) },
      );
    }
    logger.error('command-center route: erreur inattendue', err);
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
