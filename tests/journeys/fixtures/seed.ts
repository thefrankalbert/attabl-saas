/**
 * Seed / teardown des donnees de test.
 *
 * Philosophie: on cree le tenant et l'equipe via les VRAIS endpoints (signup,
 * onboarding, invitations) dans les scenarios - c'est plus realiste et ca teste
 * le code reel. Ici on fournit surtout:
 *   - teardownTenantBySlug(): repartir d'une base propre (idempotence)
 *   - ensureAuthUser(): creer un compte de test directement (pour les rôles staff
 *     qu'on ne veut pas faire passer par tout le flux email a chaque run)
 *
 * GARDE-FOU: assertNotProduction() est appele avant toute ecriture. Le client
 * service_role ne touche QUE la base de test (JOURNEY_SUPABASE_URL).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocketImpl from 'ws';
import { assertNotProduction, hasSeedEnv, journeyEnv } from './env';

// Node < 22 n'a pas de WebSocket global; le constructeur realtime de
// @supabase/supabase-js le sonde a l'instanciation, meme si ce client admin ne
// se connecte jamais au realtime. On le polyfill depuis `ws` (le runtime Next de
// l'app, lui, fournit deja un WebSocket global - seul le process worker Playwright
// en manque).
const globalWithWs = globalThis as unknown as { WebSocket?: unknown };
if (typeof globalWithWs.WebSocket === 'undefined') {
  globalWithWs.WebSocket = WebSocketImpl;
}

let admin: SupabaseClient | null = null;

export function getAdmin(): SupabaseClient {
  assertNotProduction();
  if (!hasSeedEnv()) {
    throw new Error(
      'Seed indisponible: definis JOURNEY_SUPABASE_URL et JOURNEY_SUPABASE_SERVICE_ROLE_KEY ' +
        '(base de TEST/staging, jamais la prod). Voir tests/journeys/README.md',
    );
  }
  if (!admin) {
    admin = createClient(journeyEnv.supabaseUrl, journeyEnv.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return admin;
}

/**
 * Supprime le tenant de test (cascade) pour repartir propre.
 * Best-effort: ignore les erreurs "n'existe pas".
 */
export async function teardownTenantBySlug(slug = journeyEnv.tenantSlug): Promise<void> {
  assertNotProduction();
  const db = getAdmin();
  // order_items -> menu_items est une FK RESTRICT: tant qu'une commande existe, le
  // delete cascade du tenant ne peut pas passer par menu_items. On purge donc les
  // commandes d'abord (order_items cascade via orders), puis le tenant cascade le
  // reste (menus/categories/menu_items). Garde le teardown idempotent entre runs.
  const { data: tenant } = await db.from('tenants').select('id').eq('slug', slug).maybeSingle();
  if (tenant?.id) {
    await db.from('orders').delete().eq('tenant_id', tenant.id);
  }
  const { error } = await db.from('tenants').delete().eq('slug', slug);
  if (error && !/no rows|does not exist/i.test(error.message)) {
    // On loggue sans throw: un teardown qui echoue ne doit pas bloquer le run.
    console.warn(`[seed] teardown tenant "${slug}":`, error.message);
  }
}

/**
 * Cree (ou confirme) un utilisateur auth de test, email confirme.
 * Utile pour provisionner les rôles staff rapidement.
 */
export async function ensureAuthUser(email: string, password: string): Promise<string> {
  assertNotProduction();
  const db = getAdmin();
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error && !/already.*registered|exists/i.test(error.message)) {
    throw new Error(`ensureAuthUser(${email}) echec: ${error.message}`);
  }
  return data?.user?.id ?? '';
}

export interface SeededMenu {
  tenantId: string;
  menuItemId: string;
  /** Prix en DB (source de verite cote serveur). */
  price: number;
  itemName: string;
}

/**
 * Seed minimal et idempotent pour le parcours commande: un tenant (slug de test),
 * un menu, une categorie, un article avec un prix connu. Repart d'une base propre
 * (teardown cascade) pour etre rejouable.
 *
 * Le tenant n'a besoin que de slug + name (le reste a un defaut). validateTenant
 * exige is_active=true et deleted_at null -> on les pose explicitement.
 *
 * IMPORTANT: l'app (sur JOURNEY_BASE_URL) et ce seed doivent viser la MEME base de
 * test - sinon /api/orders ne verrait pas l'article seede.
 */
export async function seedTenantWithMenu(
  opts: { slug?: string; price?: number } = {},
): Promise<SeededMenu> {
  assertNotProduction();
  const db = getAdmin();
  const slug = opts.slug ?? journeyEnv.tenantSlug;
  const price = opts.price ?? 2500;
  const itemName = 'Poulet braise';

  // Base propre (cascade) pour l'idempotence.
  await teardownTenantBySlug(slug);

  const { data: tenant, error: tErr } = await db
    .from('tenants')
    .insert({ slug, name: `Journey Test ${slug}`, is_active: true })
    .select('id')
    .single();
  if (tErr || !tenant) throw new Error(`seed tenant echec: ${tErr?.message}`);

  const { data: menu, error: mErr } = await db
    .from('menus')
    .insert({ tenant_id: tenant.id, name: 'Menu test', slug: 'menu-test' })
    .select('id')
    .single();
  if (mErr || !menu) throw new Error(`seed menu echec: ${mErr?.message}`);

  const { data: category, error: cErr } = await db
    .from('categories')
    .insert({ tenant_id: tenant.id, menu_id: menu.id, name: 'Plats' })
    .select('id')
    .single();
  if (cErr || !category) throw new Error(`seed category echec: ${cErr?.message}`);

  const { data: item, error: iErr } = await db
    .from('menu_items')
    .insert({
      tenant_id: tenant.id,
      category_id: category.id,
      name: itemName,
      price,
      is_available: true,
    })
    .select('id')
    .single();
  if (iErr || !item) throw new Error(`seed menu_item echec: ${iErr?.message}`);

  return { tenantId: tenant.id, menuItemId: item.id, price, itemName };
}
