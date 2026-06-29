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
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocketImpl from 'ws';
import { assertNotProduction, hasSeedEnv, journeyEnv } from './env';
import type { Persona, RestaurantRole } from './personas';

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
  if (!error && data?.user?.id) return data.user.id;
  if (error && !/already.*registered|exists/i.test(error.message)) {
    throw new Error(`ensureAuthUser(${email}) echec: ${error.message}`);
  }
  // L'utilisateur existe deja (ex: cree non-confirme par le flux signup d'un
  // autre parcours). On le retrouve et on FORCE email_confirm + password, sinon
  // /api/login renvoie 403 "email non confirme".
  const { data: list } = await db.auth.admin.listUsers();
  const existing = list?.users.find((u) => u.email === email);
  if (!existing) return '';
  await db.auth.admin.updateUserById(existing.id, { email_confirm: true, password });
  return existing.id;
}

/** true si un utilisateur auth existe pour cet email (verifie un signup reel). */
export async function authUserExists(email: string): Promise<boolean> {
  assertNotProduction();
  const db = getAdmin();
  const { data } = await db.auth.admin.listUsers();
  return Boolean(data?.users.some((u) => u.email === email));
}

export interface SeededMenu {
  tenantId: string;
  menuItemId: string;
  /** Prix en DB (source de verite cote serveur). */
  price: number;
  itemName: string;
}

export interface OrderState {
  payment_status: string | null;
  status: string | null;
  preparation_zone: string | null;
  server_id: string | null;
}

/** Lit l'etat d'une commande (paiement, statut, zone de prep) cote DB de test. */
export async function getOrderState(orderId: string): Promise<OrderState | null> {
  assertNotProduction();
  const db = getAdmin();
  const { data } = await db
    .from('orders')
    .select('payment_status, status, preparation_zone, server_id')
    .eq('id', orderId)
    .maybeSingle();
  return (data as OrderState | null) ?? null;
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

// Les personas cote restaurant utilisent des libelles (server, kitchen) qui ne
// sont pas les valeurs de l'enum admin_users.role. On mappe vers les vraies
// valeurs autorisees par la contrainte admin_users_role_check.
const DB_ROLE: Record<RestaurantRole, string> = {
  owner: 'owner',
  manager: 'manager',
  cashier: 'cashier',
  server: 'waiter',
  kitchen: 'chef',
};

/**
 * Provisionne l'equipe (comptes auth confirmes + lignes admin_users liees au
 * tenant) pour les parcours qui testent l'auth et les permissions par role.
 * Idempotent par run (le run-script repart d'un stack local vierge: auth.users
 * est vide a chaque run).
 */
export async function seedStaffForTenant(tenantId: string, personas: Persona[]): Promise<void> {
  assertNotProduction();
  const db = getAdmin();
  for (const p of personas) {
    if (!p.email || !p.password || !p.role) continue;
    const userId = await ensureAuthUser(p.email, p.password);
    if (!userId) continue;
    const { error } = await db.from('admin_users').insert({
      tenant_id: tenantId,
      user_id: userId,
      email: p.email,
      full_name: p.label,
      role: DB_ROLE[p.role],
      is_active: true,
    });
    if (error && !/duplicate|already exists/i.test(error.message)) {
      throw new Error(`seed staff ${p.email} (${DB_ROLE[p.role]}) echec: ${error.message}`);
    }
  }
}

/**
 * Retourne admin_users.id (la cle de la ligne staff, PAS le user_id auth) pour un
 * role donne d'un tenant. invitations.invited_by et table_assignments.server_id
 * referencent admin_users.id - on en a besoin pour seeder ces lignes.
 */
export async function getStaffAdminId(
  tenantId: string,
  role: RestaurantRole,
): Promise<string | null> {
  assertNotProduction();
  const db = getAdmin();
  const { data } = await db
    .from('admin_users')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('role', DB_ROLE[role])
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export interface SeededZoneTable {
  venueId: string;
  zoneId: string;
  tableId: string;
  tableName: string;
}

/**
 * Seed config salle: une venue (zones.venue_id est NOT NULL), une zone, une table.
 * Sert au parcours 02 (config) et au seed du tenant B pour la BOLA (08).
 */
export async function seedZoneAndTable(tenantId: string): Promise<SeededZoneTable> {
  assertNotProduction();
  const db = getAdmin();

  const { data: venue, error: vErr } = await db
    .from('venues')
    .insert({
      tenant_id: tenantId,
      slug: `venue-${tenantId.slice(0, 8)}`,
      name: 'Salle principale',
      type: 'restaurant',
    })
    .select('id')
    .single();
  if (vErr || !venue) throw new Error(`seed venue echec: ${vErr?.message}`);

  const { data: zone, error: zErr } = await db
    .from('zones')
    .insert({
      tenant_id: tenantId,
      venue_id: venue.id,
      name: 'Salle',
      prefix: 'A',
      display_order: 0,
    })
    .select('id')
    .single();
  if (zErr || !zone) throw new Error(`seed zone echec: ${zErr?.message}`);

  const tableName = 'A1';
  const { data: table, error: tErr } = await db
    .from('tables')
    .insert({
      tenant_id: tenantId,
      zone_id: zone.id,
      table_number: '1',
      display_name: tableName,
      capacity: 2,
      is_active: true,
    })
    .select('id')
    .single();
  if (tErr || !table) throw new Error(`seed table echec: ${tErr?.message}`);

  return { venueId: venue.id, zoneId: zone.id, tableId: table.id, tableName };
}

export interface SeededCoupon {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
}

/**
 * Seed un coupon valide (actif, sans bornes de date) pour le tenant. Le parcours
 * 07 verifie ensuite que l'application du code reduit le total via /api/orders.
 */
export async function seedCoupon(
  tenantId: string,
  opts: { code?: string; discountType?: 'percentage' | 'fixed'; discountValue?: number } = {},
): Promise<SeededCoupon> {
  assertNotProduction();
  const db = getAdmin();
  const code = (opts.code ?? 'JOURNEY10').toUpperCase();
  const discountType = opts.discountType ?? 'percentage';
  const discountValue = opts.discountValue ?? 10;

  const { data, error } = await db
    .from('coupons')
    .insert({
      tenant_id: tenantId,
      code,
      discount_type: discountType,
      discount_value: discountValue,
      is_active: true,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seed coupon echec: ${error?.message}`);

  return { id: data.id, code, discountType, discountValue };
}

/**
 * Insere une commande minimale (cible BOLA pour 08). order_number n'a pas de
 * contrainte d'unicite mais on le rend unique par tenant pour la lisibilite.
 */
export async function seedOrderRow(
  tenantId: string,
  opts: { orderNumber?: string; total?: number } = {},
): Promise<string> {
  assertNotProduction();
  const db = getAdmin();
  const total = opts.total ?? 2500;
  const { data, error } = await db
    .from('orders')
    .insert({
      tenant_id: tenantId,
      order_number: opts.orderNumber ?? `JT-${tenantId.slice(0, 8)}-001`,
      status: 'pending',
      subtotal: total,
      tax: 0,
      total,
      preparation_zone: 'kitchen',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seed order echec: ${error?.message}`);
  return data.id;
}

/**
 * Insere une invitation pending (cible BOLA). invited_by reference admin_users.id.
 */
export async function seedInvitation(
  tenantId: string,
  invitedByAdminId: string,
  opts: { email?: string; role?: 'admin' | 'manager' | 'cashier' | 'chef' | 'waiter' } = {},
): Promise<string> {
  assertNotProduction();
  const db = getAdmin();
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const { data, error } = await db
    .from('invitations')
    .insert({
      tenant_id: tenantId,
      email: opts.email ?? `invitee-${tenantId.slice(0, 8)}@journey.test`,
      role: opts.role ?? 'waiter',
      invited_by: invitedByAdminId,
      token: randomBytes(32).toString('hex'),
      expires_at: expiresAt,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seed invitation echec: ${error?.message}`);
  return data.id;
}

/**
 * Insere une assignation table->serveur (cible BOLA). server_id reference
 * admin_users.id.
 */
export async function seedTableAssignment(
  tenantId: string,
  tableId: string,
  serverAdminId: string,
): Promise<string> {
  assertNotProduction();
  const db = getAdmin();
  const { data, error } = await db
    .from('table_assignments')
    .insert({ tenant_id: tenantId, table_id: tableId, server_id: serverAdminId })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seed table_assignment echec: ${error?.message}`);
  return data.id;
}

export interface InvitationRow {
  id: string;
  status: string | null;
  accepted_at: string | null;
  /** Inclus pour detecter une rotation par resend (le vrai effet, pas le statut). */
  token: string | null;
  expires_at: string | null;
}

/** Lit une invitation (pour verifier qu'une attaque BOLA ne l'a pas modifiee). */
export async function getInvitationRow(invitationId: string): Promise<InvitationRow | null> {
  assertNotProduction();
  const db = getAdmin();
  const { data } = await db
    .from('invitations')
    .select('id, status, accepted_at, token, expires_at')
    .eq('id', invitationId)
    .maybeSingle();
  return (data as InvitationRow | null) ?? null;
}

export interface AssignmentRow {
  id: string;
  ended_at: string | null;
}

/** Lit une assignation (pour verifier qu'une attaque BOLA ne l'a pas terminee). */
export async function getAssignmentRow(assignmentId: string): Promise<AssignmentRow | null> {
  assertNotProduction();
  const db = getAdmin();
  const { data } = await db
    .from('table_assignments')
    .select('id, ended_at')
    .eq('id', assignmentId)
    .maybeSingle();
  return (data as AssignmentRow | null) ?? null;
}

/**
 * Cree un client Supabase NEUF (non singleton) avec realtime, pour s'abonner au MEME
 * CDC postgres_changes que le KDS (parcours 04): channel kds_orders_<tenant>, table
 * orders, filtre tenant_id.
 *
 * NUANCE DE FIDELITE: on s'abonne en service_role (RLS bypass), alors que le KDS reel
 * s'abonne en session authentifiee (RLS-scoped). Ce test prouve donc le PIPELINE CDC
 * (publication + filtre tenant + livraison de l'event), pas l'autorisation RLS de la
 * souscription du KDS - cette derniere est couverte par l'usage prod (useKitchenData).
 * A `removeAllChannels()` + `realtime.disconnect()` en fin de test.
 */
export function newRealtimeClient(): SupabaseClient {
  assertNotProduction();
  if (!hasSeedEnv()) {
    throw new Error('Realtime indisponible: JOURNEY_SUPABASE_URL/SERVICE_ROLE_KEY requis.');
  }
  const client = createClient(journeyEnv.supabaseUrl, journeyEnv.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  // Autorise les postgres_changes en tant que service_role (RLS bypass) -> on recoit
  // tous les events du tenant cible (cf. nuance de fidelite ci-dessus).
  client.realtime.setAuth(journeyEnv.supabaseServiceRoleKey);
  return client;
}

export interface TenantBilling {
  subscription_status: string | null;
  subscription_plan: string | null;
  is_active: boolean | null;
  stripe_customer_id: string | null;
}

/** Lit l'etat de facturation d'un tenant (apres webhook Stripe). */
export async function getTenantBilling(tenantId: string): Promise<TenantBilling | null> {
  assertNotProduction();
  const db = getAdmin();
  const { data } = await db
    .from('tenants')
    .select('subscription_status, subscription_plan, is_active, stripe_customer_id')
    .eq('id', tenantId)
    .maybeSingle();
  return (data as TenantBilling | null) ?? null;
}

/** Met a jour le statut d'une commande (declenche un event CDC vu par le KDS). */
export async function setOrderStatus(
  tenantId: string,
  orderId: string,
  status: string,
): Promise<void> {
  assertNotProduction();
  const db = getAdmin();
  const { error } = await db
    .from('orders')
    .update({ status })
    .eq('id', orderId)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`setOrderStatus echec: ${error.message}`);
}
