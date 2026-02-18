/**
 * ATTABL SaaS — Demo Seed Script
 * ================================
 * Populates the database with comprehensive demo data for "L'Epicurien",
 * a luxury restaurant in N'Djamena, Chad.
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
  // Column-level detection for orders (partially applied migrations)
  orderColumns: Set<string>; // which production_upgrade columns exist on orders
  orderItemColumns: Set<string>; // which production_upgrade columns exist on order_items
}

let migrations: MigrationStatus = {
  hasProductionUpgrade: false,
  hasMenuHierarchy: false,
  hasInventoryEngine: false,
  hasSuppliers: false,
  hasZones: false,
  hasTables: false,
  hasAnnouncements: false,
  orderColumns: new Set(),
  orderItemColumns: new Set(),
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

  const status: MigrationStatus = {
    hasProductionUpgrade: !tableChecks[0].error,
    hasMenuHierarchy: !tableChecks[1].error,
    hasInventoryEngine: !tableChecks[2].error,
    hasSuppliers: !tableChecks[3].error,
    hasZones: !tableChecks[4].error,
    hasTables: !tableChecks[5].error,
    hasAnnouncements: !tableChecks[6].error,
    orderColumns,
    orderItemColumns,
  };

  log(`Order columns available: ${[...orderColumns].join(', ') || 'base only'}`);
  log(`Order item columns available: ${[...orderItemColumns].join(', ') || 'base only'}`);

  // Log table/migration status (exclude Set fields)
  const boolEntries = Object.entries(status).filter(
    ([k]) => k !== 'orderColumns' && k !== 'orderItemColumns',
  );
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
const ID = {
  tenant: randomUUID(),
  venue: randomUUID(),
  // Zones
  zoneTerrasse: randomUUID(),
  zoneSalle: randomUUID(),
  zoneVIP: randomUUID(),
  // Menus
  menuDejeuner: randomUUID(),
  menuDiner: randomUUID(),
  menuVins: randomUUID(),
  // Categories
  catEntrees: randomUUID(),
  catPlats: randomUUID(),
  catPoissons: randomUUID(),
  catDesserts: randomUUID(),
  catEntreesDiner: randomUUID(),
  catPlatsDiner: randomUUID(),
  catPoissonsDiner: randomUUID(),
  catDessertsDiner: randomUUID(),
  catVinsRouges: randomUUID(),
  catVinsBlancs: randomUUID(),
  catChampagnes: randomUUID(),
  // Menu Items
  itemFoieGras: randomUUID(),
  itemTartareSaumon: randomUUID(),
  itemVelouteHomard: randomUUID(),
  itemCarpaccioBoeuf: randomUUID(),
  itemFiletRossini: randomUUID(),
  itemCarreAgneau: randomUUID(),
  itemMagretCanard: randomUUID(),
  itemSupremeVolaille: randomUUID(),
  itemBarRoti: randomUUID(),
  itemGambas: randomUUID(),
  itemPaveThon: randomUUID(),
  itemSoleMeuniere: randomUUID(),
  itemFondantChocolat: randomUUID(),
  itemCremeBrulee: randomUUID(),
  itemTarteTatin: randomUUID(),
  itemFromages: randomUUID(),
  itemChateauMargaux: randomUUID(),
  itemPomerolPetrus: randomUUID(),
  itemChablis: randomUUID(),
  itemSancerre: randomUUID(),
  itemDomPerignon: randomUUID(),
  itemVeuveClicquot: randomUUID(),
  // Ingredients
  ingBoeuf: randomUUID(),
  ingFoieGras: randomUUID(),
  ingAgneau: randomUUID(),
  ingCanard: randomUUID(),
  ingVolaille: randomUUID(),
  ingBar: randomUUID(),
  ingGambas: randomUUID(),
  ingThon: randomUUID(),
  ingSole: randomUUID(),
  ingSaumon: randomUUID(),
  ingHomard: randomUUID(),
  ingChocolat: randomUUID(),
  ingCreme: randomUUID(),
  ingBeurre: randomUUID(),
  ingMorilles: randomUUID(),
  // Suppliers
  supplierBoucherie: randomUUID(),
  supplierMaree: randomUUID(),
  supplierCave: randomUUID(),
  // Coupons
  couponBienvenue: randomUUID(),
  couponEpicurien: randomUUID(),
  // Announcements
  annJazz: randomUUID(),
  annDegustation: randomUUID(),
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

const STAFF: StaffMember[] = [
  {
    email: 'hellofrankalbert@gmail.com',
    password: 'Demo2024!',
    fullName: 'Frank Albert',
    role: 'owner',
    phone: '+235 66 00 00 00',
    isSuperAdmin: true,
  },
  {
    email: 'chef@lepicurien.com',
    password: 'Demo2024!',
    fullName: 'Chef Marco Rossi',
    role: 'chef',
    phone: '+235 66 10 10 10',
    isSuperAdmin: false,
  },
  {
    email: 'manager@lepicurien.com',
    password: 'Demo2024!',
    fullName: 'Sophie Dubois',
    role: 'manager',
    phone: '+235 66 20 20 20',
    isSuperAdmin: false,
  },
  {
    email: 'caisse@lepicurien.com',
    password: 'Demo2024!',
    fullName: 'Amadou Toure',
    role: 'cashier',
    phone: '+235 66 30 30 30',
    isSuperAdmin: false,
  },
  {
    email: 'serveur1@lepicurien.com',
    password: 'Demo2024!',
    fullName: 'Ibrahim Mahamat',
    role: 'waiter',
    phone: '+235 66 40 40 40',
    isSuperAdmin: false,
  },
  {
    email: 'serveur2@lepicurien.com',
    password: 'Demo2024!',
    fullName: 'Fatima Abdoulaye',
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
  console.log(`\n[${'='.repeat(step)}${' '.repeat(12 - step)}] Step ${step}/12: ${label}`);
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

function formatDate(d: Date): string {
  return d.toISOString();
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
  // Some tables may not exist if migrations haven't been applied — skip silently.
  const tablesToClean = [
    'stock_movements',
    'recipes',
    'item_suggestions',
    'ingredients',
    'suppliers',
    'order_items',
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
    subscription_plan: 'premium',
    subscription_status: 'active',
    onboarding_completed: true,
    establishment_type: 'restaurant',
    description: "Restaurant gastronomique d'exception",
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
  logStep(5, 'Create Menus & Categories');

  // Menus table only exists if menu_hierarchy migration was applied
  if (migrations.hasMenuHierarchy) {
    const menus = [
      {
        id: ID.menuDejeuner,
        tenant_id: ID.tenant,
        venue_id: ID.venue,
        name: 'Carte Dejeuner',
        name_en: 'Lunch Menu',
        slug: 'carte-dejeuner',
        description: 'Notre selection pour le dejeuner',
        description_en: 'Our lunch selection',
        is_active: true,
        display_order: 0,
      },
      {
        id: ID.menuDiner,
        tenant_id: ID.tenant,
        venue_id: ID.venue,
        name: 'Carte Diner',
        name_en: 'Dinner Menu',
        slug: 'carte-diner',
        description: 'Notre carte du soir',
        description_en: 'Our evening menu',
        is_active: true,
        display_order: 1,
      },
      {
        id: ID.menuVins,
        tenant_id: ID.tenant,
        venue_id: ID.venue,
        name: 'Carte des Vins',
        name_en: 'Wine List',
        slug: 'carte-des-vins',
        description: 'Vins et champagnes selectionnes',
        description_en: 'Selected wines and champagnes',
        is_active: true,
        display_order: 2,
      },
    ];

    const { error: menuError } = await supabase.from('menus').insert(menus);
    if (menuError) throw new Error(`Menus creation failed: ${menuError.message}`);
    log('Menus created: Dejeuner, Diner, Vins');
  } else {
    log('Skipping menus (menus table not available)');
  }

  // ─── Categories ──────────────────────────────────────────────────────────
  // menu_id column only exists if menu_hierarchy migration was applied
  const categories: Array<Record<string, unknown>> = [
    // Dejeuner categories
    {
      id: ID.catEntrees,
      tenant_id: ID.tenant,
      menu_id: ID.menuDejeuner,
      name: 'Entrees',
      name_en: 'Starters',
      display_order: 0,
    },
    {
      id: ID.catPlats,
      tenant_id: ID.tenant,
      menu_id: ID.menuDejeuner,
      name: 'Plats Signature',
      name_en: 'Signature Dishes',
      display_order: 1,
    },
    {
      id: ID.catPoissons,
      tenant_id: ID.tenant,
      menu_id: ID.menuDejeuner,
      name: 'Poissons & Fruits de Mer',
      name_en: 'Fish & Seafood',
      display_order: 2,
    },
    {
      id: ID.catDesserts,
      tenant_id: ID.tenant,
      menu_id: ID.menuDejeuner,
      name: 'Desserts',
      name_en: 'Desserts',
      display_order: 3,
    },
    // Diner categories (same structure, separate entities)
    {
      id: ID.catEntreesDiner,
      tenant_id: ID.tenant,
      menu_id: ID.menuDiner,
      name: 'Entrees',
      name_en: 'Starters',
      display_order: 0,
    },
    {
      id: ID.catPlatsDiner,
      tenant_id: ID.tenant,
      menu_id: ID.menuDiner,
      name: 'Plats Signature',
      name_en: 'Signature Dishes',
      display_order: 1,
    },
    {
      id: ID.catPoissonsDiner,
      tenant_id: ID.tenant,
      menu_id: ID.menuDiner,
      name: 'Poissons & Fruits de Mer',
      name_en: 'Fish & Seafood',
      display_order: 2,
    },
    {
      id: ID.catDessertsDiner,
      tenant_id: ID.tenant,
      menu_id: ID.menuDiner,
      name: 'Desserts',
      name_en: 'Desserts',
      display_order: 3,
    },
    // Wine categories
    {
      id: ID.catVinsRouges,
      tenant_id: ID.tenant,
      menu_id: ID.menuVins,
      name: 'Vins Rouges',
      name_en: 'Red Wines',
      display_order: 0,
    },
    {
      id: ID.catVinsBlancs,
      tenant_id: ID.tenant,
      menu_id: ID.menuVins,
      name: 'Vins Blancs',
      name_en: 'White Wines',
      display_order: 1,
    },
    {
      id: ID.catChampagnes,
      tenant_id: ID.tenant,
      menu_id: ID.menuVins,
      name: 'Champagnes',
      name_en: 'Champagnes',
      display_order: 2,
    },
  ];

  // Strip menu_id if menus table doesn't exist (menu_id column won't exist on categories)
  const categoryRows = migrations.hasMenuHierarchy
    ? categories
    : categories.map(({ menu_id: _, ...rest }) => rest);

  const { error: catError } = await supabase.from('categories').insert(categoryRows);
  if (catError) throw new Error(`Categories creation failed: ${catError.message}`);
  log(`Categories created: ${categoryRows.length}`);
}

// ─── STEP 6: CREATE MENU ITEMS ────────────────────────────────────────────

interface MenuItemDef {
  id: string;
  name: string;
  name_en: string;
  description: string;
  description_en: string;
  price: number;
  category_id: string;
  is_featured: boolean;
  is_drink: boolean;
  is_vegetarian: boolean;
  display_order: number;
  course: string | null;
}

const MENU_ITEMS: MenuItemDef[] = [
  // ─── Entrees ─────────────────────────────────────────────────────────────
  {
    id: ID.itemFoieGras,
    name: 'Foie Gras de Canard mi-cuit',
    name_en: 'Semi-cooked Duck Foie Gras',
    description: 'Foie gras de canard mi-cuit, chutney de figues et toasts brioches',
    description_en: 'Semi-cooked duck foie gras with fig chutney and brioche toast',
    price: 18000,
    category_id: ID.catEntrees,
    is_featured: false,
    is_drink: false,
    is_vegetarian: false,
    display_order: 0,
    course: 'appetizer',
  },
  {
    id: ID.itemTartareSaumon,
    name: 'Tartare de Saumon aux agrumes',
    name_en: 'Citrus Salmon Tartare',
    description: 'Saumon frais marine aux agrumes, avocat et creme citronnee',
    description_en: 'Fresh salmon marinated in citrus, avocado and lemon cream',
    price: 15000,
    category_id: ID.catEntrees,
    is_featured: false,
    is_drink: false,
    is_vegetarian: false,
    display_order: 1,
    course: 'appetizer',
  },
  {
    id: ID.itemVelouteHomard,
    name: 'Veloute de Homard au cognac',
    name_en: 'Lobster Bisque with Cognac',
    description: 'Veloute onctueux de homard flambe au cognac, quenelle de creme fouettee',
    description_en: 'Smooth lobster bisque flambeed with cognac, whipped cream quenelle',
    price: 16500,
    category_id: ID.catEntrees,
    is_featured: false,
    is_drink: false,
    is_vegetarian: false,
    display_order: 2,
    course: 'appetizer',
  },
  {
    id: ID.itemCarpaccioBoeuf,
    name: 'Carpaccio de Boeuf wagyu',
    name_en: 'Wagyu Beef Carpaccio',
    description: 'Fines tranches de boeuf wagyu, huile de truffe, parmesan et roquette',
    description_en: 'Thin slices of wagyu beef, truffle oil, parmesan and rocket',
    price: 22000,
    category_id: ID.catEntrees,
    is_featured: true,
    is_drink: false,
    is_vegetarian: false,
    display_order: 3,
    course: 'appetizer',
  },
  // ─── Plats Signature ────────────────────────────────────────────────────
  {
    id: ID.itemFiletRossini,
    name: 'Filet de Boeuf Rossini',
    name_en: 'Beef Fillet Rossini',
    description: 'Filet de boeuf grille, escalope de foie gras poele, sauce Perigueux aux truffes',
    description_en: 'Grilled beef fillet, pan-seared foie gras, Perigueux truffle sauce',
    price: 38000,
    category_id: ID.catPlats,
    is_featured: true,
    is_drink: false,
    is_vegetarian: false,
    display_order: 0,
    course: 'main',
  },
  {
    id: ID.itemCarreAgneau,
    name: "Carre d'Agneau en croute d'herbes",
    name_en: 'Herb-Crusted Rack of Lamb',
    description: "Carre d'agneau en croute d'herbes de Provence, jus d'agneau reduit",
    description_en: 'Rack of lamb in Provencal herb crust, reduced lamb jus',
    price: 32000,
    category_id: ID.catPlats,
    is_featured: true,
    is_drink: false,
    is_vegetarian: false,
    display_order: 1,
    course: 'main',
  },
  {
    id: ID.itemMagretCanard,
    name: 'Magret de Canard au miel et epices',
    name_en: 'Duck Breast with Honey and Spices',
    description: 'Magret de canard roti, glace au miel et epices douces, legumes de saison',
    description_en: 'Roasted duck breast, honey and sweet spice glaze, seasonal vegetables',
    price: 28000,
    category_id: ID.catPlats,
    is_featured: true,
    is_drink: false,
    is_vegetarian: false,
    display_order: 2,
    course: 'main',
  },
  {
    id: ID.itemSupremeVolaille,
    name: 'Supreme de Volaille farci aux morilles',
    name_en: 'Morel-Stuffed Chicken Supreme',
    description: 'Supreme de volaille farci aux morilles, sauce creme a la truffe',
    description_en: 'Chicken supreme stuffed with morels, truffle cream sauce',
    price: 26000,
    category_id: ID.catPlats,
    is_featured: false,
    is_drink: false,
    is_vegetarian: false,
    display_order: 3,
    course: 'main',
  },
  // ─── Poissons & Fruits de Mer ───────────────────────────────────────────
  {
    id: ID.itemBarRoti,
    name: 'Bar roti, beurre blanc au citron',
    name_en: 'Roasted Sea Bass, Lemon Beurre Blanc',
    description: 'Bar de ligne roti, beurre blanc citron, ecrasee de pommes de terre',
    description_en: 'Line-caught roasted sea bass, lemon butter sauce, crushed potatoes',
    price: 30000,
    category_id: ID.catPoissons,
    is_featured: false,
    is_drink: false,
    is_vegetarian: false,
    display_order: 0,
    course: 'main',
  },
  {
    id: ID.itemGambas,
    name: 'Gambas flambees au Pastis',
    name_en: 'Pastis-Flambeed King Prawns',
    description: 'Gambas geantes flambees au Pastis, risotto cremeaux aux herbes',
    description_en: 'Giant king prawns flambeed with Pastis, creamy herb risotto',
    price: 35000,
    category_id: ID.catPoissons,
    is_featured: true,
    is_drink: false,
    is_vegetarian: false,
    display_order: 1,
    course: 'main',
  },
  {
    id: ID.itemPaveThon,
    name: 'Pave de Thon mi-cuit, sesame',
    name_en: 'Sesame-Crusted Tuna Steak',
    description: 'Pave de thon rouge mi-cuit en croute de sesame, sauce soja yuzu',
    description_en: 'Semi-cooked bluefin tuna steak, sesame crust, yuzu soy sauce',
    price: 27000,
    category_id: ID.catPoissons,
    is_featured: false,
    is_drink: false,
    is_vegetarian: false,
    display_order: 2,
    course: 'main',
  },
  {
    id: ID.itemSoleMeuniere,
    name: 'Sole meuniere, pommes grenaille',
    name_en: 'Sole Meuniere with Baby Potatoes',
    description: 'Sole entiere meuniere au beurre noisette, pommes grenaille et capres',
    description_en: 'Whole sole meuniere in brown butter, baby potatoes and capers',
    price: 34000,
    category_id: ID.catPoissons,
    is_featured: false,
    is_drink: false,
    is_vegetarian: false,
    display_order: 3,
    course: 'main',
  },
  // ─── Desserts ───────────────────────────────────────────────────────────
  {
    id: ID.itemFondantChocolat,
    name: 'Fondant au chocolat Valrhona',
    name_en: 'Valrhona Chocolate Fondant',
    description: 'Fondant au chocolat Valrhona 70%, coeur coulant, glace vanille',
    description_en: 'Valrhona 70% chocolate fondant, molten center, vanilla ice cream',
    price: 12000,
    category_id: ID.catDesserts,
    is_featured: false,
    is_drink: false,
    is_vegetarian: true,
    display_order: 0,
    course: 'dessert',
  },
  {
    id: ID.itemCremeBrulee,
    name: 'Creme brulee a la vanille Bourbon',
    name_en: 'Bourbon Vanilla Creme Brulee',
    description: 'Creme brulee onctueuse parfumee a la vanille Bourbon de Madagascar',
    description_en: 'Smooth creme brulee infused with Madagascar Bourbon vanilla',
    price: 10000,
    category_id: ID.catDesserts,
    is_featured: false,
    is_drink: false,
    is_vegetarian: true,
    display_order: 1,
    course: 'dessert',
  },
  {
    id: ID.itemTarteTatin,
    name: 'Tarte Tatin aux pommes',
    name_en: 'Apple Tarte Tatin',
    description: 'Tarte Tatin caramelisee, pommes fondantes, creme fraiche epaisse',
    description_en: 'Caramelized apple tarte Tatin, tender apples, thick fresh cream',
    price: 11000,
    category_id: ID.catDesserts,
    is_featured: false,
    is_drink: false,
    is_vegetarian: true,
    display_order: 2,
    course: 'dessert',
  },
  {
    id: ID.itemFromages,
    name: 'Assiette de fromages affines',
    name_en: 'Artisan Cheese Platter',
    description: 'Selection de fromages affines, confiture de cerises noires et noix',
    description_en: 'Selection of artisan cheeses, black cherry jam and walnuts',
    price: 14000,
    category_id: ID.catDesserts,
    is_featured: false,
    is_drink: false,
    is_vegetarian: true,
    display_order: 3,
    course: 'dessert',
  },
  // ─── Vins Rouges ────────────────────────────────────────────────────────
  {
    id: ID.itemChateauMargaux,
    name: 'Chateau Margaux 2015',
    name_en: 'Chateau Margaux 2015',
    description: 'Premier Grand Cru Classe, Margaux. Notes de cassis, violette et cedre',
    description_en: 'Premier Grand Cru Classe, Margaux. Blackcurrant, violet and cedar notes',
    price: 180000,
    category_id: ID.catVinsRouges,
    is_featured: false,
    is_drink: true,
    is_vegetarian: false,
    display_order: 0,
    course: 'drink',
  },
  {
    id: ID.itemPomerolPetrus,
    name: 'Pomerol Petrus 2012',
    name_en: 'Pomerol Petrus 2012',
    description: "Merlot d'exception de Pomerol. Truffe, prune confite et velours en bouche",
    description_en: 'Exceptional Pomerol Merlot. Truffle, candied plum and velvety palate',
    price: 450000,
    category_id: ID.catVinsRouges,
    is_featured: true,
    is_drink: true,
    is_vegetarian: false,
    display_order: 1,
    course: 'drink',
  },
  // ─── Vins Blancs ────────────────────────────────────────────────────────
  {
    id: ID.itemChablis,
    name: 'Chablis Premier Cru 2019',
    name_en: 'Chablis Premier Cru 2019',
    description: 'Bourgogne mineralite et fraicheur. Agrumes, silex et fleurs blanches',
    description_en: 'Burgundy minerality and freshness. Citrus, flint and white flowers',
    price: 65000,
    category_id: ID.catVinsBlancs,
    is_featured: false,
    is_drink: true,
    is_vegetarian: false,
    display_order: 0,
    course: 'drink',
  },
  {
    id: ID.itemSancerre,
    name: 'Sancerre Domaine Vacheron',
    name_en: 'Sancerre Domaine Vacheron',
    description: 'Sauvignon Blanc de Loire. Vif et elegant, notes de pamplemousse et buis',
    description_en: 'Loire Valley Sauvignon Blanc. Crisp and elegant, grapefruit and boxwood',
    price: 48000,
    category_id: ID.catVinsBlancs,
    is_featured: false,
    is_drink: true,
    is_vegetarian: false,
    display_order: 1,
    course: 'drink',
  },
  // ─── Champagnes ─────────────────────────────────────────────────────────
  {
    id: ID.itemDomPerignon,
    name: 'Dom Perignon 2013',
    name_en: 'Dom Perignon 2013',
    description: 'Cuvee prestige Moet & Chandon. Complexe et minerale, finale interminable',
    description_en: 'Prestige cuvee by Moet & Chandon. Complex, mineral, endless finish',
    price: 280000,
    category_id: ID.catChampagnes,
    is_featured: true,
    is_drink: true,
    is_vegetarian: false,
    display_order: 0,
    course: 'drink',
  },
  {
    id: ID.itemVeuveClicquot,
    name: 'Veuve Clicquot Brut',
    name_en: 'Veuve Clicquot Brut',
    description: 'Champagne Brut classique. Bulles fines, fruit et biscuit',
    description_en: 'Classic Brut Champagne. Fine bubbles, fruit and biscuit notes',
    price: 95000,
    category_id: ID.catChampagnes,
    is_featured: false,
    is_drink: true,
    is_vegetarian: false,
    display_order: 1,
    course: 'drink',
  },
];

async function createMenuItems() {
  logStep(6, 'Create Menu Items');

  const rows = MENU_ITEMS.map((item) => ({
    id: item.id,
    tenant_id: ID.tenant,
    name: item.name,
    name_en: item.name_en,
    description: item.description,
    description_en: item.description_en,
    price: item.price,
    category_id: item.category_id,
    is_available: true,
    is_featured: item.is_featured,
  }));

  const { error } = await supabase.from('menu_items').insert(rows);
  if (error) throw new Error(`Menu items creation failed: ${error.message}`);
  log(`Menu items created: ${rows.length}`);
}

// ─── STEP 7: CREATE INGREDIENTS ───────────────────────────────────────────

async function createIngredients() {
  logStep(7, 'Create Ingredients & Recipes');

  const ingredients = [
    {
      id: ID.ingBoeuf,
      name: 'Viande boeuf',
      unit: 'kg',
      current_stock: 25,
      min_stock_alert: 5,
      cost_per_unit: 15000,
      category: 'Viandes',
    },
    {
      id: ID.ingFoieGras,
      name: 'Foie gras',
      unit: 'kg',
      current_stock: 3,
      min_stock_alert: 1,
      cost_per_unit: 45000,
      category: 'Viandes',
    },
    {
      id: ID.ingAgneau,
      name: 'Agneau',
      unit: 'kg',
      current_stock: 12,
      min_stock_alert: 3,
      cost_per_unit: 18000,
      category: 'Viandes',
    },
    {
      id: ID.ingCanard,
      name: 'Canard magret',
      unit: 'kg',
      current_stock: 8,
      min_stock_alert: 2,
      cost_per_unit: 12000,
      category: 'Viandes',
    },
    {
      id: ID.ingVolaille,
      name: 'Volaille',
      unit: 'kg',
      current_stock: 15,
      min_stock_alert: 4,
      cost_per_unit: 5000,
      category: 'Viandes',
    },
    {
      id: ID.ingBar,
      name: 'Bar',
      unit: 'kg',
      current_stock: 10,
      min_stock_alert: 3,
      cost_per_unit: 20000,
      category: 'Poissons',
    },
    {
      id: ID.ingGambas,
      name: 'Gambas',
      unit: 'kg',
      current_stock: 5,
      min_stock_alert: 2,
      cost_per_unit: 25000,
      category: 'Poissons',
    },
    {
      id: ID.ingThon,
      name: 'Thon',
      unit: 'kg',
      current_stock: 8,
      min_stock_alert: 2,
      cost_per_unit: 18000,
      category: 'Poissons',
    },
    {
      id: ID.ingSole,
      name: 'Sole',
      unit: 'kg',
      current_stock: 6,
      min_stock_alert: 2,
      cost_per_unit: 22000,
      category: 'Poissons',
    },
    {
      id: ID.ingSaumon,
      name: 'Saumon',
      unit: 'kg',
      current_stock: 7,
      min_stock_alert: 2,
      cost_per_unit: 16000,
      category: 'Poissons',
    },
    {
      id: ID.ingHomard,
      name: 'Homard',
      unit: 'kg',
      current_stock: 4,
      min_stock_alert: 1,
      cost_per_unit: 35000,
      category: 'Poissons',
    },
    {
      id: ID.ingChocolat,
      name: 'Chocolat Valrhona',
      unit: 'kg',
      current_stock: 5,
      min_stock_alert: 1,
      cost_per_unit: 8000,
      category: 'Epicerie',
    },
    {
      id: ID.ingCreme,
      name: 'Creme fraiche',
      unit: 'L',
      current_stock: 20,
      min_stock_alert: 5,
      cost_per_unit: 3000,
      category: 'Produits laitiers',
    },
    {
      id: ID.ingBeurre,
      name: 'Beurre',
      unit: 'kg',
      current_stock: 10,
      min_stock_alert: 3,
      cost_per_unit: 4000,
      category: 'Produits laitiers',
    },
    {
      id: ID.ingMorilles,
      name: 'Morilles',
      unit: 'kg',
      current_stock: 2,
      min_stock_alert: 0.5,
      cost_per_unit: 60000,
      category: 'Champignons',
    },
  ];

  const rows = ingredients.map((ing) => ({
    ...ing,
    tenant_id: ID.tenant,
    is_active: true,
  }));

  const { error: ingError } = await supabase.from('ingredients').insert(rows);
  if (ingError) throw new Error(`Ingredients creation failed: ${ingError.message}`);
  log(`Ingredients created: ${ingredients.length}`);

  // ─── Recipes (Fiches techniques) ─────────────────────────────────────────
  const recipes = [
    // Filet de Boeuf Rossini
    {
      menu_item_id: ID.itemFiletRossini,
      ingredient_id: ID.ingBoeuf,
      quantity_needed: 0.25,
      notes: 'Filet centre',
    },
    {
      menu_item_id: ID.itemFiletRossini,
      ingredient_id: ID.ingFoieGras,
      quantity_needed: 0.05,
      notes: 'Escalope poilee',
    },
    {
      menu_item_id: ID.itemFiletRossini,
      ingredient_id: ID.ingBeurre,
      quantity_needed: 0.03,
      notes: 'Sauce Perigueux',
    },
    // Carre d'Agneau
    {
      menu_item_id: ID.itemCarreAgneau,
      ingredient_id: ID.ingAgneau,
      quantity_needed: 0.3,
      notes: 'Carre 4 cotes',
    },
    {
      menu_item_id: ID.itemCarreAgneau,
      ingredient_id: ID.ingBeurre,
      quantity_needed: 0.02,
      notes: 'Cuisson et jus',
    },
    // Magret de Canard
    {
      menu_item_id: ID.itemMagretCanard,
      ingredient_id: ID.ingCanard,
      quantity_needed: 0.35,
      notes: 'Magret entier',
    },
    {
      menu_item_id: ID.itemMagretCanard,
      ingredient_id: ID.ingBeurre,
      quantity_needed: 0.02,
      notes: 'Glace au miel',
    },
    // Supreme de Volaille
    {
      menu_item_id: ID.itemSupremeVolaille,
      ingredient_id: ID.ingVolaille,
      quantity_needed: 0.25,
      notes: 'Supreme desosse',
    },
    {
      menu_item_id: ID.itemSupremeVolaille,
      ingredient_id: ID.ingMorilles,
      quantity_needed: 0.03,
      notes: 'Farce morilles',
    },
    {
      menu_item_id: ID.itemSupremeVolaille,
      ingredient_id: ID.ingCreme,
      quantity_needed: 0.05,
      notes: 'Sauce creme',
    },
    // Gambas flambees
    {
      menu_item_id: ID.itemGambas,
      ingredient_id: ID.ingGambas,
      quantity_needed: 0.25,
      notes: 'Gambas geantes x4',
    },
    {
      menu_item_id: ID.itemGambas,
      ingredient_id: ID.ingBeurre,
      quantity_needed: 0.03,
      notes: 'Flambage et cuisson',
    },
  ];

  const recipeRows = recipes.map((r) => ({
    id: randomUUID(),
    tenant_id: ID.tenant,
    ...r,
  }));

  const { error: recipeError } = await supabase.from('recipes').insert(recipeRows);
  if (recipeError) throw new Error(`Recipes creation failed: ${recipeError.message}`);
  log(`Recipes created: ${recipeRows.length}`);
}

// ─── STEP 8: CREATE SUPPLIERS ─────────────────────────────────────────────

async function createSuppliers() {
  logStep(8, 'Create Suppliers');

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
      id: ID.supplierCave,
      tenant_id: ID.tenant,
      name: 'Cave du Sommelier',
      contact_name: 'Antoine Lefebvre',
      phone: '+235 66 33 33 33',
      email: 'cave@sommelier.td',
      address: "Avenue Mobutu, N'Djamena",
      notes: 'Importation directe Bordeaux et Champagne. Stockage temperature controlee.',
      is_active: true,
    },
  ];

  const { error } = await supabase.from('suppliers').insert(suppliers);
  if (error) throw new Error(`Suppliers creation failed: ${error.message}`);
  log(`Suppliers created: ${suppliers.length}`);
}

// ─── STEP 9: CREATE COUPONS & ANNOUNCEMENTS ──────────────────────────────

async function createCouponsAndAnnouncements() {
  logStep(9, 'Create Coupons & Announcements');

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
      min_order_amount: 50000,
      max_discount_amount: 15000,
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
      discount_value: 20000,
      min_order_amount: 100000,
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
      id: ID.annJazz,
      tenant_id: ID.tenant,
      title: 'Soiree Jazz & Gastronomie',
      description:
        'Chaque vendredi soir, profitez de notre menu gastronomique accompagne de jazz live. Reservation recommandee.',
      start_date: nextFriday.toISOString(),
      end_date: endOfYear.toISOString(),
      is_active: true,
    },
    {
      id: ID.annDegustation,
      tenant_id: ID.tenant,
      title: 'Menu Degustation Decouverte',
      description:
        'Menu degustation en 5 services avec accords mets & vins. 85 000 XAF par personne. Sur reservation uniquement.',
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

// ─── STEP 10: CREATE HISTORICAL ORDERS (90 days) ─────────────────────────

async function createHistoricalOrders() {
  logStep(10, 'Create Historical Orders (~300 over 90 days)');

  const TAX_RATE = 19.25 / 100;
  const SERVICE_RATE = 10 / 100;

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
  const paymentMethods: Array<'cash' | 'card' | 'mobile_money'> = [
    'cash',
    'card',
    'card',
    'mobile_money',
  ];

  const today = new Date();
  const allOrders: Array<Record<string, unknown>> = [];
  const allOrderItems: Array<Record<string, unknown>> = [];

  for (let daysAgo = 90; daysAgo >= 1; daysAgo--) {
    const day = new Date(today);
    day.setDate(day.getDate() - daysAgo);

    // 3-4 orders per day, more on weekends
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const ordersThisDay = isWeekend ? randomInt(4, 6) : randomInt(2, 4);

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
        if (oic.has('item_name_en')) orderItemRow.item_name_en = item.name_en;
        if (oic.has('notes')) orderItemRow.notes = null;
        if (oic.has('customer_notes')) orderItemRow.customer_notes = null;
        if (oic.has('item_status')) orderItemRow.item_status = 'served';
        if (oic.has('course')) orderItemRow.course = item.course;
        if (oic.has('modifiers')) orderItemRow.modifiers = [];

        orderItemRows.push(orderItemRow);
      }

      const taxAmount = Math.round(subtotal * TAX_RATE);
      const serviceChargeAmount = Math.round(subtotal * SERVICE_RATE);

      // Apply coupon occasionally (~10%) — only if coupons table exists
      let discountAmount = 0;
      let couponId: string | null = null;
      if (migrations.hasProductionUpgrade && Math.random() < 0.1 && subtotal >= 50000) {
        if (subtotal >= 100000 && Math.random() < 0.5) {
          couponId = ID.couponEpicurien;
          discountAmount = 20000;
        } else {
          couponId = ID.couponBienvenue;
          discountAmount = Math.min(Math.round(subtotal * 0.1), 15000);
        }
      }

      const total = subtotal + taxAmount + serviceChargeAmount - discountAmount;

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
}

// ─── STEP 11: CREATE LIVE ORDERS (Today) ─────────────────────────────────

async function createLiveOrders() {
  logStep(11, 'Create Live Orders (Today)');

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
        if (oic.has('item_name_en')) orderItemRow.item_name_en = item.name_en;
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

      // Add columns that exist in the DB
      const oc = migrations.orderColumns;
      if (oc.has('subtotal')) liveOrderRow.subtotal = subtotal;
      if (oc.has('tax_amount')) liveOrderRow.tax_amount = taxAmount;
      if (oc.has('service_charge_amount')) liveOrderRow.service_charge_amount = serviceChargeAmount;
      if (oc.has('discount_amount')) liveOrderRow.discount_amount = 0;
      if (oc.has('service_type')) liveOrderRow.service_type = 'dine_in';
      if (oc.has('payment_status')) liveOrderRow.payment_status = spec.paymentStatus;

      const { error: orderErr } = await supabase.from('orders').insert(liveOrderRow);

      if (orderErr) throw new Error(`Live order failed: ${orderErr.message}`);

      const { error: itemErr } = await supabase.from('order_items').insert(orderItemRows);
      if (itemErr) throw new Error(`Live order items failed: ${itemErr.message}`);

      seqNum++;
    }
  }

  log(`Live orders created: 10 (5 preparing, 3 ready, 2 pending)`);
}

// ─── STEP 12: CREATE STOCK MOVEMENTS (Opening stock) ─────────────────────

async function createStockMovements() {
  logStep(12, 'Create Stock Movements (Opening Stock)');

  const owner = STAFF.find((s) => s.role === 'owner');

  const ingredients = [
    { id: ID.ingBoeuf, stock: 25 },
    { id: ID.ingFoieGras, stock: 3 },
    { id: ID.ingAgneau, stock: 12 },
    { id: ID.ingCanard, stock: 8 },
    { id: ID.ingVolaille, stock: 15 },
    { id: ID.ingBar, stock: 10 },
    { id: ID.ingGambas, stock: 5 },
    { id: ID.ingThon, stock: 8 },
    { id: ID.ingSole, stock: 6 },
    { id: ID.ingSaumon, stock: 7 },
    { id: ID.ingHomard, stock: 4 },
    { id: ID.ingChocolat, stock: 5 },
    { id: ID.ingCreme, stock: 20 },
    { id: ID.ingBeurre, stock: 10 },
    { id: ID.ingMorilles, stock: 2 },
  ];

  const movements = ingredients.map((ing) => {
    const row: Record<string, unknown> = {
      id: randomUUID(),
      tenant_id: ID.tenant,
      ingredient_id: ing.id,
      movement_type: 'opening',
      quantity: ing.stock,
      reference_id: null,
      notes: "Stock d'ouverture",
      created_by: owner?.adminUserId || null,
      created_at: new Date().toISOString(),
    };
    if (migrations.hasSuppliers) {
      row.supplier_id = null;
    }
    return row;
  });

  const { error } = await supabase.from('stock_movements').insert(movements);
  if (error) throw new Error(`Stock movements creation failed: ${error.message}`);
  log(`Stock movements created: ${movements.length} (opening stock entries)`);
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
  Menus:          ${migrations.hasMenuHierarchy ? '3 (Dejeuner, Diner, Vins)' : 'SKIPPED (migration not applied)'}
  Categories:     11
  Menu Items:     ${MENU_ITEMS.length}
  Ingredients:    ${migrations.hasInventoryEngine ? '15' : 'SKIPPED (migration not applied)'}
  Recipes:        ${migrations.hasInventoryEngine ? '12' : 'SKIPPED (migration not applied)'}
  Suppliers:      ${migrations.hasSuppliers ? '3' : 'SKIPPED (migration not applied)'}
  Coupons:        ${migrations.hasProductionUpgrade ? '2' : 'SKIPPED (migration not applied)'}
  Announcements:  ${migrations.hasAnnouncements ? '2' : 'SKIPPED (table not available)'}
  Orders:         ~310 (300 historical + 10 live)

  Login Credentials:
    Owner:    hellofrankalbert@gmail.com / Demo2024!
    Chef:     chef@lepicurien.com / Demo2024!
    Manager:  manager@lepicurien.com / Demo2024!
    Cashier:  caisse@lepicurien.com / Demo2024!
    Waiter1:  serveur1@lepicurien.com / Demo2024!
    Waiter2:  serveur2@lepicurien.com / Demo2024!

  URL (dev):  http://lepicurien.localhost:3000
  URL (prod): https://lepicurien.attabl.com
`);
  console.log('='.repeat(60));
}

// ─── MAIN ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log("  ATTABL SaaS — Demo Seed: L'Epicurien");
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
    if (migrations.hasInventoryEngine) {
      await createIngredients();
    } else {
      log('Skipping ingredients/recipes (inventory_engine migration not applied)');
    }
    if (migrations.hasSuppliers) {
      await createSuppliers();
    } else {
      log('Skipping suppliers (suppliers migration not applied)');
    }
    await createCouponsAndAnnouncements();
    await createHistoricalOrders();
    await createLiveOrders();
    if (migrations.hasInventoryEngine) {
      await createStockMovements();
    } else {
      log('Skipping stock movements (inventory_engine migration not applied)');
    }
    printSummary();
  } catch (err) {
    console.error('\n  SEED FAILED:', err);
    console.error('\n  The database may be in an inconsistent state.');
    console.error('  Run the script again to clean up and retry.\n');
    process.exit(1);
  }
}

main();
