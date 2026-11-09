import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';

// Fin d'essai sans abonnement (decision produit du 2026-11-09): le bandeau de
// gel de l'admin dit combien de jours la carte reste visible. Ce test verifie
// le BRANCHEMENT du layout: le nombre calcule par `menuVisibleDaysLeftForTenant`
// (regle testee dans lib/billing) arrive bien jusqu'a `SubscriptionBanners`.

const state = vi.hoisted(() => ({
  tenant: {} as Record<string, unknown>,
  billing: vi.fn(),
}));

// Composants du shell: remplaces par des doublures nommees. Le layout est
// appele comme une fonction, son arbre est inspecte sans rendu.
const stub = (name: string) => {
  const C = ({ children }: { children?: ReactNode }) => children ?? null;
  Object.defineProperty(C, 'name', { value: name });
  return C;
};

vi.mock('@/components/admin/SubscriptionBanners', () => ({
  SubscriptionBanners: stub('SubscriptionBanners'),
}));
vi.mock('@/components/admin/AdminLayoutClient', () => ({
  AdminLayoutClient: stub('AdminLayoutClient'),
}));
vi.mock('@/contexts/SubscriptionContext', () => ({
  SubscriptionProvider: stub('SubscriptionProvider'),
}));
vi.mock('@/contexts/PermissionsContext', () => ({
  PermissionsProvider: stub('PermissionsProvider'),
}));
vi.mock('@/components/admin/AdminIdleWrapper', () => ({
  AdminIdleWrapper: stub('AdminIdleWrapper'),
}));
vi.mock('@/components/providers/QueryProvider', () => ({
  QueryProvider: stub('QueryProvider'),
}));
vi.mock('@/components/admin/OfflineIndicator', () => ({
  OfflineIndicator: stub('OfflineIndicator'),
}));
vi.mock('@/components/shared/OutboxIdentity', () => ({
  OutboxIdentity: stub('OutboxIdentity'),
}));
vi.mock('@/components/features/command-palette/CommandPalette', () => ({
  CommandPalette: stub('CommandPalette'),
}));
vi.mock('@/contexts/ShortcutsContext', () => ({
  ShortcutsProvider: stub('ShortcutsProvider'),
}));
vi.mock('@/components/admin/AdminBreadcrumbs', () => ({
  AdminBreadcrumbs: stub('AdminBreadcrumbs'),
}));
vi.mock('@/components/admin/NotificationCenter', () => ({
  NotificationCenter: stub('NotificationCenter'),
}));
vi.mock('@/components/admin/AdminContentWrapper', () => ({
  AdminContentWrapper: stub('AdminContentWrapper'),
}));
vi.mock('@/components/admin/OnboardingResumeDialog', () => ({
  OnboardingResumeDialog: stub('OnboardingResumeDialog'),
}));
vi.mock('@/contexts/SoundContext', () => ({ SoundProvider: stub('SoundProvider') }));
vi.mock('@/components/admin/LockedSubscriptionRedirect', () => ({
  LockedSubscriptionRedirect: stub('LockedSubscriptionRedirect'),
}));
vi.mock('@/lib/app-version', () => ({ APP_VERSION: 'test' }));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/cache', () => ({ getTenant: async () => state.tenant }));
vi.mock('@/lib/auth/redirect-to-main', () => ({
  redirectToLogin: () => {
    throw new Error('redirectToLogin');
  },
  redirectToUnauthorized: () => {
    throw new Error('redirectToUnauthorized');
  },
}));

// Session: proprietaire du restaurant, donc aucune lecture de role_permissions.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'order', 'limit']) chain[m] = () => chain;
    chain.maybeSingle = async () => ({
      data: { id: 'a1', user_id: 'u1', tenant_id: 't1', role: 'owner', full_name: 'Awa' },
      error: null,
    });
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    return {
      auth: {
        getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.c' } }, error: null }),
      },
      from: () => chain,
    };
  },
}));
// Suivi d'activite en arriere-plan: son echec est avale par le layout.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('hors perimetre du test');
  },
}));
vi.mock('@/lib/billing/tenant-billing-ids', () => ({
  getTenantBillingIds: (id: string) => state.billing(id),
}));
vi.mock('@/lib/plans/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/plans/features')>()),
  getPlanLimits: () => ({ maxMonthlyOrders: -1 }),
}));
vi.mock('@/lib/admin/monthly-orders-count', () => ({ getMonthlyOrdersCount: async () => 0 }));
vi.mock('@/lib/permissions', () => ({ getEffectivePermissions: () => ({}) }));
vi.mock('@/services/trigger-emails.service', () => ({
  determineTrialEventKey: () => null,
  sendTrialEmailForKey: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const HEURE = 3_600_000;
const JOUR = 24 * HEURE;
const ilYa = (ms: number) => new Date(Date.now() - ms).toISOString();

type AnyElement = ReactElement<Record<string, unknown>>;

/** Cherche dans les enfants ET dans les props element (ex: `chrome`). */
function find(node: unknown, name: string): AnyElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, name);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const el = node as AnyElement;
  if (typeof el.type === 'function' && el.type.name === name) return el;
  for (const value of Object.values(el.props)) {
    const hit = find(value, name);
    if (hit) return hit;
  }
  return null;
}

async function menuDaysLeft(tenant: Record<string, unknown>): Promise<unknown> {
  state.tenant = {
    id: 't1',
    slug: 'resto',
    name: 'Chez Awa',
    is_active: true,
    suspended_at: null,
    onboarding_completed: true,
    ...tenant,
  };
  const { default: AdminLayout } = await import('../layout');
  const tree = await AdminLayout({ children: null, params: Promise.resolve({ site: 'resto' }) });
  const banners = find(tree, 'SubscriptionBanners');
  expect(banners).not.toBeNull();
  return banners?.props.menuDaysLeft;
}

describe('AdminLayout - jours de carte visible dans le bandeau', () => {
  beforeEach(() => {
    state.billing.mockReset();
    state.billing.mockResolvedValue({ stripe_subscription_id: null });
  });

  it('essai expire il y a 2 h, pas encore gele: 7 jours', async () => {
    await expect(
      menuDaysLeft({ subscription_status: 'trial', trial_ends_at: ilYa(2 * HEURE) }),
    ).resolves.toBe(7);
  });

  it('gel du cron de fin d essai il y a 5 jours et 2 h: 2 jours', async () => {
    await expect(
      menuDaysLeft({
        is_active: false,
        subscription_status: 'frozen',
        freeze_reason: 'trial_expired',
        trial_ends_at: ilYa(5 * JOUR + 2 * HEURE),
      }),
    ).resolves.toBe(2);
  });

  it('gel pour impaye: pas de compte a rebours', async () => {
    await expect(
      menuDaysLeft({
        is_active: false,
        subscription_status: 'frozen',
        freeze_reason: 'past_due_overdue',
        trial_ends_at: ilYa(2 * HEURE),
      }),
    ).resolves.toBeNull();
  });

  it('restaurant abonne: pas de compte a rebours', async () => {
    await expect(
      menuDaysLeft({ subscription_status: 'active', trial_ends_at: ilYa(30 * JOUR) }),
    ).resolves.toBeNull();
  });
});

// Fin d'essai pas encore gelee: la cuisine finit les commandes d'avant la fin
// d'essai (decision produit du 2026-11-09). Le layout ouvre la page cuisine a
// `LockedSubscriptionRedirect`, et seulement dans ce cas.
async function kitchenMayFinish(tenant: Record<string, unknown>): Promise<unknown> {
  state.tenant = {
    id: 't1',
    slug: 'resto',
    name: 'Chez Awa',
    is_active: true,
    suspended_at: null,
    onboarding_completed: true,
    ...tenant,
  };
  const { default: AdminLayout } = await import('../layout');
  const tree = await AdminLayout({ children: null, params: Promise.resolve({ site: 'resto' }) });
  const redirect = find(tree, 'LockedSubscriptionRedirect');
  expect(redirect).not.toBeNull();
  return redirect?.props.kitchenMayFinish;
}

describe('AdminLayout - cuisine ouverte a la fin de l essai', () => {
  beforeEach(() => {
    state.billing.mockReset();
    state.billing.mockResolvedValue({ stripe_subscription_id: null });
  });

  it('essai expire il y a 2 h, pas encore gele: cuisine ouverte', async () => {
    await expect(
      kitchenMayFinish({ subscription_status: 'trial', trial_ends_at: ilYa(2 * HEURE) }),
    ).resolves.toBe(true);
  });

  it('essai expire mais suspendu par le super-admin: cuisine fermee', async () => {
    await expect(
      kitchenMayFinish({
        subscription_status: 'trial',
        trial_ends_at: ilYa(2 * HEURE),
        suspended_at: ilYa(HEURE),
      }),
    ).resolves.toBe(false);
  });

  it('essai deja gele par le cron: cuisine fermee', async () => {
    await expect(
      kitchenMayFinish({
        is_active: false,
        subscription_status: 'frozen',
        freeze_reason: 'trial_expired',
        trial_ends_at: ilYa(13 * HEURE),
      }),
    ).resolves.toBe(false);
  });

  it('essai couvert par un abonnement Stripe: rien a ouvrir', async () => {
    state.billing.mockResolvedValue({ stripe_subscription_id: 'sub_1' });
    await expect(
      kitchenMayFinish({ subscription_status: 'trial', trial_ends_at: ilYa(2 * HEURE) }),
    ).resolves.toBe(false);
  });

  it('restaurant qui sert: rien a ouvrir', async () => {
    await expect(
      kitchenMayFinish({ subscription_status: 'active', trial_ends_at: ilYa(30 * JOUR) }),
    ).resolves.toBe(false);
  });
});
