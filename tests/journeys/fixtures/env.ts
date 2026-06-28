/**
 * Centralise la config d'environnement du harnais + GARDE-FOU anti-prod.
 *
 * Regle de securite absolue: ce harnais ne doit JAMAIS seed/teardown la base de
 * production. Le ref du projet Supabase de prod est mis en denylist. Si l'URL
 * Supabase fournie le contient, on stoppe tout immediatement.
 */

// Ref du projet Supabase de PRODUCTION Attabl. Ne jamais cibler en test.
const PROD_SUPABASE_REFS = ['nqufpobuozrzwpeijkxt'];

// Hotes de PRODUCTION de l'app. Le harnais pilote l'app sur JOURNEY_BASE_URL:
// si cette URL pointe sur la prod, les parcours (signup, commandes) ecriraient
// dans la vraie base via l'app, meme si le seed direct est protege.
const PROD_APP_HOSTS = ['attabl.com', 'attabl-saas.vercel.app'];

export const journeyEnv = {
  baseURL: process.env.JOURNEY_BASE_URL || 'http://localhost:3000',
  // Base de TEST (branche Supabase ou projet de staging) - JAMAIS la prod.
  supabaseUrl: process.env.JOURNEY_SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.JOURNEY_SUPABASE_SERVICE_ROLE_KEY || '',
  // Tenant de test (slug) utilise pendant la journee.
  tenantSlug: process.env.JOURNEY_TENANT_SLUG || 'journey-test',
  // Stripe en MODE TEST uniquement (cle sk_test_...).
  stripeSecretKey: process.env.JOURNEY_STRIPE_SECRET_KEY || '',
};

/** Stoppe le run si on pointe (meme par erreur) sur la prod. */
export function assertNotProduction(): void {
  const url = journeyEnv.supabaseUrl;
  if (url && PROD_SUPABASE_REFS.some((ref) => url.includes(ref))) {
    throw new Error(
      `SECURITE: JOURNEY_SUPABASE_URL pointe sur la PROD (${url}). ` +
        `Le harnais refuse de seed/teardown la production. Utilise une branche Supabase ou un projet de staging.`,
    );
  }
  if (journeyEnv.stripeSecretKey && !journeyEnv.stripeSecretKey.startsWith('sk_test_')) {
    throw new Error(
      'SECURITE: JOURNEY_STRIPE_SECRET_KEY doit etre une cle TEST (sk_test_...). ' +
        'Le harnais refuse une cle live (sk_live_...).',
    );
  }
}

/**
 * Garde-fou pour le chemin APP (pas seulement le seed direct).
 *
 * Les parcours pilotent l'app sur journeyEnv.baseURL. En local, `pnpm dev` lit
 * .env.local dont NEXT_PUBLIC_SUPABASE_URL pointe sur la PROD: un signup ou une
 * commande ecrirait donc dans la vraie base. assertNotProduction() ne couvre que
 * le client service_role direct. On ferme ce trou ici, fail-closed:
 *   1. JOURNEY_BASE_URL ne doit pas etre un hote de prod.
 *   2. l'operateur doit confirmer explicitement que l'app vise une base de TEST
 *      (JOURNEY_CONFIRM_TEST_DB=yes), car on ne peut pas lire la DB de l'app a
 *      distance (le /api/health n'expose pas le ref, et on ne veut pas l'exposer).
 */
export function assertAppTargetIsTest(): void {
  let host = '';
  try {
    host = new URL(journeyEnv.baseURL).hostname;
  } catch {
    throw new Error(`SECURITE: JOURNEY_BASE_URL invalide (${journeyEnv.baseURL}).`);
  }
  const isProdHost = PROD_APP_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  if (isProdHost) {
    throw new Error(
      `SECURITE: JOURNEY_BASE_URL pointe sur un hote de PROD (${host}). ` +
        `Le harnais refuse de piloter l'app de production (signup/commandes y ecriraient).`,
    );
  }
  if (process.env.JOURNEY_CONFIRM_TEST_DB !== 'yes') {
    throw new Error(
      `SECURITE: confirmation requise. L'app sur ${journeyEnv.baseURL} doit cibler une base de TEST ` +
        `(pas la prod via .env.local). Lance 'pnpm dev' avec un env Supabase de test, puis relance avec ` +
        `JOURNEY_CONFIRM_TEST_DB=yes. Voir tests/journeys/README.md.`,
    );
  }
}

/** true si les variables de seed (base de test) sont fournies. */
export function hasSeedEnv(): boolean {
  return Boolean(journeyEnv.supabaseUrl && journeyEnv.supabaseServiceRoleKey);
}

/** true si Stripe test mode est configure. */
export function hasStripeTestEnv(): boolean {
  return journeyEnv.stripeSecretKey.startsWith('sk_test_');
}
