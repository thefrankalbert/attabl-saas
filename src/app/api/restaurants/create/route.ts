import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createRestaurantSchema } from '@/lib/validations/restaurant.schema';
import { createRestaurantGroupService } from '@/services/restaurant-group.service';
import { createSlugService } from '@/services/slug.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { restaurantCreateLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // 0. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await restaurantCreateLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    // 1. Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // F1. Une session valide ne suffisait PAS. Cette route cree un tenant, et le
    // plan etait pris dans le corps de la requete: n'importe quel compte connecte
    // - y compris un serveur embauche pour une soiree - pouvait s'attribuer un
    // tenant Business gratuit a vie (149 000 XAF/mois de perte par tenant).
    //
    // Cette route sert UNIQUEMENT a ajouter un etablissement a un groupe
    // existant (unique appelant: AddRestaurantWizard, depuis l'admin). L'appelant
    // doit donc deja etre proprietaire ACTIF d'un tenant. L'inscription d'un
    // nouveau client passe par un autre chemin (signup.service) et n'est pas
    // affectee.
    const { data: ownership } = await supabase
      .from('admin_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!ownership) {
      logger.warn('Restaurant creation refused: caller is not an active owner', {
        userId: user.id,
      });
      return NextResponse.json(
        { error: "Seul le proprietaire d'un etablissement peut en ajouter un autre" },
        { status: 403 },
      );
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

    // F1. `plan` est volontairement IGNORE, meme s'il est encore accepte par le
    // schema (le formulaire l'envoie). Un plan payant ne s'obtient que par un
    // paiement Stripe abouti, via le webhook. Le lire ici revenait a laisser le
    // client choisir ce qu'il facture.
    const { name, type, slug: requestedSlug } = parseResult.data;
    const plan = 'trial';

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
      trialMode: result.trialMode,
    });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json({ error: err.message }, { status: serviceErrorToStatus(err.code) });
    }

    logger.error('Restaurant creation failed', err);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
