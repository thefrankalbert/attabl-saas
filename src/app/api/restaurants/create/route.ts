import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createRestaurantSchema } from '@/lib/validations/restaurant.schema';
import { createRestaurantGroupService } from '@/services/restaurant-group.service';
import { createSlugService } from '@/services/slug.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';

export async function POST(request: Request) {
  try {
    // 1. Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // 2. Parse and validate input
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }

    const parseResult = createRestaurantSchema.safeParse(body);
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => issue.message);
      return NextResponse.json({ error: 'Données invalides', details: errors }, { status: 400 });
    }

    const { name, type, slug: requestedSlug, plan } = parseResult.data;

    // 3. Use admin client for operations that bypass RLS
    const adminSupabase = createAdminClient();
    const slugService = createSlugService(adminSupabase);
    const groupService = createRestaurantGroupService(adminSupabase);

    // 4. Generate unique slug (verify the requested slug is available)
    const slug = await slugService.generateUniqueSlug(requestedSlug);

    // 5. Get or create the owner's group
    const group = await groupService.getOrCreateGroup(user.id);

    // 6. Add restaurant to group
    const result = await groupService.addRestaurantToGroup({
      groupId: group.id,
      userId: user.id,
      email: user.email || '',
      name,
      slug,
      type,
      plan,
    });

    logger.info('Restaurant created', { tenantId: result.tenantId, slug: result.slug });

    return NextResponse.json({
      tenantId: result.tenantId,
      slug: result.slug,
    });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json({ error: err.message }, { status: serviceErrorToStatus(err.code) });
    }

    logger.error('Restaurant creation failed', err);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
