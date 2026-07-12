/**
 * ATTABL SaaS - Demo Seed Script (L'Epicurien v3)
 * ================================================
 * Replaces the ENTIRE content of the "lepicurien" demo tenant with the curated
 * "compte-demo-epicurien" dossier: a modern French bistro (prices in XAF) with
 * 10 categories / 51 items (FR/EN, verified local photos), a fully stocked
 * inventory module (suppliers, ingredients, recipes, opening stock, mid-week
 * delivery) and one exact week of POS sales (2026-07-13 -> 2026-07-19) whose
 * resulting stock figures are verified to the digit against the dossier's
 * resultats-attendus.json (stock acceptance tests REQ-STK-01..06).
 *
 * Usage:  npx tsx scripts/seed-demo.ts
 *         DEMO_DIR=/path/to/compte-demo-epicurien npx tsx scripts/seed-demo.ts
 *
 * Prerequisites: all Supabase migrations applied (pnpm db:migrate).
 *
 * Uses the Supabase admin client (service_role key) to bypass RLS. Idempotent:
 * if the tenant "lepicurien" exists, everything (DB rows + storage photos) is
 * wiped and re-seeded from the dossier.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

// ─── ENV LOADING (no dotenv dependency) ────────────────────────────────────
function loadEnv(): Record<string, string> {
  const candidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(__dirname, '..', '.env.local'),
  ];
  for (const envPath of candidates) {
    try {
      const raw = fs.readFileSync(envPath, 'utf8');
      const vars: Record<string, string> = {};
      raw.split('\n').forEach((line) => {
        const m = line.match(/^([^#=][^=]*)=(.*)$/);
        if (m) vars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      });
      console.log(`  Loaded env from ${envPath}`);
      return vars;
    } catch {
      // try next candidate
    }
  }
  return {};
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── DOSSIER (source of truth) ─────────────────────────────────────────────

const DEMO_DIR =
  process.env.DEMO_DIR ||
  '/Users/a.g.i.c/Documents/SAAS Ressources 26/Project App-Saas/Admin Doc/Attabl/Attabl/compte-demo-epicurien';

interface ManifestItem {
  slug: string;
  sort_order: number;
  name_fr: string;
  name_en: string;
  description_fr: string;
  description_en: string;
  price_xaf: number;
  image: string;
  images: string[];
  dietary_flags: string[];
  preparation_time_min: number;
  is_popular: boolean;
  is_featured: boolean;
}
interface ManifestCategory {
  slug: string;
  sort_order: number;
  name_fr: string;
  name_en: string;
  image: string;
  items: ManifestItem[];
}
interface Manifest {
  restaurant: {
    name: string;
    tagline_fr: string;
    tagline_en: string;
    description_fr: string;
    description_en: string;
    currency: string;
  };
  categories: ManifestCategory[];
}
interface SupplierDef {
  slug: string;
  name: string;
  type: string;
}
interface IngredientDef {
  slug: string;
  name_fr: string;
  unit: string;
  cost_xaf_per_unit: number;
  supplier: string;
  opening_stock: number;
  alert_threshold: number;
}
interface RecipeDef {
  item_slug: string;
  components: Array<{ ingredient: string; qty: number }>;
}
interface DeliveryDef {
  date: string;
  supplier: string;
  note: string;
  lines?: Array<{ ingredient: string; qty: number }>;
}
interface Ventes {
  days: string[];
  sales_by_item: Record<string, number[]>;
}
interface ExpectedRow {
  ingredient: string;
  opening: number;
  delivered: number;
  consumed: number;
  closing_theoretical: number;
  physical_count: number;
  variance: number;
}
interface Expected {
  period: { from: string; to: string };
  expected: ExpectedRow[];
  expected_alerts: string[];
  expected_ruptures: string[];
  expected_variances: Record<string, number>;
}

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(DEMO_DIR, rel), 'utf8')) as T;
}

const manifest = readJson<Manifest>('manifest.json');
const suppliersDef = readJson<{ suppliers: SupplierDef[] }>('inventory/suppliers.json').suppliers;
const ingredientsDef = readJson<{ ingredients: IngredientDef[] }>(
  'inventory/ingredients.json',
).ingredients;
const recipesDef = readJson<{ recipes: RecipeDef[] }>('inventory/recipes.json').recipes;
const deliveriesDef = readJson<{ deliveries: DeliveryDef[] }>(
  'inventory/deliveries.json',
).deliveries;
const ventes = readJson<Ventes>('inventory/ventes-7-jours.json');
const expected = readJson<Expected>('inventory/resultats-attendus.json');

const ALL_ITEMS: Array<ManifestItem & { catSlug: string }> = manifest.categories.flatMap((c) =>
  c.items.map((i) => ({ ...i, catSlug: c.slug })),
);
const itemBySlug = new Map(ALL_ITEMS.map((i) => [i.slug, i]));

// Base-unit mapping toward the DB CHECK (kg|L|pièce|cl|g|bouteille). "boite"
// and "fut" are counted as pieces; recipes reference fractional pieces (e.g.
// 0.017 fut per draft beer), consistent with resultats-attendus.json.
const UNIT_PIECE = 'pièce';
const UNIT_MAP: Record<string, string> = {
  kg: 'kg',
  litre: 'L',
  piece: UNIT_PIECE,
  bouteille: 'bouteille',
  boite: UNIT_PIECE,
  fut: UNIT_PIECE,
};

// Ingredient display category, derived from the supplier's trade.
const SUPPLIER_CATEGORY: Record<string, string> = {
  'marche-central': 'Frais',
  'boucherie-du-fleuve': 'Viandes',
  'pecherie-moderne': 'Poissons',
  'sodis-distribution': 'Epicerie',
  'cave-et-brasserie': 'Boissons',
};

// Categories routed to the bar on the KDS; everything else goes to the kitchen.
const BAR_CATEGORIES = new Set(['boissons-fraiches', 'cafes-thes', 'vins-cocktails']);

// ─── STABLE IDs ────────────────────────────────────────────────────────────

const ID = {
  tenant: randomUUID(),
  venue: randomUUID(),
  zoneSalle: randomUUID(),
  zoneTerrasse: randomUUID(),
  menuCarte: randomUUID(),
};

const catId: Record<string, string> = {};
const menuItemId: Record<string, string> = {};
const ingId: Record<string, string> = {};
const supplierId: Record<string, string> = {};
for (const c of manifest.categories) catId[c.slug] = randomUUID();
for (const i of ALL_ITEMS) menuItemId[i.slug] = randomUUID();
for (const ing of ingredientsDef) ingId[ing.slug] = randomUUID();
for (const s of suppliersDef) supplierId[s.slug] = randomUUID();

// ─── DEMO STAFF ────────────────────────────────────────────────────────────

interface StaffMember {
  email: string;
  fullName: string;
  role: string;
  phone: string;
  userId?: string;
  adminUserId?: string;
}

// Shared password for every account (demo only): DemoAttabl2026.
const DEMO_PASSWORD = 'DemoAttabl2026';

const STAFF: StaffMember[] = [
  {
    email: 'owner@demo.attabl.com',
    fullName: 'Amadou Diallo',
    role: 'owner',
    phone: '+235 66 00 00 00',
  },
  {
    email: 'chef@demo.attabl.com',
    fullName: 'Fatime Hassan',
    role: 'chef',
    phone: '+235 66 10 10 10',
  },
  {
    email: 'manager@demo.attabl.com',
    fullName: 'Ousmane Kabore',
    role: 'manager',
    phone: '+235 66 20 20 20',
  },
  {
    email: 'caisse@demo.attabl.com',
    fullName: 'Mariam Toure',
    role: 'cashier',
    phone: '+235 66 30 30 30',
  },
  {
    email: 'serveur1@demo.attabl.com',
    fullName: 'Ali Mahamat',
    role: 'waiter',
    phone: '+235 66 40 40 40',
  },
  {
    email: 'serveur2@demo.attabl.com',
    fullName: 'Aicha Ndiaye',
    role: 'waiter',
    phone: '+235 66 50 50 50',
  },
];

// ─── HELPERS ───────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`  ${msg}`);
}

function logStep(step: number, label: string) {
  const total = 11;
  const filled = Math.max(0, Math.min(total, step));
  console.log(
    `\n[${'='.repeat(filled)}${' '.repeat(total - filled)}] Step ${step}/${total}: ${label}`,
  );
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Local-time Date for a dossier day (YYYY-MM-DD) at hour:minute.
function dayAt(dayStr: string, hour: number, minute: number): Date {
  const [y, m, d] = dayStr.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, randomInt(0, 59), 0);
}

// ─── REQUIRED SCHEMA PROBE ─────────────────────────────────────────────────
// The dossier's acceptance tests need the full stack (menu hierarchy, inventory
// engine, suppliers, payments). Fail fast with a clear message when a table is
// missing instead of seeding a partial demo.
async function assertSchema() {
  const required = [
    'menus',
    'categories',
    'menu_items',
    'ingredients',
    'recipes',
    'stock_movements',
    'suppliers',
    'zones',
    'tables',
    'orders',
    'order_items',
    'payments',
  ];
  const checks = await Promise.all(required.map((t) => supabase.from(t).select('id').limit(0)));
  const missing = required.filter((_, i) => checks[i].error);
  if (missing.length > 0) {
    throw new Error(`Missing tables: ${missing.join(', ')}. Run pnpm db:migrate before seeding.`);
  }
}

// ─── STEP 0: CLEANUP ───────────────────────────────────────────────────────

async function cleanup() {
  logStep(0, 'Cleanup existing "lepicurien" data (DB + storage)');

  const { data: existing } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', 'lepicurien')
    .single();

  // Auth users may exist even if the tenant row was deleted.
  const {
    data: { users },
  } = await supabase.auth.admin.listUsers();
  for (const staff of STAFF) {
    const existingUser = users?.find((u) => u.email === staff.email);
    if (existingUser) {
      await supabase.auth.admin.deleteUser(existingUser.id);
      log(`  Deleted auth user: ${staff.email}`);
    }
  }

  // Purge old photos: the dossier replaces every image (rule: replacement, not
  // merge), so stale files must not survive in the public buckets. Cover images
  // of items live under lepicurien/ and category covers under lepicurien/categories/.
  const purgeFolder = async (bucket: string, folder: string) => {
    const listed = await supabase.storage.from(bucket).list(folder, { limit: 1000 });
    const stale = (listed.data ?? [])
      .filter((f) => f.id !== null) // skip sub-folder pseudo-entries
      .map((f) => `${folder}/${f.name}`);
    if (stale.length > 0) {
      const { error: rmErr } = await supabase.storage.from(bucket).remove(stale);
      if (rmErr) log(`  Warning purging ${bucket}/${folder}: ${rmErr.message}`);
      else log(`  Storage purged: ${stale.length} file(s) from ${bucket}/${folder}`);
    }
  };
  await purgeFolder('menu-items', 'lepicurien/categories');
  await purgeFolder('menu-items', 'lepicurien');

  if (!existing) {
    log('No existing tenant found. Starting fresh.');
    return;
  }

  const tenantId = existing.id;
  log(`Found existing tenant ${tenantId}. Removing all associated data...`);

  // Delete in dependency order (child tables first). Missing tables skip silently.
  const tablesToClean = [
    'stock_count_lines',
    'stock_counts',
    'stock_movements',
    'recipes',
    'item_suggestions',
    'ingredients',
    'suppliers',
    'payments',
    'order_items',
    'table_sessions',
    'orders',
    'coupons',
    'announcements',
    'item_modifiers',
    'menu_items',
    'categories',
    'menus',
    'tables',
    'zones',
    'venues',
    'onboarding_progress',
    'admin_users',
  ];

  for (const table of tablesToClean) {
    const { error } = await supabase.from(table).delete().eq('tenant_id', tenantId);
    if (
      error &&
      !error.message.includes('does not exist') &&
      !error.message.includes('schema cache')
    ) {
      log(`  Warning cleaning ${table}: ${error.message}`);
    }
  }

  const { error: tenantDelError } = await supabase.from('tenants').delete().eq('id', tenantId);
  if (tenantDelError) log(`  Warning deleting tenant: ${tenantDelError.message}`);

  log('Cleanup complete.');
}

// ─── STEP 1: TENANT ────────────────────────────────────────────────────────

async function createTenant() {
  logStep(1, "Create Tenant: L'Epicurien (bistrot francais moderne)");

  // Tax and service charge stay OFF: the dossier's TEST 6 requires weekly
  // revenue == sum(qty x price_xaf) to the franc, so order totals carry no
  // tax/service/tip on top of the subtotal.
  const { data, error } = await supabase
    .from('tenants')
    .insert({
      id: ID.tenant,
      name: manifest.restaurant.name,
      slug: 'lepicurien',
      primary_color: '#1A1A2E',
      secondary_color: '#CCFF00',
      // business unlocks canAccessInventory (pro+), so order destock actually fires.
      subscription_plan: 'business',
      subscription_status: 'active',
      onboarding_completed: true,
      establishment_type: 'restaurant',
      description: manifest.restaurant.description_fr,
      address: "Avenue Charles de Gaulle, N'Djamena",
      city: "N'Djamena",
      country: 'Tchad',
      phone: '+235 66 00 00 00',
      table_count: 18,
      is_active: true,
      currency: manifest.restaurant.currency,
      tax_rate: 0,
      enable_tax: false,
      service_charge_rate: 0,
      enable_service_charge: false,
    })
    .select()
    .single();

  if (error) throw new Error(`Tenant creation failed: ${error.message}`);
  log(`Tenant created: ${data.id} (${data.slug})`);
}

// ─── STEP 2: USERS ─────────────────────────────────────────────────────────

async function createUsers() {
  logStep(2, 'Create Auth Users + Admin Users');

  for (const staff of STAFF) {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: staff.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: staff.fullName, restaurant_name: manifest.restaurant.name },
    });
    if (authError) throw new Error(`Auth user ${staff.email} failed: ${authError.message}`);
    staff.userId = authData.user.id;

    const adminUserId = randomUUID();
    staff.adminUserId = adminUserId;
    const { error: adminError } = await supabase.from('admin_users').insert({
      id: adminUserId,
      user_id: staff.userId,
      tenant_id: ID.tenant,
      email: staff.email,
      full_name: staff.fullName,
      phone: staff.phone,
      role: staff.role,
      is_active: true,
      is_super_admin: false,
    });
    if (adminError) throw new Error(`Admin user ${staff.email} failed: ${adminError.message}`);
    log(`User created: ${staff.email} (${staff.role})`);
  }
}

// ─── STEP 3: VENUE, ZONES & TABLES 1-18 ────────────────────────────────────

async function createVenueZonesTables() {
  logStep(3, 'Create Venue, Zones & Tables 1-18');

  const { error: venueError } = await supabase.from('venues').insert({
    id: ID.venue,
    tenant_id: ID.tenant,
    name: 'Salle Principale',
    name_en: 'Main Dining Hall',
    slug: 'salle-principale',
    type: 'restaurant',
    is_active: true,
  });
  if (venueError) throw new Error(`Venue creation failed: ${venueError.message}`);

  const { error: zoneError } = await supabase.from('zones').insert([
    {
      id: ID.zoneSalle,
      venue_id: ID.venue,
      tenant_id: ID.tenant,
      name: 'Salle',
      name_en: 'Main Room',
      prefix: 'S',
      description: 'Salle du bistrot',
      display_order: 0,
    },
    {
      id: ID.zoneTerrasse,
      venue_id: ID.venue,
      tenant_id: ID.tenant,
      name: 'Terrasse',
      name_en: 'Terrace',
      prefix: 'T',
      description: 'Terrasse exterieure',
      display_order: 1,
    },
  ]);
  if (zoneError) throw new Error(`Zones creation failed: ${zoneError.message}`);

  // Plain table numbers 1..18 (sales protocol assigns orders to tables 1-18).
  const capacities = [2, 2, 2, 4, 4, 4, 4, 6, 6, 8, 2, 2, 4, 4, 4, 6, 6, 8];
  const tables = capacities.map((capacity, idx) => {
    const n = idx + 1;
    return {
      id: randomUUID(),
      zone_id: n <= 10 ? ID.zoneSalle : ID.zoneTerrasse,
      tenant_id: ID.tenant,
      table_number: String(n),
      display_name: n <= 10 ? `Salle ${n}` : `Terrasse ${n}`,
      capacity,
      is_active: true,
    };
  });
  const { error: tableError } = await supabase.from('tables').insert(tables);
  if (tableError) throw new Error(`Tables creation failed: ${tableError.message}`);
  log(`Venue + 2 zones + ${tables.length} tables created`);
}

// ─── STEP 4: MENU, CATEGORIES & ITEMS ──────────────────────────────────────

async function createMenu() {
  logStep(4, 'Create Menu, 10 Categories & 51 Items');

  const { error: menuError } = await supabase.from('menus').insert({
    id: ID.menuCarte,
    tenant_id: ID.tenant,
    venue_id: ID.venue,
    name: 'La Carte',
    name_en: 'The Menu',
    slug: 'carte-principale',
    description: manifest.restaurant.tagline_fr,
    description_en: manifest.restaurant.tagline_en,
    is_active: true,
    display_order: 0,
  });
  if (menuError) throw new Error(`Menu creation failed: ${menuError.message}`);

  const categoryRows = manifest.categories.map((c) => ({
    id: catId[c.slug],
    tenant_id: ID.tenant,
    menu_id: ID.menuCarte,
    name: c.name_fr,
    name_en: c.name_en,
    display_order: c.sort_order,
    is_active: true,
    preparation_zone: BAR_CATEGORIES.has(c.slug) ? 'bar' : 'kitchen',
  }));
  const { error: catError } = await supabase.from('categories').insert(categoryRows);
  if (catError) throw new Error(`Categories creation failed: ${catError.message}`);

  const itemRows = ALL_ITEMS.map((item) => ({
    id: menuItemId[item.slug],
    tenant_id: ID.tenant,
    category_id: catId[item.catSlug],
    name: item.name_fr,
    name_en: item.name_en,
    description: item.description_fr,
    description_en: item.description_en,
    price: item.price_xaf,
    is_available: true,
    is_featured: item.is_featured || item.is_popular,
    is_vegetarian:
      item.dietary_flags.includes('vegetarian') || item.dietary_flags.includes('vegan'),
    is_spicy: item.dietary_flags.includes('spicy'),
    allergens: [],
  }));
  const { error: itemError } = await supabase.from('menu_items').insert(itemRows);
  if (itemError) throw new Error(`Menu items creation failed: ${itemError.message}`);
  log(`Menu + ${categoryRows.length} categories + ${itemRows.length} items created`);
}

// ─── STEP 5: UPLOAD MEDIA (local dossier -> storage) ──────────────────────
// Item galleries (primary + variants) and the category covers. Every file lives
// in the dossier - a missing file is a hard fail.

// Upload one local dossier file to a bucket path and return its public URL.
async function uploadFile(bucket: string, relPath: string, storagePath: string): Promise<string> {
  const buf = fs.readFileSync(path.join(DEMO_DIR, relPath));
  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`Upload failed for ${relPath}: ${error.message}`);
  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}

async function uploadMedia() {
  logStep(5, 'Upload media (item galleries, category covers)');

  // Item galleries: main photo (slug.jpg) + variants (slug-2.jpg ...). The main
  // photo goes to image_url, the full ordered list to images.
  let items = 0;
  let variants = 0;
  for (const item of ALL_ITEMS) {
    const urls: string[] = [];
    for (let i = 0; i < item.images.length; i++) {
      const suffix = i === 0 ? '' : `-${i + 1}`;
      urls.push(
        await uploadFile('menu-items', item.images[i], `lepicurien/${item.slug}${suffix}.jpg`),
      );
      if (i > 0) variants++;
    }
    const primary = urls[0] ?? null;
    const { error: updErr } = await supabase
      .from('menu_items')
      .update({
        image_url: primary,
        images: urls,
        image_source: 'import',
        image_uploaded_at: new Date().toISOString(),
      })
      .eq('id', menuItemId[item.slug])
      .eq('tenant_id', ID.tenant);
    if (updErr) throw new Error(`Photo DB update failed for ${item.slug}: ${updErr.message}`);
    items++;
  }
  log(`Item photos uploaded: ${items} items (+${variants} gallery variants)`);

  // Category covers.
  let covers = 0;
  for (const cat of manifest.categories) {
    const coverUrl = await uploadFile(
      'menu-items',
      cat.image,
      `lepicurien/categories/${cat.slug}.jpg`,
    );
    const { error: catErr } = await supabase
      .from('categories')
      .update({ image_url: coverUrl })
      .eq('id', catId[cat.slug])
      .eq('tenant_id', ID.tenant);
    if (catErr) throw new Error(`Category cover update failed for ${cat.slug}: ${catErr.message}`);
    covers++;
  }
  log(`Category covers uploaded: ${covers}`);
}

// ─── STEP 6: SUPPLIERS, INGREDIENTS, RECIPES & OPENING STOCK ───────────────

async function createInventory() {
  logStep(6, 'Create Suppliers, Ingredients, Recipes & Opening Stock');

  const owner = STAFF.find((s) => s.role === 'owner');

  const supplierRows = suppliersDef.map((s) => ({
    id: supplierId[s.slug],
    tenant_id: ID.tenant,
    name: s.name,
    notes: s.type,
    is_active: true,
  }));
  const { error: supError } = await supabase.from('suppliers').insert(supplierRows);
  if (supError) throw new Error(`Suppliers creation failed: ${supError.message}`);
  log(`Suppliers created: ${supplierRows.length}`);

  // Ingredients start at 0 stock; the opening quantity is booked through the
  // canonical set_opening_stock RPC so SUM(stock_movements) == current_stock.
  const ingredientRows = ingredientsDef.map((ing) => {
    const unit = UNIT_MAP[ing.unit];
    if (!unit) throw new Error(`Unknown unit "${ing.unit}" for ${ing.slug}`);
    return {
      id: ingId[ing.slug],
      tenant_id: ID.tenant,
      name: ing.name_fr,
      unit,
      current_stock: 0,
      min_stock_alert: ing.alert_threshold,
      cost_per_unit: ing.cost_xaf_per_unit,
      category: SUPPLIER_CATEGORY[ing.supplier] ?? 'Divers',
      is_active: true,
    };
  });
  const { error: ingError } = await supabase.from('ingredients').insert(ingredientRows);
  if (ingError) throw new Error(`Ingredients creation failed: ${ingError.message}`);
  log(`Ingredients created: ${ingredientRows.length}`);

  const recipeRows = recipesDef.flatMap((r) => {
    if (!menuItemId[r.item_slug]) throw new Error(`Recipe for unknown item: ${r.item_slug}`);
    return r.components.map((c) => {
      if (!ingId[c.ingredient]) {
        throw new Error(`Recipe ${r.item_slug} uses unknown ingredient: ${c.ingredient}`);
      }
      return {
        id: randomUUID(),
        tenant_id: ID.tenant,
        menu_item_id: menuItemId[r.item_slug],
        ingredient_id: ingId[c.ingredient],
        quantity_needed: c.qty,
      };
    });
  });
  const { error: recipeError } = await supabase.from('recipes').insert(recipeRows);
  if (recipeError) throw new Error(`Recipes creation failed: ${recipeError.message}`);
  log(`Recipe lines created: ${recipeRows.length} (${recipesDef.length} fiches)`);

  for (const ing of ingredientsDef) {
    const { error } = await supabase.rpc('set_opening_stock', {
      p_tenant_id: ID.tenant,
      p_ingredient_id: ingId[ing.slug],
      p_quantity: ing.opening_stock,
      p_created_by: owner?.userId ?? undefined,
    });
    if (error) throw new Error(`Opening stock for ${ing.slug} failed: ${error.message}`);
  }

  // Backdate the opening movements to the dossier's day 0 (before service) so
  // the stock history reads correctly day by day (REQ-STK-04).
  const openingAt = dayAt(expected.period.from, 6, 0).toISOString();
  const { error: bdError } = await supabase
    .from('stock_movements')
    .update({ created_at: openingAt })
    .eq('tenant_id', ID.tenant)
    .eq('movement_type', 'opening');
  if (bdError) throw new Error(`Backdating opening movements failed: ${bdError.message}`);
  log(`Opening stock booked for ${ingredientsDef.length} ingredients (dated ${openingAt})`);
}

// ─── STEP 7: SALES WEEK -> POS ORDERS ──────────────────────────────────────
// Turns ventes-7-jours.json (exact daily quantity per item) into paid dine-in
// orders. Daily per-item totals are preserved EXACTLY (dossier golden rule);
// the split into orders/services/tables is free.

interface SeededOrder {
  id: string;
  createdAt: Date;
  dayIdx: number;
}

async function createSalesOrders(): Promise<SeededOrder[]> {
  logStep(7, 'Create one week of POS orders (exact quantities)');

  const cashier = STAFF.find((s) => s.role === 'cashier');
  const paymentMethods: Array<'cash' | 'card' | 'wave'> = ['cash', 'cash', 'card', 'wave'];

  const allOrders: Array<Record<string, unknown>> = [];
  const allOrderItems: Array<Record<string, unknown>> = [];
  const allPayments: Array<Record<string, unknown>> = [];
  const refs: SeededOrder[] = [];

  ventes.days.forEach((dayStr, dayIdx) => {
    // Explode the day's per-item quantities into order lines of 1-2 units.
    const lines: Array<{ slug: string; qty: number }> = [];
    for (const [slug, perDay] of Object.entries(ventes.sales_by_item)) {
      if (!itemBySlug.has(slug)) throw new Error(`Sales reference unknown item: ${slug}`);
      let remaining = perDay[dayIdx] ?? 0;
      while (remaining > 0) {
        const chunk = Math.min(remaining, randomInt(1, 2));
        lines.push({ slug, qty: chunk });
        remaining -= chunk;
      }
    }

    // Group shuffled lines into orders of 1-4 lines.
    const shuffled = shuffle(lines);
    const groups: Array<Array<{ slug: string; qty: number }>> = [];
    for (let i = 0; i < shuffled.length; ) {
      const n = randomInt(1, 4);
      groups.push(shuffled.slice(i, i + n));
      i += n;
    }

    groups.forEach((group, gIdx) => {
      const orderId = randomUUID();
      const isLunch = gIdx % 2 === 0;
      const orderTime = isLunch
        ? dayAt(dayStr, randomInt(12, 14), randomInt(0, 59))
        : dayAt(dayStr, randomInt(19, 21), randomInt(0, 59));
      const paidAt = new Date(orderTime.getTime() + randomInt(30, 80) * 60_000);
      const paymentMethod = randomPick(paymentMethods);

      let subtotal = 0;
      for (const line of group) {
        const item = itemBySlug.get(line.slug)!;
        subtotal += item.price_xaf * line.qty;
        allOrderItems.push({
          id: randomUUID(),
          order_id: orderId,
          menu_item_id: menuItemId[line.slug],
          item_name: item.name_fr,
          item_name_en: item.name_en,
          quantity: line.qty,
          price_at_order: item.price_xaf,
          item_status: 'served',
          modifiers: [],
        });
      }

      const dateCompact = dayStr.replace(/-/g, '');
      allOrders.push({
        id: orderId,
        tenant_id: ID.tenant,
        order_number: `CMD-${dateCompact}-${String(gIdx + 1).padStart(3, '0')}`,
        table_number: String(randomInt(1, 18)),
        status: 'delivered',
        service_type: 'dine_in',
        subtotal,
        tax_amount: 0,
        service_charge_amount: 0,
        discount_amount: 0,
        tip_amount: 0,
        total: subtotal,
        payment_method: paymentMethod,
        payment_status: 'paid',
        paid_at: paidAt.toISOString(),
        created_at: orderTime.toISOString(),
      });
      allPayments.push({
        id: randomUUID(),
        tenant_id: ID.tenant,
        order_id: orderId,
        amount: subtotal,
        method: paymentMethod,
        status: 'completed',
        created_by: cashier?.adminUserId ?? null,
        created_at: paidAt.toISOString(),
      });
      refs.push({ id: orderId, createdAt: orderTime, dayIdx });
    });
  });

  const BATCH_SIZE = 100;
  for (let i = 0; i < allOrders.length; i += BATCH_SIZE) {
    const { error } = await supabase.from('orders').insert(allOrders.slice(i, i + BATCH_SIZE));
    if (error) throw new Error(`Orders batch ${i} failed: ${error.message}`);
  }
  for (let i = 0; i < allOrderItems.length; i += BATCH_SIZE) {
    const { error } = await supabase
      .from('order_items')
      .insert(allOrderItems.slice(i, i + BATCH_SIZE));
    if (error) throw new Error(`Order items batch ${i} failed: ${error.message}`);
  }
  for (let i = 0; i < allPayments.length; i += BATCH_SIZE) {
    const { error } = await supabase.from('payments').insert(allPayments.slice(i, i + BATCH_SIZE));
    if (error) throw new Error(`Payments batch ${i} failed: ${error.message}`);
  }
  log(
    `Orders created: ${allOrders.length} (${allOrderItems.length} lines, ${allPayments.length} payments)`,
  );
  return refs;
}

// ─── STEP 8: CHRONOLOGICAL DESTOCK + MID-WEEK DELIVERY ─────────────────────
// destock_order enforces current_stock >= required, so the ledger must be
// replayed in real chronology: opening -> sales before the delivery date ->
// delivery entry -> remaining sales. Every RPC stamps created_at = now(), so
// each movement is backdated right after booking (the ledger invariant
// SUM(quantity) == current_stock is date-independent).

async function destockChronological(refs: SeededOrder[]) {
  logStep(8, 'Replay stock ledger chronologically (destock + delivery)');

  const chef = STAFF.find((s) => s.role === 'chef');
  const manager = STAFF.find((s) => s.role === 'manager');
  const delivery = deliveriesDef.find((d) => d.lines && d.lines.length > 0);
  const deliveryDayIdx = delivery ? ventes.days.indexOf(delivery.date) : -1;

  const ordered = [...refs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let destocked = 0;
  let deliveryBooked = false;

  const bookDelivery = async () => {
    if (!delivery?.lines) return;
    const supplierBySlug = new Map(ingredientsDef.map((i) => [i.slug, i.supplier]));
    for (const line of delivery.lines) {
      const { error } = await supabase.rpc('adjust_ingredient_stock_tx', {
        p_tenant_id: ID.tenant,
        p_ingredient_id: ingId[line.ingredient],
        p_delta: line.qty,
        p_movement_type: 'manual_add',
        p_notes: `Livraison ${delivery.date} - ${delivery.note}`,
        p_created_by: manager?.userId ?? undefined,
        p_supplier_id: supplierId[supplierBySlug.get(line.ingredient) ?? ''] ?? null,
      });
      if (error) throw new Error(`Delivery line ${line.ingredient} failed: ${error.message}`);
    }
    const deliveredAt = dayAt(delivery.date, 9, 30).toISOString();
    const { error: bdErr } = await supabase
      .from('stock_movements')
      .update({ created_at: deliveredAt })
      .eq('tenant_id', ID.tenant)
      .eq('movement_type', 'manual_add');
    if (bdErr) throw new Error(`Backdating delivery failed: ${bdErr.message}`);
    deliveryBooked = true;
    log(`Delivery booked: ${delivery.lines.length} lines (dated ${deliveredAt})`);
  };

  for (const ref of ordered) {
    // The delivery arrives in the morning of its day, before that day's sales.
    if (!deliveryBooked && deliveryDayIdx >= 0 && ref.dayIdx >= deliveryDayIdx) {
      await bookDelivery();
    }
    const { error } = await supabase.rpc('destock_order', {
      p_order_id: ref.id,
      p_tenant_id: ID.tenant,
      p_created_by: chef?.userId ?? undefined,
    });
    if (error) throw new Error(`Destock ${ref.id} failed: ${error.message}`);
    const { error: bdErr } = await supabase
      .from('stock_movements')
      .update({ created_at: ref.createdAt.toISOString() })
      .eq('tenant_id', ID.tenant)
      .eq('movement_type', 'order_destock')
      .eq('reference_id', ref.id);
    if (bdErr) throw new Error(`Backdating destock ${ref.id} failed: ${bdErr.message}`);
    destocked++;
  }
  if (!deliveryBooked) await bookDelivery();
  log(`Orders destocked: ${destocked} (each movement dated to its order)`);
}

// ─── STEP 9: VERIFY AGAINST resultats-attendus.json ────────────────────────
// Dossier golden rule: a single figure off means the injection (or the stock
// engine) is wrong - fail hard, never adjust the expected data.

async function verifyExpected() {
  logStep(9, 'Verify stock + revenue against resultats-attendus.json');

  const failures: string[] = [];
  const EPS = 0.005;

  // Current stock, alerts and item availability.
  const { data: ingRows, error: ingErr } = await supabase
    .from('ingredients')
    .select('id, name, current_stock, min_stock_alert')
    .eq('tenant_id', ID.tenant);
  if (ingErr) throw new Error(`Verify: ingredients fetch failed: ${ingErr.message}`);
  const stockById = new Map(
    (ingRows ?? []).map((r) => [
      r.id as string,
      { stock: Number(r.current_stock), min: Number(r.min_stock_alert), name: r.name as string },
    ]),
  );

  // Ledger movements (paged) for consumed/delivered per ingredient.
  const consumed = new Map<string, number>();
  const delivered = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data: mv, error: mvErr } = await supabase
      .from('stock_movements')
      .select('ingredient_id, movement_type, quantity')
      .eq('tenant_id', ID.tenant)
      .range(from, from + 999);
    if (mvErr) throw new Error(`Verify: movements fetch failed: ${mvErr.message}`);
    for (const m of mv ?? []) {
      const q = Number(m.quantity);
      if (m.movement_type === 'order_destock') {
        consumed.set(m.ingredient_id, (consumed.get(m.ingredient_id) ?? 0) - q);
      } else if (m.movement_type === 'manual_add') {
        delivered.set(m.ingredient_id, (delivered.get(m.ingredient_id) ?? 0) + q);
      }
    }
    if (!mv || mv.length < 1000) break;
  }

  for (const row of expected.expected) {
    const id = ingId[row.ingredient];
    const live = stockById.get(id);
    if (!live) {
      failures.push(`${row.ingredient}: missing in DB`);
      continue;
    }
    if (Math.abs(live.stock - row.closing_theoretical) > EPS) {
      failures.push(
        `${row.ingredient}: closing ${live.stock} != expected ${row.closing_theoretical}`,
      );
    }
    if (Math.abs((consumed.get(id) ?? 0) - row.consumed) > EPS) {
      failures.push(
        `${row.ingredient}: consumed ${consumed.get(id) ?? 0} != expected ${row.consumed}`,
      );
    }
    if (Math.abs((delivered.get(id) ?? 0) - row.delivered) > EPS) {
      failures.push(
        `${row.ingredient}: delivered ${delivered.get(id) ?? 0} != expected ${row.delivered}`,
      );
    }
  }

  // Low-stock alert set (is_low = stock <= min && min > 0).
  const lowNow = new Set(
    ingredientsDef
      .filter((ing) => {
        const live = stockById.get(ingId[ing.slug]);
        return live && live.min > 0 && live.stock <= live.min + EPS;
      })
      .map((ing) => ing.slug),
  );
  const expectedLow = new Set(expected.expected_alerts);
  for (const slug of expectedLow) {
    if (!lowNow.has(slug)) failures.push(`alert missing: ${slug} should be low-stock`);
  }
  for (const slug of lowNow) {
    if (!expectedLow.has(slug) && !expected.expected_ruptures.includes(slug)) {
      failures.push(`unexpected low-stock alert: ${slug}`);
    }
  }

  // Ruptures: ingredient at 0 and every menu item using it flipped unavailable.
  for (const slug of expected.expected_ruptures) {
    const live = stockById.get(ingId[slug]);
    if (!live || Math.abs(live.stock) > EPS) {
      failures.push(`rupture: ${slug} stock ${live?.stock ?? 'n/a'} != 0`);
    }
  }
  const ruptureIngIds = expected.expected_ruptures.map((s) => ingId[s]);
  if (ruptureIngIds.length > 0) {
    const { data: ruptureRecipes } = await supabase
      .from('recipes')
      .select('menu_item_id, ingredient_id')
      .eq('tenant_id', ID.tenant)
      .in('ingredient_id', ruptureIngIds);
    const itemIds = [...new Set((ruptureRecipes ?? []).map((r) => r.menu_item_id as string))];
    const { data: ruptureItems } = await supabase
      .from('menu_items')
      .select('name, is_available')
      .eq('tenant_id', ID.tenant)
      .in('id', itemIds);
    for (const it of ruptureItems ?? []) {
      if (it.is_available) failures.push(`rupture item still available: ${it.name}`);
    }
  }

  // Revenue: DB totals == sum(qty x price_xaf) from the dossier, and the total
  // sold quantity matches the sales matrix.
  let expectedRevenue = 0;
  let expectedQty = 0;
  for (const [slug, perDay] of Object.entries(ventes.sales_by_item)) {
    const weekQty = perDay.reduce((a, b) => a + b, 0);
    expectedQty += weekQty;
    expectedRevenue += weekQty * (itemBySlug.get(slug)?.price_xaf ?? 0);
  }
  const sumColumn = async (table: string, column: string, paidOnly: boolean) => {
    let total = 0;
    for (let from = 0; ; from += 1000) {
      let q = supabase.from(table).select(column).eq('tenant_id', ID.tenant);
      if (paidOnly) q = q.eq('payment_status', 'paid');
      const { data, error } = await q.range(from, from + 999);
      if (error) throw new Error(`Verify: ${table}.${column} fetch failed: ${error.message}`);
      for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
        total += Number(row[column]);
      }
      if (!data || data.length < 1000) break;
    }
    return total;
  };
  const dbRevenue = await sumColumn('orders', 'total', true);
  if (dbRevenue !== expectedRevenue) {
    failures.push(`revenue: DB ${dbRevenue} != expected ${expectedRevenue}`);
  }
  const dbQty = await sumColumn('order_items', 'quantity', false);
  if (dbQty !== expectedQty) failures.push(`sold quantity: DB ${dbQty} != expected ${expectedQty}`);

  // Ledger invariant: SUM(movements) == current_stock for every ingredient.
  const { data: drift, error: driftErr } = await supabase.rpc('verify_stock_ledger', {
    p_tenant_id: ID.tenant,
  });
  if (driftErr) throw new Error(`Verify: verify_stock_ledger failed: ${driftErr.message}`);
  for (const d of (drift ?? []) as Array<{ name: string; drift: number }>) {
    if (Math.abs(Number(d.drift)) > EPS) failures.push(`ledger drift: ${d.name} = ${d.drift}`);
  }

  if (failures.length > 0) {
    console.error(`\n  VERIFICATION FAILED (${failures.length} mismatch(es)):`);
    for (const f of failures) console.error(`   - ${f}`);
    throw new Error('Seed verification against resultats-attendus.json failed');
  }
  log(
    `All checks PASS: ${expected.expected.length} SKUs, revenue ${expectedRevenue} XAF, ${expectedQty} units sold`,
  );
}

// ─── STEP 10: SUMMARY ──────────────────────────────────────────────────────

function printSummary() {
  logStep(10, 'Summary');
  log(`Tenant:   L'Epicurien (lepicurien) - bistrot francais moderne`);
  log(
    `Menu:     ${manifest.categories.length} categories, ${ALL_ITEMS.length} items (photos locales)`,
  );
  log(
    `Stock:    ${ingredientsDef.length} ingredients, ${recipesDef.length} fiches, ${suppliersDef.length} fournisseurs`,
  );
  log(`Ventes:   ${ventes.days[0]} -> ${ventes.days[6]} (exactes, verifiees)`);
  log('');
  log('Comptes demo (mdp DemoAttabl2026):');
  for (const s of STAFF) log(`  ${s.email} (${s.role})`);
  log('');
  log('TEST 5 (inventaire physique du 2026-07-20) - a saisir en UI le jour J:');
  const variances = expected.expected_variances;
  for (const row of expected.expected) {
    if (variances[row.ingredient] !== undefined) {
      log(
        `  ${row.ingredient}: compter ${row.physical_count} (theorique ${row.closing_theoretical}, ecart ${variances[row.ingredient]})`,
      );
    }
  }
  log('Les autres SKUs se comptent egaux au theorique (voir resultats-attendus.json).');
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("\nATTABL - Seed demo L'Epicurien v3 (dossier compte-demo-epicurien)");
  console.log(`  Dossier: ${DEMO_DIR}`);
  console.log(`  Target:  ${SUPABASE_URL}`);

  await assertSchema();
  await cleanup();
  await createTenant();
  await createUsers();
  await createVenueZonesTables();
  await createMenu();
  await uploadMedia();
  await createInventory();
  const refs = await createSalesOrders();
  await destockChronological(refs);
  await verifyExpected();
  printSummary();

  console.log('\nSeed complete.\n');
}

main().catch((e) => {
  console.error(`\nSeed failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
