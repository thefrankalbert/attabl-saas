import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';

import { StorefrontUnavailable } from '@/components/tenant/StorefrontUnavailable';
import { TenantProvider } from '@/contexts/TenantContext';

// Fin d'essai sans abonnement (decision produit du 2026-11-09): pendant 7 jours
// la carte reste visible en LECTURE SEULE - la commande, elle, est refusee en
// 403 des `trial_ends_at` (validateTenant -> tenantLockReason). Au-dela, et
// pour toute autre cause de verrou, la vitrine est indisponible.

const state = vi.hoisted(() => ({
  tenant: {} as Record<string, unknown>,
  billing: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/cache', () => ({
  getCachedTenant: async () => state.tenant,
  toPublicTenant: (t: unknown) => t,
}));
vi.mock('@/lib/billing/tenant-billing-ids', () => ({
  getTenantBillingIds: (id: string) => state.billing(id),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const JOUR = 86_400_000;
const ilYa = (jours: number) => new Date(Date.now() - jours * JOUR).toISOString();
const HIER = ilYa(1);
const DEMAIN = new Date(Date.now() + JOUR).toISOString();

type AnyElement = ReactElement<{ children?: ReactNode; [k: string]: unknown }>;

function find(node: ReactNode, match: (el: AnyElement) => boolean): AnyElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, match);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const el = node as AnyElement;
  if (match(el)) return el;
  return find(el.props.children, match);
}

async function render(tenant: Record<string, unknown>) {
  state.tenant = { id: 't1', slug: 'resto', is_active: true, suspended_at: null, ...tenant };
  const { default: StorefrontLayout } = await import('../layout');
  return StorefrontLayout({ children: null, params: Promise.resolve({ site: 'resto' }) });
}

function isUnavailable(tree: unknown): boolean {
  return isValidElement(tree) && tree.type === StorefrontUnavailable;
}

function orderingPaused(tree: ReactNode): unknown {
  return find(tree, (el) => el.type === TenantProvider)?.props.orderingPaused;
}

describe('StorefrontLayout - fin d essai', () => {
  beforeEach(() => state.billing.mockReset());

  it('essai expire hier sans abonnement: carte servie, commandes en pause', async () => {
    state.billing.mockResolvedValue({ stripe_subscription_id: null });
    const tree = await render({ subscription_status: 'trial', trial_ends_at: HIER });
    expect(isUnavailable(tree)).toBe(false);
    expect(orderingPaused(tree)).toBe(true);
    expect(state.billing).toHaveBeenCalledWith('t1');
  });

  it('essai expire il y a 8 jours: vitrine indisponible', async () => {
    state.billing.mockResolvedValue({ stripe_subscription_id: null });
    expect(
      isUnavailable(await render({ subscription_status: 'trial', trial_ends_at: ilYa(8) })),
    ).toBe(true);
  });

  it('gel trial_expired du cron, dans les 7 jours: carte en lecture seule', async () => {
    const tree = await render({
      is_active: false,
      subscription_status: 'frozen',
      freeze_reason: 'trial_expired',
      trial_ends_at: ilYa(3),
    });
    expect(isUnavailable(tree)).toBe(false);
    expect(orderingPaused(tree)).toBe(true);
  });

  it('gel pour litige: vitrine indisponible, aucune grace', async () => {
    expect(
      isUnavailable(
        await render({
          is_active: false,
          subscription_status: 'frozen',
          freeze_reason: 'dispute',
          trial_ends_at: HIER,
        }),
      ),
    ).toBe(true);
  });

  it('suspension plateforme en fin d essai: vitrine indisponible', async () => {
    state.billing.mockResolvedValue({ stripe_subscription_id: null });
    expect(
      isUnavailable(
        await render({ subscription_status: 'trial', trial_ends_at: HIER, suspended_at: HIER }),
      ),
    ).toBe(true);
  });

  it('essai expire mais abonnement Stripe ouvert: commandes ouvertes', async () => {
    state.billing.mockResolvedValue({ stripe_subscription_id: 'sub_123' });
    const tree = await render({ subscription_status: 'trial', trial_ends_at: HIER });
    expect(isUnavailable(tree)).toBe(false);
    expect(orderingPaused(tree)).toBe(false);
  });

  it('essai en cours: commandes ouvertes, sans lecture service_role', async () => {
    const tree = await render({ subscription_status: 'trial', trial_ends_at: DEMAIN });
    expect(isUnavailable(tree)).toBe(false);
    expect(orderingPaused(tree)).toBe(false);
    expect(state.billing).not.toHaveBeenCalled();
  });
});

/**
 * Audit du 2026-11-14: le panier proposait le pourboire a tous, mais la route de
 * commande le refuse hors forfait (Starter). Le client voyait sa commande
 * "enregistree" alors qu'elle ne partait jamais.
 */
describe('StorefrontLayout - pourboire selon le forfait', () => {
  const tipsEnabled = (tree: ReactNode) =>
    find(tree, (el) => el.type === TenantProvider)?.props.tipsEnabled;

  it('Starter actif: pas de pourboire propose', async () => {
    const tree = await render({ subscription_plan: 'starter', subscription_status: 'active' });
    expect(tipsEnabled(tree)).toBe(false);
  });

  it('Pro actif: pourboire propose', async () => {
    const tree = await render({ subscription_plan: 'pro', subscription_status: 'active' });
    expect(tipsEnabled(tree)).toBe(true);
  });

  it('essai en cours: pourboire propose (l essai vaut Pro)', async () => {
    state.billing.mockResolvedValue({ stripe_subscription_id: null });
    const tree = await render({ subscription_status: 'trial', trial_ends_at: DEMAIN });
    expect(tipsEnabled(tree)).toBe(true);
  });
});
