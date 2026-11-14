import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

// Le layout rend StorefrontUnavailable pour une vitrine fermee, mais les pages
// enfants sont rendues EN PARALLELE: leur payload RSC (la carte entiere) partait
// quand meme au navigateur. Chaque page qui charge la carte doit donc relire la
// regle d'acces et ne rien lire, ni rien rendre, quand la vitrine est fermee.

const state = vi.hoisted(() => ({
  tenant: {} as Record<string, unknown>,
  from: vi.fn(),
  menuData: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next-intl/server', () => ({
  getMessages: async () => ({}),
  getLocale: async () => 'fr-FR',
  getTranslations: async () => (key: string) => key,
}));
vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/lib/supabase/server', () => {
  const result = { data: [], error: null };
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'order', 'limit']) {
    builder[m] = () => builder;
  }
  builder.then = (resolve: (v: typeof result) => unknown) => resolve(result);
  return {
    createClient: async () => ({
      from: (table: string) => {
        state.from(table);
        return builder;
      },
    }),
  };
});
vi.mock('@/lib/cache', () => ({
  getCachedTenant: async () => state.tenant,
  getCachedMenuData: (id: string) => state.menuData(id),
  getTableOccupied: async () => false,
  toPublicTenant: (t: unknown) => t,
}));
vi.mock('@/lib/billing/tenant-billing-ids', () => ({
  getTenantBillingIds: async () => ({ stripe_subscription_id: null }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/components/tenant/ClientMenuDetailPage', () => ({ default: () => null }));
vi.mock('@/components/tenant/client/HomeHeaderClient', () => ({ HomeHeaderClient: () => null }));
vi.mock('@/components/tenant/client/HomeItemsSection', () => ({ HomeItemsSection: () => null }));
vi.mock('@/components/tenant/client/HomeHero', () => ({ HomeHero: () => null }));
vi.mock('@/components/tenant/TableOccupiedNotice', () => ({ TableOccupiedNotice: () => null }));

const JOUR = 86_400_000;
const ilYa = (jours: number) => new Date(Date.now() - jours * JOUR).toISOString();

const VIDE = {
  venues: [],
  categories: [],
  menuItems: [],
  menus: [],
  transversalMenus: [],
  zones: [],
  tables: [],
};

async function renderHome() {
  const { default: HomePage } = await import('../page');
  return HomePage({
    params: Promise.resolve({ site: 'resto' }),
    searchParams: Promise.resolve({}),
  });
}

async function renderMenu() {
  const { default: MenuPage } = await import('../menu/page');
  return MenuPage({
    params: Promise.resolve({ site: 'resto' }),
    searchParams: Promise.resolve({}),
  });
}

function setTenant(extra: Record<string, unknown>) {
  state.tenant = {
    id: 't1',
    name: 'Resto',
    slug: 'resto',
    currency: 'XOF',
    opening_hours: null,
    is_active: true,
    suspended_at: null,
    subscription_status: 'active',
    ...extra,
  };
}

const FERMES: Array<[string, Record<string, unknown>]> = [
  ['suspendu', { suspended_at: ilYa(1) }],
  ['essai expire depuis 8 jours', { subscription_status: 'trial', trial_ends_at: ilYa(8) }],
  [
    'gele pour litige',
    { is_active: false, subscription_status: 'frozen', freeze_reason: 'dispute' },
  ],
];

describe('pages de la vitrine fermee: aucune donnee de carte', () => {
  beforeEach(() => {
    state.from.mockReset();
    state.menuData.mockReset();
    state.menuData.mockResolvedValue(VIDE);
  });

  for (const [cas, extra] of FERMES) {
    it(`${cas}: accueil et carte ne lisent rien et ne rendent rien`, async () => {
      setTenant(extra);
      expect(await renderHome()).toBeNull();
      expect(await renderMenu()).toBeNull();
      expect(state.from).not.toHaveBeenCalled();
      expect(state.menuData).not.toHaveBeenCalled();
    });
  }

  it('lecture seule (essai expire hier): la carte est servie', async () => {
    setTenant({ subscription_status: 'trial', trial_ends_at: ilYa(1) });
    expect(await renderHome()).not.toBeNull();
    expect(await renderMenu()).not.toBeNull();
    expect(state.from).toHaveBeenCalledWith('menu_items');
    expect(state.menuData).toHaveBeenCalledWith('t1');
  });

  it('restaurant qui sert: la carte est servie', async () => {
    setTenant({});
    expect(await renderMenu()).not.toBeNull();
    expect(state.menuData).toHaveBeenCalledWith('t1');
  });
});
