import type { AdminRole } from '@/types/admin.types';

/**
 * Ou envoyer un utilisateur qui vient de se connecter.
 *
 * POURQUOI CE FICHIER EXISTE. La route de connexion par mot de passe et le
 * retour OAuth decidaient chacune de leur cote, et toutes deux envoyaient
 * `/admin/tenants` a TOUT compte dont l'onboarding etait fini. Or
 * `/admin/tenants` est l'annuaire des etablissements d'un PROPRIETAIRE: elle
 * refusait tout autre role. Consequence vecue en production: un serveur, un
 * cuisinier, un caissier ou un gerant invite depuis l'espace admin acceptait
 * son invitation, arrivait bien sur son tableau de bord ce jour-la (la page
 * d'acceptation redirige vers `/sites/{slug}/admin`), puis tombait sur
 * "Page not found" a chacune de ses connexions suivantes.
 *
 * La decision vit ici, une seule fois, et sans client Supabase: elle ne depend
 * que des lignes de membership deja chargees, donc elle se teste directement.
 *
 * ELLE N'OUVRE AUCUN ACCES. L'espace d'un etablissement accepte deja tout
 * membre vivant quel que soit son role (voir `sites/[site]/admin/layout.tsx`),
 * et chaque page sensible reste gardee par sa permission (voir
 * `admin-route-permissions.ts` applique dans le middleware). On repare une
 * adresse, pas un droit.
 */
export interface PostLoginMembership {
  role: AdminRole | null;
  isSuperAdmin: boolean;
  isActive: boolean;
  deletedAt: string | null;
  tenantSlug: string | null;
  onboardingCompleted: boolean;
  tenantCreatedAt: string | null;
}

/**
 * Forme brute d'une ligne telle que PostgREST la rend, avec sa jointure
 * `tenants(...)`. Le SDK type la jointure comme un objet OU un tableau selon la
 * requete, d'ou la normalisation ici plutot que dans chaque appelant.
 */
export interface RawMembershipRow {
  role?: string | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
  is_super_admin?: boolean | null;
  tenants?: unknown;
}

interface RawTenant {
  slug?: string | null;
  onboarding_completed?: boolean | null;
  created_at?: string | null;
}

export function mapMembershipRows(
  rows: readonly RawMembershipRow[] | null | undefined,
): PostLoginMembership[] {
  return (rows ?? []).map((row) => {
    const joined = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
    const tenant = (joined ?? null) as RawTenant | null;

    return {
      role: (row.role ?? null) as AdminRole | null,
      isSuperAdmin: row.is_super_admin === true,
      // `is_active` absent d'un select ancien ne doit pas tuer la session: on
      // considere la ligne vivante, comme avant l'ajout du filtre.
      isActive: row.is_active !== false,
      deletedAt: row.deleted_at ?? null,
      tenantSlug: tenant?.slug ?? null,
      onboardingCompleted: tenant?.onboarding_completed === true,
      tenantCreatedAt: tenant?.created_at ?? null,
    };
  });
}

/**
 * Un membership suspendu (`is_active=false`) ou supprime en douceur
 * (`deleted_at`) ne compte pas. Les deux routes de connexion omettaient ce
 * filtre, si bien qu'un membre banni etait route comme un membre vivant - le
 * layout le refusait ensuite, mais sur une page ou il n'avait rien a faire.
 */
function liveOnly(rows: readonly PostLoginMembership[]): PostLoginMembership[] {
  return rows.filter((row) => row.isActive && row.deletedAt === null);
}

/**
 * L'etablissement d'arrivee d'un membre: le plus ancien de ses memberships
 * vivants qui porte un slug. Regle fixe, donc la meme a chaque connexion. Un
 * membre de plusieurs etablissements n'est pas coince: le selecteur de la barre
 * laterale (`ShellBrandSwitcher`) lui donne les autres.
 */
export function pickHomeTenantSlug(rows: readonly PostLoginMembership[]): string | null {
  const candidates = liveOnly(rows).filter((row) => row.tenantSlug !== null);
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    // Une date manquante passe en dernier, pour que l'ordre reste total.
    if (a.tenantCreatedAt === b.tenantCreatedAt) return 0;
    if (a.tenantCreatedAt === null) return 1;
    if (b.tenantCreatedAt === null) return -1;
    return a.tenantCreatedAt < b.tenantCreatedAt ? -1 : 1;
  });

  return sorted[0].tenantSlug;
}

export function postLoginDestination(rows: readonly PostLoginMembership[]): string {
  // Aucune ligne du tout: compte sorti de l'onboarding en cours de route. On le
  // renvoie au parcours pour qu'il reprenne, comme avant ce fichier.
  if (rows.length === 0) return '/onboarding';

  const live = liveOnly(rows);

  // Des lignes existent mais aucune n'est vivante: compte banni ou retire. Il
  // ne doit PAS atterrir sur l'onboarding, qui lui creerait un etablissement.
  if (live.length === 0) return '/unauthorized';

  // Les super-admins plateforme n'appartiennent qu'au tenant technique
  // `__platform`, laisse volontairement non onboarde: la verification
  // d'onboarding ci-dessous les renverrait creer un restaurant.
  if (live.some((row) => row.isSuperAdmin)) return '/admin/platform';

  const isOwner = live.some((row) => row.role === 'owner');

  if (isOwner) {
    // Un etablissement inacheve se reprend; `/onboarding` ouvre le plus recent.
    const needsOnboarding = live.some((row) => !row.onboardingCompleted);
    return needsOnboarding ? '/onboarding' : '/admin/tenants';
  }

  // Tout autre role: son espace. L'onboarding est l'affaire du proprietaire, on
  // n'y envoie donc jamais un serveur ou un cuisinier.
  const slug = pickHomeTenantSlug(live);
  return slug ? `/sites/${slug}/admin` : '/unauthorized';
}
