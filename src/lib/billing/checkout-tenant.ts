import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

type CheckoutTenantRow = {
  tenant_id: string;
  tenants: {
    name: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    trial_ends_at: string | null;
    subscription_status: string | null;
  } | null;
};

export type ResolveCheckoutTenantResult =
  | { ok: true; userId: string; email: string; tenant: CheckoutTenantRow }
  | { ok: false; status: 401 | 403 | 404 | 400; error: string; code?: 'TENANT_AMBIGU' };

const COLONNES_FACTURATION =
  'tenant_id, tenants(name, stripe_customer_id, stripe_subscription_id, trial_ends_at, subscription_status)';

/** Les roles autorises a engager une depense pour le restaurant. */
const ROLES_FACTURATION = ['owner', 'admin'];

/**
 * Refus si le role n'engage pas la depense. UNE seule definition, appelee sur
 * les DEUX branches: la premiere version ne la posait que sur la branche avec
 * cible, et un employe dont le compte n'a qu'un seul restaurant pouvait ouvrir
 * une caisse. C'est exactement la divergence que ce fichier est cense tuer.
 */
function refusDeRole(role: unknown): ResolveCheckoutTenantResult | null {
  if (ROLES_FACTURATION.includes(role as string)) return null;
  return {
    ok: false,
    status: 403,
    error: 'Seuls les proprietaires et administrateurs peuvent souscrire un abonnement.',
  };
}

function aplatirTenant(brut: unknown): CheckoutTenantRow['tenants'] {
  const valeur = Array.isArray(brut) ? (brut[0] ?? null) : brut;
  return valeur as CheckoutTenantRow['tenants'];
}

/**
 * Quel restaurant la caisse doit-elle facturer ?
 *
 * LE DEFAUT QUE CE FICHIER CORRIGE. La resolution prenait la PLUS ANCIENNE
 * ligne `admin_users` de l'utilisateur (`order created_at asc` + `limit 1`),
 * sans jamais regarder quel restaurant il consultait. Un proprietaire de
 * plusieurs etablissements ne pouvait donc abonner que le premier: le second
 * etait INABONNABLE, et le paiement partait sur le mauvais restaurant. Defaut
 * de revenu, pas d'affichage.
 *
 * POURQUOI UN SLUG VENU DU CLIENT EST ACCEPTABLE ICI. La regle du depot
 * interdit de FAIRE CONFIANCE a un tenant envoye par le client - pas de le
 * recevoir. Le slug sert a designer la cible; l'autorisation vient ensuite
 * d'une verification serveur: l'utilisateur doit avoir une ligne `admin_users`
 * ACTIVE sur ce restaurant, avec un role qui engage la depense. Sans cette
 * verification ce serait une IDOR; avec elle, c'est le meme schema que
 * `/api/update-subscription`.
 *
 * ATTENTION: la lecture se fait avec le client service_role (le RLS ne protege
 * donc rien ici). La verification d'appartenance n'est pas une ceinture de
 * securite supplementaire, c'est LA seule.
 *
 * @param tenantSlug Restaurant cible. Absent: voir la regle de non-ambiguite
 *   ci-dessous (un seul restaurant -> celui-la; plusieurs -> refus explicite,
 *   jamais un choix arbitraire).
 */
export async function resolveCheckoutTenant(options?: {
  tenantSlug?: string | null;
}): Promise<ResolveCheckoutTenantResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, status: 401, error: 'Non authentifie' };
  }

  if (!user.email) {
    return { ok: false, status: 400, error: 'Aucune adresse email associee a ce compte' };
  }

  const admin = createAdminClient();
  const slug = options?.tenantSlug?.trim() || null;

  if (slug) {
    const { data: tenant, error: tenantError } = await admin
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .is('deleted_at', null)
      .maybeSingle();

    if (tenantError || !tenant) {
      return { ok: false, status: 404, error: 'Restaurant non trouve' };
    }

    // L'autorisation, et non la confiance: appartenance ACTIVE + role.
    const { data: membre, error: membreError } = await admin
      .from('admin_users')
      .select(`role, ${COLONNES_FACTURATION}`)
      .eq('user_id', user.id)
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .maybeSingle();

    if (membreError || !membre) {
      logger.warn('Caisse: restaurant demande hors des acces de l utilisateur', {
        userId: user.id,
        tenantId: tenant.id,
      });
      return { ok: false, status: 403, error: 'Acces refuse a ce restaurant' };
    }

    const refus = refusDeRole(membre.role);
    if (refus) return refus;

    return {
      ok: true,
      userId: user.id,
      email: user.email,
      tenant: {
        tenant_id: membre.tenant_id as string,
        tenants: aplatirTenant((membre as { tenants?: unknown }).tenants),
      },
    };
  }

  // Sans cible explicite: on n'en DEVINE pas une. On lit deux lignes pour
  // savoir s'il y a ambiguite, sans charger toute la liste.
  const { data: membres, error: membresError } = await admin
    .from('admin_users')
    .select(`role, ${COLONNES_FACTURATION}`)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(2);

  if (membresError || !membres || membres.length === 0) {
    return { ok: false, status: 404, error: 'Tenant non trouve pour cet utilisateur' };
  }

  if (membres.length > 1) {
    // Choisir le plus ancien ici, c'est facturer le mauvais restaurant en
    // silence. On refuse, et l'appel doit nommer sa cible.
    logger.warn('Caisse: plusieurs restaurants et aucune cible precisee', { userId: user.id });
    return {
      ok: false,
      status: 400,
      error: 'Precisez le restaurant a abonner.',
      code: 'TENANT_AMBIGU',
    };
  }

  const membre = membres[0];
  const refusSansCible = refusDeRole((membre as { role?: unknown }).role);
  if (refusSansCible) return refusSansCible;

  return {
    ok: true,
    userId: user.id,
    email: user.email,
    tenant: {
      tenant_id: membre.tenant_id as string,
      tenants: aplatirTenant((membre as { tenants?: unknown }).tenants),
    },
  };
}
