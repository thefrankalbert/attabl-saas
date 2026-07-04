/**
 * ATTABL SaaS - Demo Seed Script
 * ================================
 * Populates the database with comprehensive demo data for "L'Epicurien",
 * a complete African restaurant in N'Djamena, Chad (grillades, poissons
 * braises, sauces, jus naturels), with real menu photos pulled from
 * Wikimedia Commons and uploaded to the "menu-items" storage bucket.
 *
 * Usage:  npx tsx scripts/seed-demo.ts
 *
 * Prerequisites:
 *   All Supabase migrations in /supabase/migrations/ must be applied first:
 *     pnpm db:migrate   (or: supabase db push)
 *
 * This script uses the Supabase admin client (service_role key) to bypass RLS.
 * It is idempotent: if the tenant "lepicurien" exists, everything is wiped and re-seeded.
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
    path.resolve('/Users/a.g.i.c/Documents/attabl-saas-landing-copy/.env.local'),
  ];

  for (const envPath of candidates) {
    try {
      const raw = fs.readFileSync(envPath, 'utf8');
      const vars: Record<string, string> = {};
      raw.split('\n').forEach((line) => {
        const m = line.match(/^([^#=][^=]*)=(.*)$/);
        if (m) {
          vars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
        }
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

// Minimum paid revenue (last 30 days) the seed must produce. The self-check at
// the end of main() throws if the demo tenant falls below this floor.
const MONTHLY_REVENUE_FLOOR = 500_000;

// ─── MIGRATION DETECTION ─────────────────────────────────────────────────
// Detect which migrations have been applied to adapt seed data accordingly.

interface MigrationStatus {
  hasProductionUpgrade: boolean; // 20260210: coupons table exists
  hasMenuHierarchy: boolean; // 20260211: menus table, menu_id on categories
  hasInventoryEngine: boolean; // 20260212: ingredients, recipes, stock_movements
  hasSuppliers: boolean; // 20260215: suppliers table
  hasZones: boolean; // base: zones table (may not exist)
  hasTables: boolean; // base: tables table (may not exist)
  hasAnnouncements: boolean; // base: announcements table (may not exist)
  hasPayments: boolean; // 20260629000700: payments ledger table
  hasTableSessions: boolean; // 20260629000600: table_sessions table
  hasStockCounts: boolean; // 20260703000000: physical stock count tables
  // Column-level detection for orders (partially applied migrations)
  orderColumns: Set<string>; // which production_upgrade columns exist on orders
  orderItemColumns: Set<string>; // which production_upgrade columns exist on order_items
  categoryColumns: Set<string>; // optional columns on categories (is_active, preparation_zone)
  menuItemColumns: Set<string>; // optional columns on menu_items (allergens, image_url, ...)
}

let migrations: MigrationStatus = {
  hasProductionUpgrade: false,
  hasMenuHierarchy: false,
  hasInventoryEngine: false,
  hasSuppliers: false,
  hasZones: false,
  hasTables: false,
  hasAnnouncements: false,
  hasPayments: false,
  hasTableSessions: false,
  hasStockCounts: false,
  orderColumns: new Set(),
  orderItemColumns: new Set(),
  categoryColumns: new Set(),
  menuItemColumns: new Set(),
};

async function detectMigrations(): Promise<MigrationStatus> {
  console.log('\n  Detecting applied migrations...');

  // Table-level checks
  const tableChecks = await Promise.all([
    supabase.from('coupons').select('id').limit(0),
    supabase.from('menus').select('id').limit(0),
    supabase.from('ingredients').select('id').limit(0),
    supabase.from('suppliers').select('id').limit(0),
    supabase.from('zones').select('id').limit(0),
    supabase.from('tables').select('id').limit(0),
    supabase.from('announcements').select('id').limit(0),
    supabase.from('payments').select('id').limit(0),
    supabase.from('table_sessions').select('id').limit(0),
    supabase.from('stock_counts').select('id').limit(0),
  ]);

  // Column-level checks for orders (production_upgrade columns)
  const orderColNames = [
    'subtotal',
    'tax_amount',
    'service_charge_amount',
    'discount_amount',
    'service_type',
    'payment_method',
    'payment_status',
    'paid_at',
    'delivery_address',
    'room_number',
    'coupon_id',
    'tip_amount',
    'session_id',
  ];
  const orderColChecks = await Promise.all(
    orderColNames.map((col) => supabase.from('orders').select(col).limit(0)),
  );
  const orderColumns = new Set<string>();
  orderColNames.forEach((col, i) => {
    if (!orderColChecks[i].error) orderColumns.add(col);
  });

  // Column-level checks for order_items (base + production_upgrade columns)
  const itemColNames = [
    'notes',
    'item_name_en',
    'customer_notes',
    'item_status',
    'course',
    'modifiers',
  ];
  const itemColChecks = await Promise.all(
    itemColNames.map((col) => supabase.from('order_items').select(col).limit(0)),
  );
  const orderItemColumns = new Set<string>();
  itemColNames.forEach((col, i) => {
    if (!itemColChecks[i].error) orderItemColumns.add(col);
  });

  // Optional columns on categories (KDS zone routing, active flag).
  const catColNames = ['is_active', 'preparation_zone'];
  const catColChecks = await Promise.all(
    catColNames.map((col) => supabase.from('categories').select(col).limit(0)),
  );
  const categoryColumns = new Set<string>();
  catColNames.forEach((col, i) => {
    if (!catColChecks[i].error) categoryColumns.add(col);
  });

  // Optional columns on menu_items (dietary flags, allergens, photo columns).
  const menuItemColNames = [
    'allergens',
    'is_vegetarian',
    'is_spicy',
    'image_url',
    'image_source',
    'image_uploaded_at',
  ];
  const menuItemColChecks = await Promise.all(
    menuItemColNames.map((col) => supabase.from('menu_items').select(col).limit(0)),
  );
  const menuItemColumns = new Set<string>();
  menuItemColNames.forEach((col, i) => {
    if (!menuItemColChecks[i].error) menuItemColumns.add(col);
  });

  const status: MigrationStatus = {
    hasProductionUpgrade: !tableChecks[0].error,
    hasMenuHierarchy: !tableChecks[1].error,
    hasInventoryEngine: !tableChecks[2].error,
    hasSuppliers: !tableChecks[3].error,
    hasZones: !tableChecks[4].error,
    hasTables: !tableChecks[5].error,
    hasAnnouncements: !tableChecks[6].error,
    hasPayments: !tableChecks[7].error,
    hasTableSessions: !tableChecks[8].error,
    hasStockCounts: !tableChecks[9].error,
    orderColumns,
    orderItemColumns,
    categoryColumns,
    menuItemColumns,
  };

  log(`Order columns available: ${[...orderColumns].join(', ') || 'base only'}`);
  log(`Order item columns available: ${[...orderItemColumns].join(', ') || 'base only'}`);
  log(`Menu item columns available: ${[...menuItemColumns].join(', ') || 'base only'}`);

  // Log table/migration status (exclude Set fields)
  const setFields = new Set([
    'orderColumns',
    'orderItemColumns',
    'categoryColumns',
    'menuItemColumns',
  ]);
  const boolEntries = Object.entries(status).filter(([k]) => !setFields.has(k));
  const applied = boolEntries.filter(([, v]) => v === true).map(([k]) => k);
  const missing = boolEntries.filter(([, v]) => v === false).map(([k]) => k);

  if (applied.length > 0) {
    log(`Tables/Migrations detected: ${applied.join(', ')}`);
  }
  if (missing.length > 0) {
    log(`Tables/Migrations NOT available (skipping related data): ${missing.join(', ')}`);
    log('To include all data, run: pnpm db:migrate (or: supabase db push)');
  }

  return status;
}

// ─── CONSISTENT UUIDs ──────────────────────────────────────────────────────
// Stable IDs for singleton-ish entities. Categories, menu items and ingredients
// get their IDs from slug/key maps (catId/itemId/ingId), built next to the
// African menu data below.
const ID = {
  tenant: randomUUID(),
  venue: randomUUID(),
  // Zones
  zoneTerrasse: randomUUID(),
  zoneSalle: randomUUID(),
  zoneVIP: randomUUID(),
  // Menu (single African "La Carte")
  menuCarte: randomUUID(),
  // Suppliers
  supplierBoucherie: randomUUID(),
  supplierMaree: randomUUID(),
  supplierMarche: randomUUID(),
  supplierBoissons: randomUUID(),
  // Coupons
  couponBienvenue: randomUUID(),
  couponEpicurien: randomUUID(),
  // Announcements
  annVendredi: randomUUID(),
  annDecouverte: randomUUID(),
};

// Tables will be generated dynamically
const tableIds: Record<string, string> = {};

// ─── AUTH USER IDs (generated at creation time) ────────────────────────────
interface StaffMember {
  email: string;
  password: string;
  fullName: string;
  role: string;
  phone: string;
  isSuperAdmin: boolean;
  userId?: string;
  adminUserId?: string;
}

// Demo staff identity. Kept in sync with the client-facing documentation.
// NONE is a platform super_admin: a demo account must never gain platform access.
// Shared password for every account (demo only): DemoAttabl2026.
const DEMO_PASSWORD = 'DemoAttabl2026';

const STAFF: StaffMember[] = [
  {
    email: 'owner@demo.attabl.com',
    password: DEMO_PASSWORD,
    fullName: 'Amadou Diallo',
    role: 'owner',
    phone: '+235 66 00 00 00',
    isSuperAdmin: false,
  },
  {
    email: 'chef@demo.attabl.com',
    password: DEMO_PASSWORD,
    fullName: 'Fatime Hassan',
    role: 'chef',
    phone: '+235 66 10 10 10',
    isSuperAdmin: false,
  },
  {
    email: 'manager@demo.attabl.com',
    password: DEMO_PASSWORD,
    fullName: 'Ousmane Kabore',
    role: 'manager',
    phone: '+235 66 20 20 20',
    isSuperAdmin: false,
  },
  {
    email: 'caisse@demo.attabl.com',
    password: DEMO_PASSWORD,
    fullName: 'Mariam Toure',
    role: 'cashier',
    phone: '+235 66 30 30 30',
    isSuperAdmin: false,
  },
  {
    email: 'serveur1@demo.attabl.com',
    password: DEMO_PASSWORD,
    fullName: 'Ali Mahamat',
    role: 'waiter',
    phone: '+235 66 40 40 40',
    isSuperAdmin: false,
  },
  {
    email: 'serveur2@demo.attabl.com',
    password: DEMO_PASSWORD,
    fullName: 'Aicha Ndiaye',
    role: 'waiter',
    phone: '+235 66 50 50 50',
    isSuperAdmin: false,
  },
];

// ─── HELPERS ───────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`  ${msg}`);
}

function logStep(step: number, label: string) {
  // Steps run 0 (cleanup) through 17; clamp the progress bar so a step index
  // beyond the bar width never feeds a negative count to String.repeat.
  const total = 17;
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

function randomPicks<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function dateAtHour(base: Date, hour: number, minuteMin = 0, minuteMax = 59): Date {
  const d = new Date(base);
  d.setHours(hour, randomInt(minuteMin, minuteMax), randomInt(0, 59), 0);
  return d;
}

// ─── CLEAN UP ──────────────────────────────────────────────────────────────

async function cleanup() {
  logStep(0, 'Cleanup existing "lepicurien" data');

  // Check if tenant exists
  const { data: existing } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', 'lepicurien')
    .single();

  // Always clean up auth users (they may exist even if tenant was deleted)
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

  if (!existing) {
    log('No existing tenant found. Starting fresh.');
    return;
  }

  const tenantId = existing.id;
  log(`Found existing tenant ${tenantId}. Removing all associated data...`);

  // Delete in dependency order (child tables first)
  // Some tables may not exist if migrations haven't been applied - skip silently.
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

  // Finally delete the tenant itself
  const { error: tenantDelError } = await supabase.from('tenants').delete().eq('id', tenantId);
  if (tenantDelError) {
    log(`  Warning deleting tenant: ${tenantDelError.message}`);
  }

  log('Cleanup complete.');
}

// ─── STEP 1: CREATE TENANT ────────────────────────────────────────────────

async function createTenant() {
  logStep(1, "Create Tenant: L'Epicurien");

  // Base tenant fields (always present)
  const tenantData: Record<string, unknown> = {
    id: ID.tenant,
    name: "L'Epicurien",
    slug: 'lepicurien',
    secondary_color: '#CCFF00',
    // business unlocks canAccessInventory (pro+), so order destock actually fires.
    // Valid CHECK values: starter | pro | business | enterprise.
    subscription_plan: 'business',
    subscription_status: 'active',
    onboarding_completed: true,
    establishment_type: 'restaurant',
    description: 'Cuisine africaine: grillades, poissons braises, sauces et jus naturels',
    address: "Avenue Charles de Gaulle, N'Djamena",
    city: "N'Djamena",
    country: 'Tchad',
    phone: '+235 66 00 00 00',
    table_count: 15,
    is_active: true,
  };

  // Fields from 20260210_production_upgrade migration
  if (migrations.hasProductionUpgrade) {
    tenantData.primary_color = '#1A1A2E';
    tenantData.currency = 'XAF';
    tenantData.tax_rate = 19.25;
    tenantData.enable_tax = true;
    tenantData.service_charge_rate = 10;
    tenantData.enable_service_charge = true;
  }

  const { data, error } = await supabase.from('tenants').insert(tenantData).select().single();

  if (error) throw new Error(`Tenant creation failed: ${error.message}`);
  log(`Tenant created: ${data.id} (${data.slug})`);
  return data;
}

// ─── STEP 2: CREATE AUTH USERS + ADMIN USERS ──────────────────────────────

async function createUsers() {
  logStep(2, 'Create Auth Users + Admin Users');

  for (const staff of STAFF) {
    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: staff.email,
      password: staff.password,
      email_confirm: true,
      user_metadata: {
        full_name: staff.fullName,
        restaurant_name: "L'Epicurien",
      },
    });

    if (authError) throw new Error(`Auth user ${staff.email} failed: ${authError.message}`);
    staff.userId = authData.user.id;
    log(`Auth user created: ${staff.email} -> ${staff.userId}`);

    // Create admin_users link
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
      is_super_admin: staff.isSuperAdmin,
    });

    if (adminError) throw new Error(`Admin user ${staff.email} failed: ${adminError.message}`);
    log(`Admin user linked: ${staff.fullName} (${staff.role})`);
  }

  log(`Total users created: ${STAFF.length}`);
}

// ─── STEP 3: CREATE VENUE ─────────────────────────────────────────────────

async function createVenue() {
  logStep(3, 'Create Venue: Salle Principale');

  const { error } = await supabase.from('venues').insert({
    id: ID.venue,
    tenant_id: ID.tenant,
    name: 'Salle Principale',
    name_en: 'Main Dining Hall',
    slug: 'salle-principale',
    type: 'restaurant',
    is_active: true,
  });

  if (error) throw new Error(`Venue creation failed: ${error.message}`);
  log('Venue created: Salle Principale');
}

// ─── STEP 4: CREATE ZONES & TABLES ───────────────────────────────────────

async function createZonesAndTables() {
  logStep(4, 'Create Zones & Tables');

  const zones = [
    {
      id: ID.zoneTerrasse,
      venue_id: ID.venue,
      tenant_id: ID.tenant,
      name: 'Terrasse',
      name_en: 'Terrace',
      prefix: 'T',
      description: 'Terrasse exterieure avec vue',
      display_order: 0,
    },
    {
      id: ID.zoneSalle,
      venue_id: ID.venue,
      tenant_id: ID.tenant,
      name: 'Salle',
      name_en: 'Main Room',
      prefix: 'S',
      description: 'Salle de restaurant principale',
      display_order: 1,
    },
    {
      id: ID.zoneVIP,
      venue_id: ID.venue,
      tenant_id: ID.tenant,
      name: 'VIP',
      name_en: 'VIP Lounge',
      prefix: 'V',
      description: 'Espace VIP prive',
      display_order: 2,
    },
  ];

  const { error: zoneError } = await supabase.from('zones').insert(zones);
  if (zoneError) throw new Error(`Zones creation failed: ${zoneError.message}`);
  log('Zones created: Terrasse, Salle, VIP');

  // Tables
  const tables: Array<{
    id: string;
    zone_id: string;
    tenant_id: string;
    table_number: string;
    display_name: string;
    capacity: number;
    is_active: boolean;
  }> = [];

  // Terrasse: T1-T5 (capacity 2-4)
  for (let i = 1; i <= 5; i++) {
    const tid = randomUUID();
    tableIds[`T${i}`] = tid;
    tables.push({
      id: tid,
      zone_id: ID.zoneTerrasse,
      tenant_id: ID.tenant,
      table_number: `T${i}`,
      display_name: `Terrasse ${i}`,
      capacity: i <= 3 ? 2 : 4,
      is_active: true,
    });
  }

  // Salle: S1-S6 (capacity 2-8)
  const salleCapacities = [2, 4, 4, 6, 6, 8];
  for (let i = 1; i <= 6; i++) {
    const tid = randomUUID();
    tableIds[`S${i}`] = tid;
    tables.push({
      id: tid,
      zone_id: ID.zoneSalle,
      tenant_id: ID.tenant,
      table_number: `S${i}`,
      display_name: `Salle ${i}`,
      capacity: salleCapacities[i - 1],
      is_active: true,
    });
  }

  // VIP: V1-V4 (capacity 4-10)
  const vipCapacities = [4, 6, 8, 10];
  for (let i = 1; i <= 4; i++) {
    const tid = randomUUID();
    tableIds[`V${i}`] = tid;
    tables.push({
      id: tid,
      zone_id: ID.zoneVIP,
      tenant_id: ID.tenant,
      table_number: `V${i}`,
      display_name: `VIP ${i}`,
      capacity: vipCapacities[i - 1],
      is_active: true,
    });
  }

  const { error: tableError } = await supabase.from('tables').insert(tables);
  if (tableError) throw new Error(`Tables creation failed: ${tableError.message}`);
  log(`Tables created: ${tables.length} (T1-T5, S1-S6, V1-V4)`);
}

// ─── STEP 5: CREATE MENUS ─────────────────────────────────────────────────

async function createMenus() {
  logStep(5, 'Create Menu & Categories');

  // Menus table only exists if menu_hierarchy migration was applied. A single
  // African "La Carte" holds every category.
  if (migrations.hasMenuHierarchy) {
    const { error: menuError } = await supabase.from('menus').insert({
      id: ID.menuCarte,
      tenant_id: ID.tenant,
      venue_id: ID.venue,
      name: 'La Carte',
      name_en: 'The Menu',
      slug: 'carte-principale',
      description: 'Grillades, poissons braises, sauces et jus naturels',
      description_en: 'Grills, braised fish, stews and fresh juices',
      is_active: true,
      display_order: 0,
    });
    if (menuError) throw new Error(`Menus creation failed: ${menuError.message}`);
    log('Menu created: La Carte');
  } else {
    log('Skipping menu (menus table not available)');
  }

  // ─── Categories ──────────────────────────────────────────────────────────
  // menu_id column only exists if the menu_hierarchy migration was applied.
  // preparation_zone (KDS routing: kitchen vs bar) and is_active are optional.
  const cc = migrations.categoryColumns;
  const categoryRows = CATEGORIES.map((c) => {
    const row: Record<string, unknown> = {
      id: catId[c.key],
      tenant_id: ID.tenant,
      name: c.name,
      name_en: c.name,
      display_order: c.order,
    };
    if (migrations.hasMenuHierarchy) row.menu_id = ID.menuCarte;
    if (cc.has('is_active')) row.is_active = true;
    if (cc.has('preparation_zone')) row.preparation_zone = c.zone;
    return row;
  });

  const { error: catError } = await supabase.from('categories').insert(categoryRows);
  if (catError) throw new Error(`Categories creation failed: ${catError.message}`);
  log(`Categories created: ${categoryRows.length}`);
}

// ─── AFRICAN MENU DATA (source of truth for categories, items, recipes) ────
// Prices are FCFA (XAF, 0 decimals). Descriptions keep French accents (data);
// code and comments stay ASCII. Each item slug is stable and drives the storage
// path lepicurien/<slug>.jpg for its photo.

interface CategoryDef {
  key: string;
  name: string;
  zone: 'kitchen' | 'bar';
  order: number;
}

const CATEGORIES: CategoryDef[] = [
  { key: 'entrees', name: 'Entrees & mises en bouche', zone: 'kitchen', order: 1 },
  { key: 'brochettes', name: 'Brochettes & grillades', zone: 'kitchen', order: 2 },
  { key: 'poissons', name: 'Poissons', zone: 'kitchen', order: 3 },
  { key: 'volailles', name: 'Volailles', zone: 'kitchen', order: 4 },
  { key: 'sauces', name: 'Viandes & plats en sauce', zone: 'kitchen', order: 5 },
  { key: 'riz', name: 'Riz & feculents', zone: 'kitchen', order: 6 },
  { key: 'tchad', name: 'Specialites du Tchad', zone: 'kitchen', order: 7 },
  { key: 'desserts', name: 'Desserts', zone: 'kitchen', order: 8 },
  { key: 'jus', name: 'Jus naturels & boissons fraiches', zone: 'bar', order: 9 },
  { key: 'bar', name: 'Sodas, bieres & vins', zone: 'bar', order: 10 },
];

interface ItemDef {
  slug: string;
  cat: string;
  name: string;
  price: number;
  desc: string;
  allergens: string[];
  spicy?: boolean;
  vegetarian?: boolean;
  featured?: boolean;
  photo?: string;
}

const ITEMS: ItemDef[] = [
  // Entrees
  {
    slug: 'accras-crevettes',
    cat: 'entrees',
    name: 'Accras de crevettes',
    price: 3500,
    desc: 'Beignets croustillants aux crevettes, piment doux et persil. A tremper dans la sauce.',
    allergens: ['crustaces', 'gluten'],
    spicy: true,
    photo: 'Accra fritters',
  },
  {
    slug: 'samoussas-viande',
    cat: 'entrees',
    name: 'Samoussas de boeuf',
    price: 3000,
    desc: 'Triangles croustillants farcis au boeuf epice. Trois pieces.',
    allergens: ['gluten'],
    spicy: true,
    featured: true,
    photo: 'Samosa',
  },
  {
    slug: 'pastels-poisson',
    cat: 'entrees',
    name: 'Pastels au poisson',
    price: 3000,
    desc: "Chaussons frits garnis de poisson emiette et d'oignon. Servis avec sauce tomate pimentee.",
    allergens: ['gluten', 'poisson'],
    photo: 'Pastel senegalese food',
  },
  {
    slug: 'salade-avocat',
    cat: 'entrees',
    name: "Salade d'avocat et mangue",
    price: 3500,
    desc: 'Avocat cremeux, mangue mure et oignon rouge, filet de citron vert.',
    allergens: [],
    vegetarian: true,
    photo: 'Avocado salad',
  },
  {
    slug: 'salade-cesar',
    cat: 'entrees',
    name: 'Salade de crudites',
    price: 2500,
    desc: 'Tomate, concombre, carotte et laitue du jardin, vinaigrette maison.',
    allergens: [],
    vegetarian: true,
    photo: 'Mixed vegetable salad',
  },
  // Brochettes & grillades
  {
    slug: 'brochette-boeuf',
    cat: 'brochettes',
    name: 'Brochettes de boeuf',
    price: 4500,
    desc: 'Des de boeuf marines, grilles au feu de bois. Servies avec oignons et moutarde.',
    allergens: ['moutarde'],
    featured: true,
    photo: 'Beef brochette grilled',
  },
  {
    slug: 'brochette-poulet',
    cat: 'brochettes',
    name: 'Brochettes de poulet',
    price: 4000,
    desc: 'Blanc de poulet marine au gingembre et grille. Tendre et parfume.',
    allergens: [],
    photo: 'Chicken skewer grilled',
  },
  {
    slug: 'brochette-mouton',
    cat: 'brochettes',
    name: 'Brochettes de mouton',
    price: 5000,
    desc: 'Morceaux de mouton epices, grilles a la braise. Un classique du bord de rue, revisite.',
    allergens: [],
    spicy: true,
    photo: 'Lamb kebab grilled',
  },
  {
    slug: 'cotelettes-agneau',
    cat: 'brochettes',
    name: "Cotelettes d'agneau grillees",
    price: 7000,
    desc: "Cotelettes d'agneau marinees aux herbes, grillees a point.",
    allergens: [],
    photo: 'Grilled lamb chops',
  },
  {
    slug: 'ailes-poulet',
    cat: 'brochettes',
    name: 'Ailes de poulet braisees',
    price: 4000,
    desc: 'Ailes de poulet marinees et braisees, sauce piquante a part.',
    allergens: [],
    spicy: true,
    photo: 'Grilled chicken wings',
  },
  // Poissons
  {
    slug: 'capitaine-braise',
    cat: 'poissons',
    name: 'Capitaine braise',
    price: 9000,
    desc: "Capitaine entier braise au feu de bois, farci d'oignon et d'ail. Le plat signature.",
    allergens: ['poisson'],
    featured: true,
    photo: 'Poisson braise',
  },
  {
    slug: 'tilapia-braise',
    cat: 'poissons',
    name: 'Tilapia braise',
    price: 6500,
    desc: 'Tilapia frais braise, peau croustillante, chair fondante. Servi avec alloco.',
    allergens: ['poisson'],
    photo: 'Grilled tilapia',
  },
  {
    slug: 'poisson-yassa',
    cat: 'poissons',
    name: 'Poisson yassa',
    price: 7000,
    desc: "Poisson mijote dans une sauce d'oignons confits au citron. Aigre-doux et genereux.",
    allergens: ['poisson'],
    photo: 'Yassa fish',
  },
  {
    slug: 'machoiron-sauce',
    cat: 'poissons',
    name: 'Machoiron sauce claire',
    price: 7500,
    desc: "Machoiron dans un bouillon leger d'aubergine, gombo et piment. Reconfortant.",
    allergens: ['poisson'],
    spicy: true,
    photo: 'African fish stew',
  },
  {
    slug: 'gambas-grillees',
    cat: 'poissons',
    name: 'Gambas grillees',
    price: 11000,
    desc: "Grosses gambas grillees a l'ail et au beurre. Un delice de la maree.",
    allergens: ['crustaces'],
    featured: true,
    photo: 'Grilled prawns',
  },
  // Volailles
  {
    slug: 'poulet-dg',
    cat: 'volailles',
    name: 'Poulet DG',
    price: 7500,
    desc: 'Poulet saute aux plantains murs, poivrons et legumes. Le plat des grands jours.',
    allergens: [],
    featured: true,
    photo: 'Poulet DG',
  },
  {
    slug: 'poulet-yassa',
    cat: 'volailles',
    name: 'Poulet yassa',
    price: 6500,
    desc: "Poulet marine puis mijote dans une sauce d'oignons au citron. Genereux.",
    allergens: [],
    photo: 'Poulet yassa',
  },
  {
    slug: 'poulet-kedjenou',
    cat: 'volailles',
    name: 'Poulet kedjenou',
    price: 6800,
    desc: 'Poulet etouffe a la tomate et au gingembre, cuit lentement dans son jus.',
    allergens: [],
    spicy: true,
    photo: 'Kedjenou',
  },
  {
    slug: 'poulet-braise',
    cat: 'volailles',
    name: 'Demi-poulet braise',
    price: 6000,
    desc: 'Demi-poulet marine et braise au feu de bois, servi avec attieke.',
    allergens: [],
    photo: 'Grilled chicken half',
  },
  {
    slug: 'pintade-roti',
    cat: 'volailles',
    name: 'Pintade rotie',
    price: 8000,
    desc: 'Pintade fermiere rotie aux epices, chair goutue et doree.',
    allergens: [],
    photo: 'Roasted guinea fowl',
  },
  // Viandes & plats en sauce
  {
    slug: 'mafe-boeuf',
    cat: 'sauces',
    name: 'Mafe de boeuf',
    price: 6500,
    desc: "Boeuf mijote dans une onctueuse sauce d'arachide. Riche et enveloppant.",
    allergens: ['arachide'],
    featured: true,
    photo: 'Mafe',
  },
  {
    slug: 'ndole-boeuf',
    cat: 'sauces',
    name: 'Ndole viande et crevettes',
    price: 7500,
    desc: 'Feuilles de ndole pilees, arachide, boeuf et crevettes. La fierte du Cameroun.',
    allergens: ['arachide', 'crustaces'],
    photo: 'Ndole',
  },
  {
    slug: 'sauce-gombo',
    cat: 'sauces',
    name: 'Sauce gombo a la viande',
    price: 6000,
    desc: 'Gombo fondant, viande de boeuf et poisson fume. A manger avec la boule.',
    allergens: ['poisson'],
    spicy: true,
    photo: 'Okra soup',
  },
  {
    slug: 'sauce-arachide',
    cat: 'sauces',
    name: 'Sauce arachide au poulet',
    price: 6000,
    desc: "Poulet mijote dans une sauce d'arachide epaisse et parfumee.",
    allergens: ['arachide'],
    photo: 'Groundnut stew',
  },
  {
    slug: 'sauce-feuille',
    cat: 'sauces',
    name: 'Sauce feuille de patate',
    price: 5500,
    desc: 'Feuilles de patate douce pilees, huile de palme et viande. Un gout de terroir.',
    allergens: [],
    photo: 'Cassava leaf stew',
  },
  {
    slug: 'boeuf-oignons',
    cat: 'sauces',
    name: 'Emince de boeuf aux oignons',
    price: 6500,
    desc: 'Fines lamelles de boeuf sautees aux oignons et poivrons.',
    allergens: [],
    photo: 'Beef and onions',
  },
  // Riz & feculents
  {
    slug: 'riz-jollof',
    cat: 'riz',
    name: 'Riz jollof',
    price: 4000,
    desc: 'Riz mijote dans une sauce tomate epicee. Le roi des rassemblements.',
    allergens: [],
    vegetarian: true,
    spicy: true,
    featured: true,
    photo: 'Jollof rice',
  },
  {
    slug: 'thieboudienne',
    cat: 'riz',
    name: 'Thieboudienne',
    price: 6500,
    desc: 'Riz au poisson et legumes a la senegalaise, mijote dans la tomate. Un plat complet.',
    allergens: ['poisson'],
    photo: 'Thieboudienne',
  },
  {
    slug: 'riz-gras',
    cat: 'riz',
    name: 'Riz gras',
    price: 4500,
    desc: 'Riz cuit dans un bouillon de viande et de legumes. Genereux et parfume.',
    allergens: [],
    photo: 'Riz gras',
  },
  {
    slug: 'riz-sauce-tomate',
    cat: 'riz',
    name: 'Riz sauce tomate',
    price: 3000,
    desc: "Riz blanc nappe d'une sauce tomate maison mijotee.",
    allergens: [],
    vegetarian: true,
    photo: 'Rice tomato sauce',
  },
  {
    slug: 'attieke-poisson',
    cat: 'riz',
    name: 'Attieke poisson',
    price: 5000,
    desc: 'Semoule de manioc fermente et poisson braise, oignons au citron. Le duo ivoirien.',
    allergens: ['poisson'],
    photo: 'Attieke',
  },
  {
    slug: 'alloco',
    cat: 'riz',
    name: 'Alloco',
    price: 2500,
    desc: 'Bananes plantains mures frites, dorees et fondantes. Sauce pimentee a part.',
    allergens: [],
    vegetarian: true,
    photo: 'Alloco',
  },
  {
    slug: 'foufou',
    cat: 'riz',
    name: 'Foufou de manioc',
    price: 2500,
    desc: 'Pate de manioc lisse et elastique. Le compagnon des sauces.',
    allergens: [],
    vegetarian: true,
    photo: 'Fufu',
  },
  {
    slug: 'plantain-frit',
    cat: 'riz',
    name: 'Plantains frits',
    price: 2000,
    desc: 'Tranches de plantain frites, croustillantes dehors, moelleuses dedans.',
    allergens: [],
    vegetarian: true,
    photo: 'Fried plantain',
  },
  // Specialites du Tchad
  {
    slug: 'boule-daraba',
    cat: 'tchad',
    name: 'Boule et daraba',
    price: 5000,
    desc: 'Boule de mil accompagnee de daraba, une sauce gombo au sesame. Le coeur du Tchad.',
    allergens: ['sesame'],
    featured: true,
    photo: 'Millet porridge',
  },
  {
    slug: 'la-viande-grille',
    cat: 'tchad',
    name: 'La viande grillee',
    price: 5500,
    desc: 'Viande de mouton grillee a la braise, coupee en morceaux, sel et piment.',
    allergens: [],
    spicy: true,
    photo: 'Grilled mutton',
  },
  {
    slug: 'kanni-riz',
    cat: 'tchad',
    name: 'Riz au gras tchadien',
    price: 5000,
    desc: 'Riz mijote a la viande et aux epices locales, colore et parfume.',
    allergens: [],
    photo: 'Jollof rice',
  },
  {
    slug: 'salade-tchadienne',
    cat: 'tchad',
    name: 'Salade tchadienne',
    price: 3000,
    desc: 'Tomate, oignon, concombre et huile parfumee. Fraiche et simple.',
    allergens: [],
    vegetarian: true,
    photo: 'Tomato onion salad',
  },
  // Desserts
  {
    slug: 'beignets-haricot',
    cat: 'desserts',
    name: 'Beignets sucres',
    price: 2000,
    desc: 'Beignets moelleux saupoudres de sucre. Tout chauds.',
    allergens: ['gluten'],
    vegetarian: true,
    photo: 'Sugar doughnut',
  },
  {
    slug: 'salade-fruits',
    cat: 'desserts',
    name: 'Salade de fruits frais',
    price: 3000,
    desc: 'Mangue, ananas, papaye et pasteque de saison, coupes minute.',
    allergens: [],
    vegetarian: true,
    featured: true,
    photo: 'Fruit salad',
  },
  {
    slug: 'degue',
    cat: 'desserts',
    name: 'Degue',
    price: 2500,
    desc: 'Perles de mil dans un lait caille sucre et vanille. Frais et gourmand.',
    allergens: ['lait'],
    vegetarian: true,
    photo: 'Millet pudding',
  },
  {
    slug: 'thiakry',
    cat: 'desserts',
    name: 'Thiakry',
    price: 2500,
    desc: "Couscous de mil au lait, raisins secs et fleur d'oranger.",
    allergens: ['lait'],
    vegetarian: true,
    photo: 'Thiakry',
  },
  {
    slug: 'banane-flambee',
    cat: 'desserts',
    name: 'Banane au miel',
    price: 3000,
    desc: 'Banane poelee, miel et cannelle, une pointe de citron.',
    allergens: [],
    vegetarian: true,
    photo: 'Caramelized banana',
  },
  // Jus naturels & boissons fraiches
  {
    slug: 'jus-bissap',
    cat: 'jus',
    name: 'Bissap',
    price: 1500,
    desc: "Infusion d'hibiscus glacee, menthe et sucre. Rouge, acidule, rafraichissant.",
    allergens: [],
    vegetarian: true,
    featured: true,
    photo: 'Bissap drink',
  },
  {
    slug: 'jus-gingembre',
    cat: 'jus',
    name: 'Jus de gingembre',
    price: 1500,
    desc: 'Gingembre frais presse, citron et sucre. Vif et tonique.',
    allergens: [],
    vegetarian: true,
    photo: 'Ginger juice',
  },
  {
    slug: 'jus-tamarin',
    cat: 'jus',
    name: 'Jus de tamarin',
    price: 1500,
    desc: 'Pulpe de tamarin sucree et glacee. Aigre-doux et desalterant.',
    allergens: [],
    vegetarian: true,
    photo: 'Tamarind juice',
  },
  {
    slug: 'jus-bouye',
    cat: 'jus',
    name: 'Jus de bouye (pain de singe)',
    price: 1800,
    desc: 'Jus cremeux de fruit du baobab, doux et vitamine.',
    allergens: ['lait'],
    vegetarian: true,
    photo: 'Baobab fruit juice',
  },
  {
    slug: 'jus-mangue',
    cat: 'jus',
    name: 'Jus de mangue',
    price: 1800,
    desc: 'Mangue mure mixee minute, epaisse et sucree.',
    allergens: [],
    vegetarian: true,
    photo: 'Mango juice',
  },
  // Sodas, bieres & vins
  {
    slug: 'eau-minerale',
    cat: 'bar',
    name: 'Eau minerale',
    price: 1000,
    desc: "Bouteille d'eau minerale fraiche, 50 cl.",
    allergens: [],
    vegetarian: true,
    photo: 'Bottled water',
  },
  {
    slug: 'soda',
    cat: 'bar',
    name: 'Soda',
    price: 1200,
    desc: 'Coca, Fanta ou Sprite bien frais, 33 cl.',
    allergens: [],
    vegetarian: true,
    photo: 'Soft drink bottle',
  },
  {
    slug: 'biere-locale',
    cat: 'bar',
    name: 'Biere locale',
    price: 1800,
    desc: 'Biere blonde locale servie fraiche, 65 cl.',
    allergens: ['gluten'],
    vegetarian: true,
    featured: true,
    photo: 'Beer bottle',
  },
  {
    slug: 'biere-import',
    cat: 'bar',
    name: 'Biere import',
    price: 2500,
    desc: 'Biere blonde importee, 33 cl.',
    allergens: ['gluten'],
    vegetarian: true,
    photo: 'Lager beer glass',
  },
  {
    slug: 'vin-rouge-verre',
    cat: 'bar',
    name: 'Verre de vin rouge',
    price: 4000,
    desc: 'Vin rouge charpente au verre, servi a bonne temperature.',
    allergens: ['sulfites'],
    vegetarian: true,
    photo: 'Glass of red wine',
  },
  {
    slug: 'vin-blanc-verre',
    cat: 'bar',
    name: 'Verre de vin blanc',
    price: 4000,
    desc: 'Vin blanc sec et frais au verre.',
    allergens: ['sulfites'],
    vegetarian: true,
    photo: 'Glass of white wine',
  },
];

// Slug/key -> UUID maps. Built once so recipes, orders and photos all reference
// the same rows. Categories and items keyed by their stable slugs.
const catId: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, randomUUID()]),
);
const itemId: Record<string, string> = Object.fromEntries(ITEMS.map((i) => [i.slug, randomUUID()]));

// Zone lookup: category zone drives is_drink (bar + jus categories are 'bar')
// and KDS routing.
const catZone: Record<string, 'kitchen' | 'bar'> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.zone]),
);

// Runtime menu-item shape consumed by the order builders. is_drink flags bar/jus
// categories; course routes KDS/receipt grouping (appetizer|main|dessert|drink).
interface MenuItemRuntime {
  id: string;
  name: string;
  price: number;
  is_drink: boolean;
  course: string | null;
}

function itemCourse(catKey: string): string {
  if (catZone[catKey] === 'bar') return 'drink';
  if (catKey === 'entrees') return 'appetizer';
  if (catKey === 'desserts') return 'dessert';
  return 'main';
}

const MENU_ITEMS: MenuItemRuntime[] = ITEMS.map((i) => ({
  id: itemId[i.slug],
  name: i.name,
  price: i.price,
  is_drink: catZone[i.cat] === 'bar',
  course: itemCourse(i.cat),
}));

async function createMenuItems() {
  logStep(6, 'Create Menu Items');

  const mic = migrations.menuItemColumns;
  const rows = ITEMS.map((item) => {
    const row: Record<string, unknown> = {
      id: itemId[item.slug],
      tenant_id: ID.tenant,
      name: item.name,
      name_en: item.name,
      description: item.desc,
      description_en: item.desc,
      price: item.price,
      category_id: catId[item.cat],
      is_available: true,
      is_featured: item.featured ?? false,
    };
    if (mic.has('allergens')) row.allergens = item.allergens;
    if (mic.has('is_vegetarian')) row.is_vegetarian = item.vegetarian ?? false;
    if (mic.has('is_spicy')) row.is_spicy = item.spicy ?? false;
    return row;
  });

  const { error } = await supabase.from('menu_items').insert(rows);
  if (error) throw new Error(`Menu items creation failed: ${error.message}`);
  log(`Menu items created: ${rows.length}`);
}

// ─── STEP 7: FETCH & UPLOAD MENU PHOTOS ──────────────────────────────────
// Resolve each item's Wikimedia Commons search term to a file thumbnail,
// download it, upload to the public "menu-items" bucket at lepicurien/<slug>.jpg
// and stamp menu_items.image_url. Failures (no match / non-200) log a warning
// and leave image_url null - they never abort the seed.

const PHOTO_UA = 'attabl-demo-seed/1.0 (https://attabl.com; demo data)';

interface WikimediaImageInfo {
  thumburl?: string;
  url?: string;
}
interface WikimediaPage {
  imageinfo?: WikimediaImageInfo[];
}
interface WikimediaResponse {
  query?: { pages?: Record<string, WikimediaPage> };
}

// Generic photo fallback per category, tried when an item's own search term
// returns nothing - so every dish still gets a relevant-looking image.
const CATEGORY_PHOTO_FALLBACK: Record<string, string> = {
  entrees: 'African appetizer food',
  brochettes: 'Grilled meat skewer',
  poissons: 'Grilled fish plate',
  volailles: 'Roast chicken plate',
  sauces: 'African stew',
  riz: 'Rice dish plate',
  tchad: 'African food plate',
  desserts: 'Dessert plate',
  jus: 'Fruit juice glass',
  bar: 'Drink bottle',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wikimedia rate-limits aggressively (HTTP 429). Fetch politely: retry 429/5xx
// with backoff. All photo traffic runs sequentially with a delay between calls.
async function fetchPolite(url: string, tries = 4): Promise<Response | null> {
  let wait = 1500;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': PHOTO_UA } });
    if (res.ok) return res;
    if (res.status === 429 || res.status >= 500) {
      if (attempt === tries) return res;
      await sleep(wait);
      wait *= 2;
      continue;
    }
    return res;
  }
  return null;
}

async function resolveWikimediaImage(term: string): Promise<string | null> {
  const api =
    'https://commons.wikimedia.org/w/api.php?action=query&generator=search' +
    `&gsrsearch=${encodeURIComponent(term)}` +
    '&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json';
  const res = await fetchPolite(api);
  if (!res || !res.ok) return null;
  const data = (await res.json()) as WikimediaResponse;
  const pages = data.query?.pages;
  if (!pages) return null;
  const first = Object.values(pages)[0];
  const info = first?.imageinfo?.[0];
  return info?.thumburl ?? info?.url ?? null;
}

async function createMenuItemPhotos() {
  logStep(7, 'Fetch & upload menu photos (Wikimedia -> storage)');

  const mic = migrations.menuItemColumns;
  if (!mic.has('image_url')) {
    log('Skipping photos (menu_items.image_url column not available)');
    return;
  }

  const withPhoto = ITEMS.filter((i) => i.photo);

  // Reuse images already in the bucket (a prior run) instead of re-downloading -
  // keeps re-runs fast and gentle on Wikimedia.
  const existing = new Set<string>();
  const listed = await supabase.storage.from('menu-items').list('lepicurien', { limit: 1000 });
  for (const f of listed.data ?? []) existing.add(f.name);

  let ok = 0;
  let reused = 0;
  let failed = 0;

  for (const item of withPhoto) {
    const storagePath = `lepicurien/${item.slug}.jpg`;
    try {
      let haveFile = existing.has(`${item.slug}.jpg`);

      if (!haveFile) {
        // Resolve the item term, then a category fallback if it yields nothing.
        let src = await resolveWikimediaImage(item.photo as string);
        await sleep(300);
        if (!src) {
          const fb = CATEGORY_PHOTO_FALLBACK[item.cat];
          if (fb) {
            src = await resolveWikimediaImage(fb);
            await sleep(300);
          }
        }
        if (!src) {
          failed++;
          log(`  No photo found for ${item.slug} (term "${item.photo}")`);
          continue;
        }
        const res = await fetchPolite(src);
        await sleep(300);
        if (!res || !res.ok) {
          failed++;
          log(`  Photo download failed for ${item.slug} (HTTP ${res?.status ?? 'network'})`);
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const { error: upErr } = await supabase.storage
          .from('menu-items')
          .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: true });
        if (upErr) {
          failed++;
          log(`  Photo upload failed for ${item.slug}: ${upErr.message}`);
          continue;
        }
        haveFile = true;
      } else {
        reused++;
      }

      const publicUrl = supabase.storage.from('menu-items').getPublicUrl(storagePath)
        .data.publicUrl;
      const update: Record<string, unknown> = { image_url: publicUrl };
      if (mic.has('image_source')) update.image_source = 'import';
      if (mic.has('image_uploaded_at')) update.image_uploaded_at = new Date().toISOString();

      const { error: updErr } = await supabase
        .from('menu_items')
        .update(update)
        .eq('id', itemId[item.slug])
        .eq('tenant_id', ID.tenant);
      if (updErr) {
        failed++;
        log(`  Photo DB update failed for ${item.slug}: ${updErr.message}`);
        continue;
      }
      if (haveFile && !existing.has(`${item.slug}.jpg`)) ok++;
    } catch (e) {
      failed++;
      log(`  Photo error for ${item.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  log(
    `Photos: ${ok} downloaded, ${reused} reused, ${failed} failed (of ${withPhoto.length} with a photo term)`,
  );
}

// ─── STEP 8: CREATE INGREDIENTS ───────────────────────────────────────────

// Ingredient shape used by the seed. `open` is the day-0 stock; it is applied
// via the canonical set_opening_stock RPC (NOT a direct current_stock write), so
// the ledger invariant SUM(stock_movements.quantity) == current_stock holds.
// IDs come from the ingId map (keyed by `key`), built below.
interface IngredientDef {
  key: string;
  name: string;
  unit: 'kg' | 'L' | 'piece' | 'cl' | 'g' | 'bouteille';
  open: number;
  min: number;
  cost: number;
  category: string;
  purchase_unit?: string;
  units_per_purchase?: number;
  lowAlert?: boolean;
}

const INGREDIENTS: IngredientDef[] = [
  { key: 'riz', name: 'Riz', unit: 'kg', cost: 900, min: 8, open: 120, category: 'Feculents' },
  {
    key: 'poisson_capitaine',
    name: 'Capitaine',
    unit: 'kg',
    cost: 4500,
    min: 5,
    open: 60,
    category: 'Poissons',
  },
  {
    key: 'tilapia',
    name: 'Tilapia',
    unit: 'kg',
    cost: 2800,
    min: 5,
    open: 50,
    category: 'Poissons',
  },
  { key: 'poulet', name: 'Poulet', unit: 'kg', cost: 2200, min: 6, open: 90, category: 'Viandes' },
  { key: 'boeuf', name: 'Boeuf', unit: 'kg', cost: 3500, min: 5, open: 80, category: 'Viandes' },
  { key: 'mouton', name: 'Mouton', unit: 'kg', cost: 3800, min: 4, open: 45, category: 'Viandes' },
  { key: 'gambas', name: 'Gambas', unit: 'kg', cost: 8000, min: 3, open: 25, category: 'Poissons' },
  {
    key: 'crevettes',
    name: 'Crevettes',
    unit: 'kg',
    cost: 6000,
    min: 3,
    open: 20,
    category: 'Poissons',
  },
  {
    key: 'pate_arachide',
    name: "Pate d'arachide",
    unit: 'kg',
    cost: 2500,
    min: 4,
    open: 40,
    category: 'Epicerie',
  },
  { key: 'gombo', name: 'Gombo', unit: 'kg', cost: 1200, min: 4, open: 35, category: 'Legumes' },
  { key: 'tomate', name: 'Tomate', unit: 'kg', cost: 900, min: 6, open: 70, category: 'Legumes' },
  { key: 'oignon', name: 'Oignon', unit: 'kg', cost: 700, min: 8, open: 90, category: 'Legumes' },
  { key: 'huile', name: 'Huile', unit: 'L', cost: 1400, min: 8, open: 100, category: 'Epicerie' },
  {
    key: 'manioc_attieke',
    name: 'Attieke (manioc)',
    unit: 'kg',
    cost: 1000,
    min: 5,
    open: 55,
    category: 'Feculents',
  },
  {
    key: 'plantain',
    name: 'Plantain',
    unit: 'kg',
    cost: 800,
    min: 6,
    open: 65,
    category: 'Feculents',
  },
  { key: 'mil', name: 'Mil', unit: 'kg', cost: 800, min: 5, open: 45, category: 'Feculents' },
  {
    key: 'piment',
    name: 'Piment',
    unit: 'kg',
    cost: 1500,
    min: 2,
    open: 12,
    category: 'Epices',
    lowAlert: true,
  },
  {
    key: 'gingembre',
    name: 'Gingembre',
    unit: 'kg',
    cost: 1800,
    min: 2,
    open: 10,
    category: 'Epices',
    lowAlert: true,
  },
  { key: 'citron', name: 'Citron', unit: 'kg', cost: 1000, min: 3, open: 20, category: 'Legumes' },
  { key: 'farine', name: 'Farine', unit: 'kg', cost: 700, min: 5, open: 50, category: 'Epicerie' },
  {
    key: 'hibiscus',
    name: "Fleur d'hibiscus",
    unit: 'kg',
    cost: 3000,
    min: 2,
    open: 15,
    category: 'Epicerie',
  },
  {
    key: 'eau_bouteille',
    name: 'Eau minerale',
    unit: 'bouteille',
    cost: 400,
    min: 48,
    open: 480,
    category: 'Boissons',
    purchase_unit: 'casier',
    units_per_purchase: 24,
  },
  {
    key: 'biere',
    name: 'Biere',
    unit: 'bouteille',
    cost: 900,
    min: 36,
    open: 360,
    category: 'Boissons',
    purchase_unit: 'casier',
    units_per_purchase: 12,
  },
  {
    key: 'soda',
    name: 'Soda',
    unit: 'bouteille',
    cost: 500,
    min: 48,
    open: 480,
    category: 'Boissons',
    purchase_unit: 'casier',
    units_per_purchase: 24,
  },
];

const ingId: Record<string, string> = Object.fromEntries(
  INGREDIENTS.map((g) => [g.key, randomUUID()]),
);
const ingName: Record<string, string> = Object.fromEntries(INGREDIENTS.map((g) => [g.key, g.name]));

// Recipe lines (fiches techniques). Each item maps to base-unit quantities per
// cover. Items without a recipe (some drinks, salads) simply do not destock.
interface RecipeDef {
  item: string;
  ings: Array<[string, number]>;
}

const RECIPES: RecipeDef[] = [
  {
    item: 'accras-crevettes',
    ings: [
      ['crevettes', 0.12],
      ['farine', 0.08],
      ['huile', 0.05],
    ],
  },
  {
    item: 'samoussas-viande',
    ings: [
      ['boeuf', 0.1],
      ['farine', 0.06],
      ['oignon', 0.04],
    ],
  },
  {
    item: 'pastels-poisson',
    ings: [
      ['tilapia', 0.12],
      ['farine', 0.06],
      ['oignon', 0.04],
    ],
  },
  {
    item: 'brochette-boeuf',
    ings: [
      ['boeuf', 0.2],
      ['oignon', 0.05],
    ],
  },
  {
    item: 'brochette-poulet',
    ings: [
      ['poulet', 0.2],
      ['gingembre', 0.02],
    ],
  },
  {
    item: 'brochette-mouton',
    ings: [
      ['mouton', 0.22],
      ['oignon', 0.05],
    ],
  },
  {
    item: 'ailes-poulet',
    ings: [
      ['poulet', 0.25],
      ['piment', 0.01],
    ],
  },
  {
    item: 'capitaine-braise',
    ings: [
      ['poisson_capitaine', 0.5],
      ['oignon', 0.08],
      ['citron', 0.05],
    ],
  },
  {
    item: 'tilapia-braise',
    ings: [
      ['tilapia', 0.4],
      ['oignon', 0.06],
      ['plantain', 0.15],
    ],
  },
  {
    item: 'poisson-yassa',
    ings: [
      ['tilapia', 0.35],
      ['oignon', 0.15],
      ['citron', 0.08],
    ],
  },
  {
    item: 'gambas-grillees',
    ings: [
      ['gambas', 0.25],
      ['huile', 0.03],
    ],
  },
  {
    item: 'poulet-dg',
    ings: [
      ['poulet', 0.3],
      ['plantain', 0.2],
      ['tomate', 0.1],
    ],
  },
  {
    item: 'poulet-yassa',
    ings: [
      ['poulet', 0.3],
      ['oignon', 0.15],
      ['citron', 0.08],
    ],
  },
  {
    item: 'poulet-kedjenou',
    ings: [
      ['poulet', 0.3],
      ['tomate', 0.12],
      ['gingembre', 0.02],
    ],
  },
  {
    item: 'poulet-braise',
    ings: [
      ['poulet', 0.35],
      ['manioc_attieke', 0.2],
    ],
  },
  {
    item: 'mafe-boeuf',
    ings: [
      ['boeuf', 0.25],
      ['pate_arachide', 0.1],
      ['tomate', 0.08],
    ],
  },
  {
    item: 'ndole-boeuf',
    ings: [
      ['boeuf', 0.2],
      ['pate_arachide', 0.08],
      ['crevettes', 0.06],
    ],
  },
  {
    item: 'sauce-gombo',
    ings: [
      ['boeuf', 0.2],
      ['gombo', 0.15],
      ['huile', 0.04],
    ],
  },
  {
    item: 'sauce-arachide',
    ings: [
      ['poulet', 0.25],
      ['pate_arachide', 0.1],
    ],
  },
  {
    item: 'riz-jollof',
    ings: [
      ['riz', 0.2],
      ['tomate', 0.1],
      ['oignon', 0.05],
    ],
  },
  {
    item: 'thieboudienne',
    ings: [
      ['riz', 0.2],
      ['poisson_capitaine', 0.2],
      ['tomate', 0.1],
    ],
  },
  {
    item: 'riz-gras',
    ings: [
      ['riz', 0.2],
      ['boeuf', 0.1],
      ['huile', 0.03],
    ],
  },
  {
    item: 'attieke-poisson',
    ings: [
      ['manioc_attieke', 0.25],
      ['tilapia', 0.3],
      ['oignon', 0.08],
    ],
  },
  {
    item: 'alloco',
    ings: [
      ['plantain', 0.25],
      ['huile', 0.05],
    ],
  },
  {
    item: 'plantain-frit',
    ings: [
      ['plantain', 0.25],
      ['huile', 0.05],
    ],
  },
  {
    item: 'boule-daraba',
    ings: [
      ['mil', 0.2],
      ['gombo', 0.1],
    ],
  },
  {
    item: 'la-viande-grille',
    ings: [
      ['mouton', 0.3],
      ['piment', 0.01],
    ],
  },
  {
    item: 'beignets-haricot',
    ings: [
      ['farine', 0.15],
      ['huile', 0.05],
    ],
  },
  { item: 'jus-bissap', ings: [['hibiscus', 0.03]] },
  {
    item: 'jus-gingembre',
    ings: [
      ['gingembre', 0.05],
      ['citron', 0.03],
    ],
  },
  { item: 'biere-locale', ings: [['biere', 1]] },
  { item: 'biere-import', ings: [['biere', 1]] },
  { item: 'soda', ings: [['soda', 1]] },
  { item: 'eau-minerale', ings: [['eau_bouteille', 1]] },
];

// Total recipe lines (rows written to the recipes table), used in the summary.
const RECIPE_LINE_COUNT = RECIPES.reduce((sum, r) => sum + r.ings.length, 0);

async function createIngredients() {
  logStep(8, 'Create Ingredients, Recipes, Opening Stock & Receptions');

  const owner = STAFF.find((s) => s.role === 'owner');
  const manager = STAFF.find((s) => s.role === 'manager');

  // 1. Insert ingredients WITHOUT stock. current_stock starts at 0; the opening
  //    quantity is booked through the ledger RPC below so the invariant holds.
  const rows = INGREDIENTS.map((ing) => ({
    id: ingId[ing.key],
    tenant_id: ID.tenant,
    name: ing.name,
    unit: ing.unit,
    current_stock: 0,
    min_stock_alert: ing.min,
    cost_per_unit: ing.cost,
    category: ing.category,
    purchase_unit: ing.purchase_unit ?? null,
    units_per_purchase: ing.units_per_purchase ?? 1,
    is_active: true,
  }));

  const { error: ingError } = await supabase.from('ingredients').insert(rows);
  if (ingError) throw new Error(`Ingredients creation failed: ${ingError.message}`);
  log(`Ingredients created: ${INGREDIENTS.length}`);

  // 2. Recipes (fiches techniques). Flatten each item's lines into one row per
  //    (menu_item, ingredient). notes carries the ingredient name for context.
  const recipeRows = RECIPES.flatMap((r) =>
    r.ings.map(([ingKey, qty]) => ({
      id: randomUUID(),
      tenant_id: ID.tenant,
      menu_item_id: itemId[r.item],
      ingredient_id: ingId[ingKey],
      quantity_needed: qty,
      notes: ingName[ingKey],
    })),
  );
  const { error: recipeError } = await supabase.from('recipes').insert(recipeRows);
  if (recipeError) throw new Error(`Recipes creation failed: ${recipeError.message}`);
  log(`Recipe lines created: ${recipeRows.length} (${RECIPES.length} recipes)`);

  // 3. Opening stock via the canonical set_opening_stock RPC (records the DELTA
  //    from 0, keeping SUM(movements) == current_stock). created_by = owner for
  //    anti-vol traceability.
  for (const ing of INGREDIENTS) {
    const { error } = await supabase.rpc('set_opening_stock', {
      p_tenant_id: ID.tenant,
      p_ingredient_id: ingId[ing.key],
      p_quantity: ing.open,
      p_created_by: owner?.userId ?? undefined,
    });
    if (error) throw new Error(`Opening stock for ${ing.name} failed: ${error.message}`);
  }
  log(`Opening stock booked: ${INGREDIENTS.length} ingredients (ledger 'opening')`);

  // 4. Supplier receptions via adjust_ingredient_stock_tx (movement_type
  //    'manual_add'), mirroring inventory.service.ts receiveStock. One reception
  //    is entered in the PURCHASE unit (casier) to exercise unit conversion; the
  //    auto note reproduces the service's "Recu: N casier (M bouteille)" format.
  //    Suppliers must exist first (createSuppliers runs before this step).
  if (!migrations.hasSuppliers) {
    log('Skipping receptions (suppliers migration not applied)');
    return;
  }

  interface Reception {
    ingredient_id: string;
    supplierId: string;
    quantity: number;
    inPurchaseUnit: boolean;
    baseUnit: string;
    purchaseUnit?: string;
    unitsPerPurchase: number;
  }
  const receptions: Reception[] = [
    {
      ingredient_id: ingId['boeuf'],
      supplierId: ID.supplierBoucherie,
      quantity: 20,
      inPurchaseUnit: false,
      baseUnit: 'kg',
      unitsPerPurchase: 1,
    },
    {
      ingredient_id: ingId['poisson_capitaine'],
      supplierId: ID.supplierMaree,
      quantity: 15,
      inPurchaseUnit: false,
      baseUnit: 'kg',
      unitsPerPurchase: 1,
    },
    // Purchase-unit reception: 5 casier of 24 -> 120 bouteille booked in base unit.
    {
      ingredient_id: ingId['eau_bouteille'],
      supplierId: ID.supplierBoissons,
      quantity: 5,
      inPurchaseUnit: true,
      baseUnit: 'bouteille',
      purchaseUnit: 'casier',
      unitsPerPurchase: 24,
    },
  ];

  for (const r of receptions) {
    // Base-unit quantity: casier -> bouteille is a pure count conversion
    // (quantity * unitsPerPurchase); base-unit receipts pass through unchanged.
    const baseQty = r.inPurchaseUnit ? r.quantity * r.unitsPerPurchase : r.quantity;
    const autoNote = r.inPurchaseUnit
      ? `Recu: ${r.quantity} ${r.purchaseUnit} (${baseQty} ${r.baseUnit})`
      : `Recu: ${baseQty} ${r.baseUnit}`;

    const { error } = await supabase.rpc('adjust_ingredient_stock_tx', {
      p_tenant_id: ID.tenant,
      p_ingredient_id: r.ingredient_id,
      p_delta: baseQty,
      p_movement_type: 'manual_add',
      p_notes: autoNote,
      p_created_by: manager?.userId ?? undefined,
      p_supplier_id: r.supplierId,
    });
    if (error) throw new Error(`Reception failed: ${error.message}`);
  }
  log(`Receptions booked: ${receptions.length} (1 via purchase unit / casier)`);
}

// ─── STEP 9: CREATE SUPPLIERS ─────────────────────────────────────────────

async function createSuppliers() {
  logStep(9, 'Create Suppliers');

  const suppliers = [
    {
      id: ID.supplierBoucherie,
      tenant_id: ID.tenant,
      name: "Boucherie de l'Excellence",
      contact_name: 'Jean-Pierre Moreau',
      phone: '+235 66 11 11 11',
      email: 'contact@boucherie-excellence.td',
      address: "Quartier Moursal, N'Djamena",
      notes: 'Livraison le mardi et vendredi. Viandes premium certifiees.',
      is_active: true,
    },
    {
      id: ID.supplierMaree,
      tenant_id: ID.tenant,
      name: 'Maree Fraiche',
      contact_name: 'Ousmane Diallo',
      phone: '+235 66 22 22 22',
      email: 'commandes@maree-fraiche.td',
      address: "Port de peche, N'Djamena",
      notes: "Poissons et fruits de mer frais. Commande 48h a l'avance.",
      is_active: true,
    },
    {
      id: ID.supplierMarche,
      tenant_id: ID.tenant,
      name: 'Marche de Dembe',
      contact_name: 'Fatime Abakar',
      phone: '+235 66 33 33 33',
      email: 'commandes@marche-dembe.td',
      address: "Marche de Dembe, N'Djamena",
      notes: 'Legumes, tubercules et fruits frais. Livraison tous les matins.',
      is_active: true,
    },
    {
      id: ID.supplierBoissons,
      tenant_id: ID.tenant,
      name: 'Depot Boissons du Sahel',
      contact_name: 'Hassan Adoum',
      phone: '+235 66 44 44 44',
      email: 'ventes@boissons-sahel.td',
      address: "Zone industrielle, N'Djamena",
      notes: 'Eaux, sodas et bieres au casier. Livraison quotidienne.',
      is_active: true,
    },
  ];

  const { error } = await supabase.from('suppliers').insert(suppliers);
  if (error) throw new Error(`Suppliers creation failed: ${error.message}`);
  log(`Suppliers created: ${suppliers.length}`);
}

// ─── STEP 10: CREATE COUPONS & ANNOUNCEMENTS ──────────────────────────────

async function createCouponsAndAnnouncements() {
  logStep(10, 'Create Coupons & Announcements');

  const now = new Date();
  const threeMonthsLater = new Date(now);
  threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

  const coupons = [
    {
      id: ID.couponBienvenue,
      tenant_id: ID.tenant,
      code: 'BIENVENUE10',
      discount_type: 'percentage',
      discount_value: 10,
      min_order_amount: 15000,
      max_discount_amount: 3000,
      valid_from: now.toISOString(),
      valid_until: threeMonthsLater.toISOString(),
      max_uses: 100,
      current_uses: 23,
      is_active: true,
    },
    {
      id: ID.couponEpicurien,
      tenant_id: ID.tenant,
      code: 'EPICURIEN20',
      discount_type: 'fixed',
      discount_value: 5000,
      min_order_amount: 30000,
      max_discount_amount: null,
      valid_from: now.toISOString(),
      valid_until: threeMonthsLater.toISOString(),
      max_uses: 50,
      current_uses: 8,
      is_active: true,
    },
  ];

  if (migrations.hasProductionUpgrade) {
    const { error: couponError } = await supabase.from('coupons').insert(coupons);
    if (couponError) throw new Error(`Coupons creation failed: ${couponError.message}`);
    log(`Coupons created: ${coupons.length}`);
  } else {
    log('Skipping coupons (production_upgrade migration not applied)');
  }

  // Announcements
  const nextFriday = new Date(now);
  nextFriday.setDate(nextFriday.getDate() + ((5 - nextFriday.getDay() + 7) % 7 || 7));
  const endOfYear = new Date(now.getFullYear(), 11, 31);

  const announcements = [
    {
      id: ID.annVendredi,
      tenant_id: ID.tenant,
      title: 'Vendredi grillades au feu de bois',
      description:
        'Chaque vendredi soir, brochettes, poissons braises et musique. Ambiance garantie, venez en famille.',
      start_date: nextFriday.toISOString(),
      end_date: endOfYear.toISOString(),
      is_active: true,
    },
    {
      id: ID.annDecouverte,
      tenant_id: ID.tenant,
      title: 'Menu decouverte du chef',
      description:
        'Trois plats a decouvrir chaque semaine: une entree, un plat en sauce et un dessert. 12 000 FCFA par personne.',
      start_date: now.toISOString(),
      end_date: null,
      is_active: true,
    },
  ];

  if (migrations.hasAnnouncements) {
    const { error: annError } = await supabase.from('announcements').insert(announcements);
    if (annError) throw new Error(`Announcements creation failed: ${annError.message}`);
    log(`Announcements created: ${announcements.length}`);
  } else {
    log('Skipping announcements (announcements table not available)');
  }
}

// ─── STEP 11: CREATE HISTORICAL ORDERS (90 days) ─────────────────────────

// Reference to a persisted order, used by the destock step (which replays
// destock_order for every order in the last 30 days) and revenue accounting.
interface OrderRef {
  id: string;
  createdAt: Date;
}

async function createHistoricalOrders(): Promise<OrderRef[]> {
  logStep(11, 'Create Historical Orders (90 days) + payments');

  const TAX_RATE = 19.25 / 100;
  const SERVICE_RATE = 10 / 100;

  // Cashier stamps the payment ledger (payments.created_by FK -> admin_users.id).
  const cashier = STAFF.find((s) => s.role === 'cashier');

  // Food items only (no wines) for typical orders
  const foodItems = MENU_ITEMS.filter((i) => !i.is_drink);
  const drinkItems = MENU_ITEMS.filter((i) => i.is_drink);
  const allOrderableItems = [...foodItems, ...drinkItems];

  // If zones/tables were skipped, use simple table numbers
  const tableNumbers =
    Object.keys(tableIds).length > 0
      ? Object.keys(tableIds)
      : ['T1', 'T2', 'T3', 'S1', 'S2', 'S3', 'S4', 'V1', 'V2'];
  const serviceTypes: Array<'dine_in' | 'takeaway' | 'delivery'> = [
    'dine_in',
    'dine_in',
    'dine_in',
    'dine_in',
    'takeaway',
    'delivery',
  ];
  const paymentMethods: Array<'cash' | 'card' | 'wave'> = ['cash', 'card', 'card', 'wave'];

  const today = new Date();
  const allOrders: Array<Record<string, unknown>> = [];
  const allOrderItems: Array<Record<string, unknown>> = [];
  const allPayments: Array<Record<string, unknown>> = [];
  const orderRefs: OrderRef[] = [];

  for (let daysAgo = 90; daysAgo >= 1; daysAgo--) {
    const day = new Date(today);
    day.setDate(day.getDate() - daysAgo);

    // Busy service: more covers on weekends. Sized so a typical day lands in the
    // ~150k-300k FCFA/day band (several million per month, well above the floor).
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const ordersThisDay = isWeekend ? randomInt(5, 8) : randomInt(3, 5);

    for (let o = 0; o < ordersThisDay; o++) {
      const orderId = randomUUID();
      const isLunch = o < ordersThisDay / 2;
      const orderTime = isLunch
        ? dateAtHour(day, randomInt(12, 13), 0, 59)
        : dateAtHour(day, randomInt(19, 21), 0, 59);

      const serviceType = randomPick(serviceTypes);
      const tableNum = randomPick(tableNumbers);
      const paymentMethod = randomPick(paymentMethods);

      // Pick 2-4 items
      const numItems = randomInt(2, 4);
      const selectedItems = randomPicks(allOrderableItems, numItems);

      let subtotal = 0;
      const orderItemRows: Array<Record<string, unknown>> = [];

      for (const item of selectedItems) {
        const qty = item.is_drink ? 1 : randomInt(1, 2);
        const lineTotal = item.price * qty;
        subtotal += lineTotal;

        const orderItemRow: Record<string, unknown> = {
          id: randomUUID(),
          order_id: orderId,
          menu_item_id: item.id,
          item_name: item.name,
          quantity: qty,
          price_at_order: item.price,
        };

        // Add columns that exist in the DB
        const oic = migrations.orderItemColumns;
        if (oic.has('item_name_en')) orderItemRow.item_name_en = item.name;
        if (oic.has('notes')) orderItemRow.notes = null;
        if (oic.has('customer_notes')) orderItemRow.customer_notes = null;
        if (oic.has('item_status')) orderItemRow.item_status = 'served';
        if (oic.has('course')) orderItemRow.course = item.course;
        if (oic.has('modifiers')) orderItemRow.modifiers = [];

        orderItemRows.push(orderItemRow);
      }

      const taxAmount = Math.round(subtotal * TAX_RATE);
      const serviceChargeAmount = Math.round(subtotal * SERVICE_RATE);

      // Apply coupon occasionally (~10%) - only if coupons table exists
      let discountAmount = 0;
      let couponId: string | null = null;
      if (migrations.hasProductionUpgrade && Math.random() < 0.1 && subtotal >= 15000) {
        if (subtotal >= 30000 && Math.random() < 0.5) {
          couponId = ID.couponEpicurien;
          discountAmount = 5000;
        } else {
          couponId = ID.couponBienvenue;
          discountAmount = Math.min(Math.round(subtotal * 0.1), 3000);
        }
      }

      const total = subtotal + taxAmount + serviceChargeAmount - discountAmount;

      // Occasional tip on dine-in, rounded to 500 FCFA. Integer minor units (XAF
      // has 0 decimals) - revenue = total + tip (see lib/orders/revenue.ts).
      const tipAmount =
        serviceType === 'dine_in' && Math.random() < 0.4
          ? Math.round((subtotal * 0.05) / 500) * 500
          : 0;

      const paidAt = new Date(orderTime);
      paidAt.setMinutes(paidAt.getMinutes() + randomInt(30, 90));

      const dateStr = orderTime.toISOString().slice(0, 10).replace(/-/g, '');
      const orderNumber = `CMD-${dateStr}-${String(o + 1).padStart(3, '0')}`;

      // Order base fields
      const orderRow: Record<string, unknown> = {
        id: orderId,
        tenant_id: ID.tenant,
        order_number: orderNumber,
        table_number: serviceType === 'dine_in' ? tableNum : null,
        status: 'delivered',
        total,
        customer_name: serviceType === 'delivery' ? `Client ${randomInt(1, 99)}` : null,
        customer_phone:
          serviceType === 'delivery'
            ? `+235 66 ${String(randomInt(10, 99))} ${String(randomInt(10, 99))} ${String(randomInt(10, 99))}`
            : null,
        created_at: orderTime.toISOString(),
      };

      // Add columns that exist in the DB (detected at startup)
      const oc = migrations.orderColumns;
      if (oc.has('subtotal')) orderRow.subtotal = subtotal;
      if (oc.has('tax_amount')) orderRow.tax_amount = taxAmount;
      if (oc.has('service_charge_amount')) orderRow.service_charge_amount = serviceChargeAmount;
      if (oc.has('discount_amount')) orderRow.discount_amount = discountAmount;
      if (oc.has('service_type')) orderRow.service_type = serviceType;
      if (oc.has('payment_method')) orderRow.payment_method = paymentMethod;
      if (oc.has('payment_status')) orderRow.payment_status = 'paid';
      if (oc.has('paid_at')) orderRow.paid_at = paidAt.toISOString();
      if (oc.has('tip_amount')) orderRow.tip_amount = tipAmount;
      if (oc.has('delivery_address')) {
        orderRow.delivery_address =
          serviceType === 'delivery' ? `Rue ${randomInt(1, 50)}, N'Djamena` : null;
      }
      // coupon_id FK only valid if coupons table exists
      if (oc.has('coupon_id') && migrations.hasProductionUpgrade && couponId) {
        orderRow.coupon_id = couponId;
      }

      allOrders.push(orderRow);
      allOrderItems.push(...orderItemRows);
      orderRefs.push({ id: orderId, createdAt: orderTime });

      // One completed tender per paid order (amount = order total, cashier-stamped).
      if (migrations.hasPayments) {
        allPayments.push({
          id: randomUUID(),
          tenant_id: ID.tenant,
          order_id: orderId,
          amount: total,
          method: paymentMethod,
          status: 'completed',
          created_by: cashier?.adminUserId ?? null,
          created_at: paidAt.toISOString(),
        });
      }
    }
  }

  // Insert in batches (Supabase has limits)
  const BATCH_SIZE = 100;

  for (let i = 0; i < allOrders.length; i += BATCH_SIZE) {
    const batch = allOrders.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('orders').insert(batch);
    if (error) throw new Error(`Historical orders batch ${i} failed: ${error.message}`);
  }
  log(`Historical orders created: ${allOrders.length}`);

  for (let i = 0; i < allOrderItems.length; i += BATCH_SIZE) {
    const batch = allOrderItems.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('order_items').insert(batch);
    if (error) throw new Error(`Historical order items batch ${i} failed: ${error.message}`);
  }
  log(`Historical order items created: ${allOrderItems.length}`);

  if (migrations.hasPayments && allPayments.length > 0) {
    for (let i = 0; i < allPayments.length; i += BATCH_SIZE) {
      const batch = allPayments.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('payments').insert(batch);
      if (error) throw new Error(`Historical payments batch ${i} failed: ${error.message}`);
    }
    log(`Payments created: ${allPayments.length}`);
  }

  return orderRefs;
}

// ─── STEP 12: CREATE LIVE ORDERS (Today) ─────────────────────────────────

async function createLiveOrders(): Promise<OrderRef[]> {
  logStep(12, 'Create Live Orders (Today) + open table sessions');

  const TAX_RATE = 19.25 / 100;
  const SERVICE_RATE = 10 / 100;
  const today = new Date();
  // If zones/tables were skipped, use simple table numbers
  const tableNumbers =
    Object.keys(tableIds).length > 0
      ? Object.keys(tableIds)
      : ['T1', 'T2', 'T3', 'S1', 'S2', 'S3', 'S4', 'V1', 'V2'];

  interface LiveOrderSpec {
    status: string;
    paymentStatus: string;
    count: number;
  }

  const liveSpecs: LiveOrderSpec[] = [
    { status: 'preparing', paymentStatus: 'pending', count: 5 },
    { status: 'ready', paymentStatus: 'pending', count: 3 },
    { status: 'pending', paymentStatus: 'pending', count: 2 },
  ];

  let seqNum = 1;
  const allOrderableItems = MENU_ITEMS.filter((i) => !i.is_drink);
  const liveRefs: OrderRef[] = [];
  // Open one check per table for the first few dine-in tables so the Service
  // floor shows occupied tables. Keyed by table_number (partial unique index
  // uniq_open_session_per_table = at most one open session per table).
  const sessionByTable = new Map<string, string>();
  const MAX_OPEN_SESSIONS = 3;

  for (const spec of liveSpecs) {
    for (let i = 0; i < spec.count; i++) {
      const orderId = randomUUID();
      const tableNum = tableNumbers[(seqNum - 1) % tableNumbers.length];
      const orderTime = dateAtHour(today, randomInt(12, 13), 0, 30);

      const numItems = randomInt(2, 3);
      const selectedItems = randomPicks(allOrderableItems, numItems);

      let subtotal = 0;
      const orderItemRows: Array<Record<string, unknown>> = [];

      for (const item of selectedItems) {
        const qty = randomInt(1, 2);
        subtotal += item.price * qty;

        const itemStatus =
          spec.status === 'pending'
            ? 'pending'
            : spec.status === 'preparing'
              ? randomPick(['pending', 'preparing'])
              : 'ready';

        const orderItemRow: Record<string, unknown> = {
          id: randomUUID(),
          order_id: orderId,
          menu_item_id: item.id,
          item_name: item.name,
          quantity: qty,
          price_at_order: item.price,
        };

        // Add columns that exist in the DB
        const oic = migrations.orderItemColumns;
        if (oic.has('item_name_en')) orderItemRow.item_name_en = item.name;
        if (oic.has('notes')) orderItemRow.notes = null;
        if (oic.has('customer_notes'))
          orderItemRow.customer_notes = i === 0 ? 'Sans gluten si possible' : null;
        if (oic.has('item_status')) orderItemRow.item_status = itemStatus;
        if (oic.has('course')) orderItemRow.course = item.course;
        if (oic.has('modifiers')) orderItemRow.modifiers = [];

        orderItemRows.push(orderItemRow);
      }

      const taxAmount = Math.round(subtotal * TAX_RATE);
      const serviceChargeAmount = Math.round(subtotal * SERVICE_RATE);
      const total = subtotal + taxAmount + serviceChargeAmount;

      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const orderNumber = `CMD-${dateStr}-${String(seqNum).padStart(3, '0')}`;

      // Order base fields
      const liveOrderRow: Record<string, unknown> = {
        id: orderId,
        tenant_id: ID.tenant,
        order_number: orderNumber,
        table_number: tableNum,
        status: spec.status,
        total,
        created_at: orderTime.toISOString(),
      };

      // Open (or reuse) a table session for the first few dine-in tables.
      if (
        migrations.hasTableSessions &&
        !sessionByTable.has(tableNum) &&
        sessionByTable.size < MAX_OPEN_SESSIONS
      ) {
        const sessionId = randomUUID();
        const { error: sessErr } = await supabase.from('table_sessions').insert({
          id: sessionId,
          tenant_id: ID.tenant,
          table_number: tableNum,
          status: 'open',
          opened_at: orderTime.toISOString(),
        });
        if (sessErr) throw new Error(`Table session failed: ${sessErr.message}`);
        sessionByTable.set(tableNum, sessionId);
      }

      // Add columns that exist in the DB
      const oc = migrations.orderColumns;
      if (oc.has('subtotal')) liveOrderRow.subtotal = subtotal;
      if (oc.has('tax_amount')) liveOrderRow.tax_amount = taxAmount;
      if (oc.has('service_charge_amount')) liveOrderRow.service_charge_amount = serviceChargeAmount;
      if (oc.has('discount_amount')) liveOrderRow.discount_amount = 0;
      if (oc.has('service_type')) liveOrderRow.service_type = 'dine_in';
      if (oc.has('payment_status')) liveOrderRow.payment_status = spec.paymentStatus;
      if (oc.has('session_id') && sessionByTable.has(tableNum)) {
        liveOrderRow.session_id = sessionByTable.get(tableNum);
      }

      const { error: orderErr } = await supabase.from('orders').insert(liveOrderRow);

      if (orderErr) throw new Error(`Live order failed: ${orderErr.message}`);

      const { error: itemErr } = await supabase.from('order_items').insert(orderItemRows);
      if (itemErr) throw new Error(`Live order items failed: ${itemErr.message}`);

      liveRefs.push({ id: orderId, createdAt: orderTime });
      seqNum++;
    }
  }

  log(`Live orders created: 10 (5 preparing, 3 ready, 2 pending)`);
  log(`Open table sessions: ${sessionByTable.size}`);
  return liveRefs;
}

// ─── STEP 13: REPLAY DESTOCK FOR RECENT + LIVE ORDERS ────────────────────
// destock_order books 'order_destock' ledger movements per recipe line (and
// flips menu items unavailable when an ingredient hits 0). Only the last 30
// days of history are replayed (older orders stay un-destocked to cap volume);
// live orders are always destocked. Each call stamps the chef (anti-vol).
async function destockRecentOrders(historical: OrderRef[], live: OrderRef[]) {
  logStep(13, 'Replay stock destock (recent + live orders)');

  const chef = STAFF.find((s) => s.role === 'chef');
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const toDestock = [...historical.filter((o) => o.createdAt >= cutoff), ...live];
  let done = 0;
  for (const ref of toDestock) {
    const { error } = await supabase.rpc('destock_order', {
      p_order_id: ref.id,
      p_tenant_id: ID.tenant,
      p_created_by: chef?.userId ?? undefined,
    });
    if (error) throw new Error(`Destock ${ref.id} failed: ${error.message}`);
    done++;
  }
  log(`Orders destocked: ${done} (last 30 days + live) -> order_destock ledger`);
}

// ─── STEP 14: RECORD STOCK LOSSES ────────────────────────────────────────
// record_loss_tx: reconcilable 'loss' movement carrying a reason_code. Covers
// the full reason vocabulary so the losses-by-reason report has data. Manager
// stamped (anti-vol). Only ingredients with cost_per_unit > 0 (all are).
async function recordLosses() {
  logStep(14, 'Record stock losses (record_loss_tx)');

  const manager = STAFF.find((s) => s.role === 'manager');
  const losses: Array<{ ingredient_id: string; quantity: number; reason: string; note: string }> = [
    {
      ingredient_id: ingId['tomate'],
      quantity: 3,
      reason: 'expired',
      note: 'Tomates trop mures (DLC depassee)',
    },
    {
      ingredient_id: ingId['tilapia'],
      quantity: 1.5,
      reason: 'spillage',
      note: 'Chute a la reception',
    },
    {
      ingredient_id: ingId['huile'],
      quantity: 1,
      reason: 'prep_waste',
      note: 'Fond de bidon perdu',
    },
    {
      ingredient_id: ingId['eau_bouteille'],
      quantity: 4,
      reason: 'breakage',
      note: 'Bouteilles cassees',
    },
    { ingredient_id: ingId['biere'], quantity: 6, reason: 'theft', note: 'Ecart de comptage bar' },
  ];

  for (const l of losses) {
    const { error } = await supabase.rpc('record_loss_tx', {
      p_tenant_id: ID.tenant,
      p_ingredient_id: l.ingredient_id,
      p_quantity: l.quantity,
      p_reason_code: l.reason,
      p_notes: l.note,
      p_created_by: manager?.userId ?? undefined,
    });
    if (error) throw new Error(`Loss (${l.reason}) failed: ${error.message}`);
  }
  log(`Losses recorded: ${losses.length} (expired/spillage/prep_waste/breakage/theft)`);
}

// ─── STEP 15: PHYSICAL STOCK COUNT (committed, with variance) ────────────
// open -> save counted quantities (one line deliberately off) -> commit. Commit
// books a 'physical_count' delta and closes the session, so exactly one count is
// left in 'committed' state (never 'open', which would block a re-run).
async function runPhysicalCount() {
  logStep(15, 'Physical stock count (open -> count -> commit)');

  const manager = STAFF.find((s) => s.role === 'manager');
  const ingredientIds = [ingId['boeuf'], ingId['poulet'], ingId['tilapia']];

  const { data: countId, error: openErr } = await supabase.rpc('open_stock_count', {
    p_tenant_id: ID.tenant,
    p_reference: 'Inventaire hebdomadaire',
    p_created_by: manager?.userId ?? null,
    p_ingredient_ids: ingredientIds,
  });
  if (openErr) throw new Error(`Open stock count failed: ${openErr.message}`);

  // Read the theoretical snapshot to enter counted quantities. Boeuf gets a
  // negative variance (physical < theoretical = shrinkage); the rest match.
  const { data: lines, error: linesErr } = await supabase
    .from('stock_count_lines')
    .select('ingredient_id, theoretical_qty')
    .eq('count_id', countId as string)
    .eq('tenant_id', ID.tenant);
  if (linesErr) throw new Error(`Load count lines failed: ${linesErr.message}`);

  const countedLines = (lines ?? []).map((ln) => {
    const theoretical = Number(ln.theoretical_qty);
    const counted =
      ln.ingredient_id === ingId['boeuf'] ? Math.max(0, theoretical - 2) : theoretical;
    return { ingredient_id: ln.ingredient_id as string, counted_qty: counted };
  });

  const { error: saveErr } = await supabase.rpc('save_stock_count_lines', {
    p_tenant_id: ID.tenant,
    p_count_id: countId as string,
    p_lines: countedLines,
  });
  if (saveErr) throw new Error(`Save count lines failed: ${saveErr.message}`);

  const { data: applied, error: commitErr } = await supabase.rpc('commit_stock_count', {
    p_tenant_id: ID.tenant,
    p_count_id: countId as string,
    p_committed_by: manager?.userId ?? null,
  });
  if (commitErr) throw new Error(`Commit stock count failed: ${commitErr.message}`);
  log(`Physical count committed: ${(applied as number) ?? 0} variance line(s) booked`);
}

// ─── STEP 16: ENGINEER LOW-STOCK ALERTS ──────────────────────────────────
// Guarantee the dashboard "stock alerts" widget has data: raise a couple of
// ingredients' min_stock_alert just above their post-destock current_stock so
// they read as below threshold. Plain threshold write (no ledger movement).
async function engineerLowStockAlerts() {
  logStep(16, 'Engineer low-stock alerts');

  // Spices (piment, gingembre) are the flagged low-stock items in the spec.
  const targets = [ingId['piment'], ingId['gingembre']];
  const { data: rows, error } = await supabase
    .from('ingredients')
    .select('id, name, current_stock')
    .eq('tenant_id', ID.tenant)
    .in('id', targets);
  if (error) throw new Error(`Load ingredients for alert failed: ${error.message}`);

  for (const row of rows ?? []) {
    const current = Number(row.current_stock);
    const threshold = Math.ceil(current) + 2; // strictly above current -> shows as low
    const { error: updErr } = await supabase
      .from('ingredients')
      .update({ min_stock_alert: threshold })
      .eq('id', row.id as string)
      .eq('tenant_id', ID.tenant);
    if (updErr) throw new Error(`Alert threshold update failed: ${updErr.message}`);
    log(`Low-stock alert set: ${row.name as string} (stock ${current} < min ${threshold})`);
  }
}

// ─── STEP 17: REVENUE SELF-CHECK ─────────────────────────────────────────
// Revenue = SUM(total + tip_amount) WHERE payment_status = 'paid'
// (src/lib/orders/revenue.ts). Assert the last 30 days clear the demo floor and
// log the calendar-month-to-date figure.
async function assertRevenueFloor() {
  logStep(17, 'Revenue self-check (paid, last 30 days)');

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const sumPaidGross = (rows: Array<{ total: number | null; tip_amount: number | null }>): number =>
    rows.reduce((sum, o) => sum + Number(o.total ?? 0) + Number(o.tip_amount ?? 0), 0);

  const { data: last30, error } = await supabase
    .from('orders')
    .select('total, tip_amount')
    .eq('tenant_id', ID.tenant)
    .eq('payment_status', 'paid')
    .gte('created_at', cutoff.toISOString());
  if (error) throw new Error(`Revenue query failed: ${error.message}`);
  const revenue30d = sumPaidGross(
    (last30 ?? []) as Array<{ total: number | null; tip_amount: number | null }>,
  );

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { data: month, error: monthErr } = await supabase
    .from('orders')
    .select('total, tip_amount')
    .eq('tenant_id', ID.tenant)
    .eq('payment_status', 'paid')
    .gte('created_at', monthStart.toISOString());
  if (monthErr) throw new Error(`Month revenue query failed: ${monthErr.message}`);
  const revenueMonth = sumPaidGross(
    (month ?? []) as Array<{ total: number | null; tip_amount: number | null }>,
  );

  log(`Paid revenue (last 30 days): ${revenue30d} FCFA`);
  log(`Paid revenue (month to date): ${revenueMonth} FCFA`);

  if (revenue30d < MONTHLY_REVENUE_FLOOR) {
    throw new Error(
      `Revenue self-check FAILED: 30-day paid revenue ${revenue30d} < floor ${MONTHLY_REVENUE_FLOOR}`,
    );
  }
  log(`Revenue floor OK (>= ${MONTHLY_REVENUE_FLOOR} FCFA)`);
}

// ─── SUMMARY ──────────────────────────────────────────────────────────────

function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log("  SEED COMPLETE: L'Epicurien Demo Data");
  console.log('='.repeat(60));
  console.log(`
  Tenant:         L'Epicurien (lepicurien)
  Tenant ID:      ${ID.tenant}
  Venue:          Salle Principale

  Users:          ${STAFF.length} (1 owner, 1 chef, 1 manager, 1 cashier, 2 waiters)
  Zones:          ${migrations.hasZones ? '3 (Terrasse, Salle, VIP)' : 'SKIPPED (table not available)'}
  Tables:         ${migrations.hasTables ? '15 (T1-T5, S1-S6, V1-V4)' : 'SKIPPED (table not available)'}
  Menu:           ${migrations.hasMenuHierarchy ? '1 (La Carte)' : 'SKIPPED (migration not applied)'}
  Categories:     ${CATEGORIES.length}
  Menu Items:     ${ITEMS.length} (photos: Wikimedia -> menu-items bucket)
  Ingredients:    ${migrations.hasInventoryEngine ? `${INGREDIENTS.length} (3 achetes au casier)` : 'SKIPPED (migration not applied)'}
  Recipes:        ${migrations.hasInventoryEngine ? `${RECIPES.length} (${RECIPE_LINE_COUNT} lignes)` : 'SKIPPED (migration not applied)'}
  Suppliers:      ${migrations.hasSuppliers ? '4' : 'SKIPPED (migration not applied)'}
  Stock:          ${migrations.hasInventoryEngine ? 'opening + receptions + destock + losses + physical count (ledger)' : 'SKIPPED'}
  Coupons:        ${migrations.hasProductionUpgrade ? '2' : 'SKIPPED (migration not applied)'}
  Announcements:  ${migrations.hasAnnouncements ? '2' : 'SKIPPED (table not available)'}
  Orders:         historical (90 days, all paid) + 10 live
  Payments:       ${migrations.hasPayments ? '1 tender per paid order' : 'SKIPPED'}

  Login Credentials (shared password: ${DEMO_PASSWORD}):
    Owner:    owner@demo.attabl.com     (Amadou Diallo)
    Chef:     chef@demo.attabl.com      (Fatime Hassan)
    Manager:  manager@demo.attabl.com   (Ousmane Kabore)
    Cashier:  caisse@demo.attabl.com    (Mariam Toure)
    Waiter1:  serveur1@demo.attabl.com  (Ali Mahamat)
    Waiter2:  serveur2@demo.attabl.com  (Aicha Ndiaye)

  URL (dev):  http://lepicurien.localhost:3000
  URL (prod): https://lepicurien.attabl.com
`);
  console.log('='.repeat(60));
}

// ─── MAIN ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log("  ATTABL SaaS - Demo Seed: L'Epicurien");
  console.log('='.repeat(60));
  console.log(`  Supabase URL: ${SUPABASE_URL}`);
  console.log(`  Timestamp:    ${new Date().toISOString()}\n`);

  try {
    migrations = await detectMigrations();
    await cleanup();
    await createTenant();
    await createUsers();
    await createVenue();
    if (migrations.hasZones && migrations.hasTables) {
      await createZonesAndTables();
    } else {
      logStep(4, 'Create Zones & Tables');
      log('Skipping zones/tables (tables not available in database)');
    }
    await createMenus();
    await createMenuItems();
    // Photos: best-effort, never aborts the seed.
    await createMenuItemPhotos();
    // Suppliers BEFORE ingredients: ingredient receptions attribute to a supplier.
    if (migrations.hasSuppliers) {
      await createSuppliers();
    } else {
      log('Skipping suppliers (suppliers migration not applied)');
    }
    if (migrations.hasInventoryEngine) {
      await createIngredients();
    } else {
      log('Skipping ingredients/recipes/opening stock (inventory_engine migration not applied)');
    }
    await createCouponsAndAnnouncements();

    const historicalRefs = await createHistoricalOrders();
    const liveRefs = await createLiveOrders();

    // Stock that "turns": replay destock over recent orders, then losses,
    // physical count, and the engineered low-stock alert. All ledger-correct.
    if (migrations.hasInventoryEngine) {
      await destockRecentOrders(historicalRefs, liveRefs);
      await recordLosses();
      if (migrations.hasStockCounts) {
        await runPhysicalCount();
      } else {
        log('Skipping physical count (stock_counts migration not applied)');
      }
      await engineerLowStockAlerts();
    } else {
      log('Skipping stock movements (inventory_engine migration not applied)');
    }

    await assertRevenueFloor();
    printSummary();
  } catch (err) {
    console.error('\n  SEED FAILED:', err);
    console.error('\n  The database may be in an inconsistent state.');
    console.error('  Run the script again to clean up and retry.\n');
    process.exit(1);
  }
}

main();
