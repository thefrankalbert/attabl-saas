import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { ServiceError } from '@/services/errors';
import { invitationValidateLimiter } from '@/lib/rate-limit';
import { createInvitationService } from '@/services/invitation.service';
import { validateInvitationSchema } from '@/lib/validations/invitation.schema';

/**
 * POST /api/invitations/validate  { token }
 *
 * Le jeton voyage dans le corps et non dans l'adresse: une adresse se retrouve dans
 * les journaux d'acces, l'historique et les en-tetes Referer.
 *
 * Read-only check used by the accept-invite page on mount. It NEVER creates an
 * account, sends an email, or runs plan enforcement - so it has its own
 * fail-open, token-keyed rate limiter and cannot drain the acceptance budget.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const parsed = validateInvitationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ valid: false }, { status: 400 });
    }

    // Keyed by token (not IP): a single invitation gets its own budget, immune
    // to CGNAT / shared-wifi collisions. Fail-open: a Redis blip must not block
    // a legitimate invitee from loading the page.
    const { success: allowed } = await invitationValidateLimiter.check(parsed.data.token);
    if (!allowed) {
      return NextResponse.json(
        { valid: false, error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const service = createInvitationService(createAdminClient());
    await service.validateToken(parsed.data.token);

    return NextResponse.json({ valid: true });
  } catch (error) {
    if (error instanceof ServiceError) {
      // VALIDATION = expired invitation -> 410 so the page shows the expired state.
      if (error.code === 'VALIDATION') {
        return NextResponse.json({ valid: false, expired: true }, { status: 410 });
      }
      // NOT_FOUND = unknown / already-used token.
      return NextResponse.json({ valid: false }, { status: 404 });
    }
    logger.error('Invitation validate error', error);
    return NextResponse.json({ valid: false, error: 'Erreur serveur' }, { status: 500 });
  }
}
