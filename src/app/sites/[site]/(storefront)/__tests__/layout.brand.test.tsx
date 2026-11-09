import { describe, it, expect, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';

import { TenantBrandProvider } from '@/components/theme/TenantBrandProvider';

// The storefront CTAs ("Commander", "Plat du jour") read `--brand-cta` from the
// client root. This proves the layout really puts the tenant color there, and
// that the brand provider gets the SAME color (they used to disagree for a
// tenant without a color: #1A1A1A on one side, green on the other).

const tenant = vi.hoisted(() => ({
  current: {
    id: 't1',
    slug: 'resto',
    is_active: true,
    subscription_status: 'active',
    primary_color: null as string | null,
  },
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/cache', () => ({
  getCachedTenant: async () => tenant.current,
  toPublicTenant: (t: unknown) => t,
}));
// The lapsed-trial lock reads Stripe ids in service_role ('server-only'). This
// tenant has no expired trial, so the read must never happen.
vi.mock('@/lib/billing/tenant-billing-ids', () => ({
  getTenantBillingIds: () => {
    throw new Error('service_role read for a tenant without an expired trial');
  },
}));

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

async function renderLayout(primaryColor: string | null) {
  tenant.current = { ...tenant.current, primary_color: primaryColor };
  const { default: StorefrontLayout } = await import('../layout');
  const tree = await StorefrontLayout({
    children: null,
    params: Promise.resolve({ site: 'resto' }),
  });
  const root = find(
    tree,
    (el) => typeof el.props.className === 'string' && el.props.className.includes('tenant-client'),
  );
  const brand = find(tree, (el) => el.type === TenantBrandProvider);
  return {
    style: (root?.props.style ?? {}) as Record<string, string>,
    providerColor: (brand?.props.initialColors as { primaryColor: string } | undefined)
      ?.primaryColor,
  };
}

describe('StorefrontLayout - tenant CTA color', () => {
  it('scopes the Ruby tenant color to the CTA tokens', async () => {
    const { style, providerColor } = await renderLayout('#EF4444');
    expect(style['--brand-cta']).toBe('#EF4444');
    expect(style['--brand-cta-fg']).toBeDefined();
    expect(style['--color-brand']).toBeUndefined();
    expect(providerColor).toBe('#EF4444');
  });

  it('uses the ATTABL lime, with readable text, for a tenant without a color', async () => {
    const { style, providerColor } = await renderLayout(null);
    expect(style['--brand-cta']).toBe('#CCFF00');
    expect(style['--brand-cta-fg']).toBe('#000000');
    expect(providerColor).toBe('#CCFF00');
  });
});
