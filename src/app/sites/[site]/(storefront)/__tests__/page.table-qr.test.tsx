import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { buildQRUrl } from '@/lib/qr/build-qr-url';

// A table QR without a menu slug points at the storefront ROOT (`/?table=X`),
// and codes are already printed that way. Before the fix the root page never
// read searchParams, so the table was never persisted and the order reached
// the kitchen with table_number NULL. This proves the root entry hands the
// scanned table to the client (which persists it for the cart).

const getTableOccupied = vi.fn(async () => false);

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
}));
vi.mock('next-intl/server', () => ({
  getMessages: async () => ({}),
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
  // The client itself must not be thenable, or `await createClient()` unwraps it.
  return { createClient: async () => ({ from: () => builder }) };
});
vi.mock('@/lib/cache', () => ({
  getCachedTenant: async () => ({
    id: 'tenant-1',
    name: 'Resto',
    slug: 'resto',
    is_active: true,
    subscription_status: 'active',
    currency: 'XOF',
    opening_hours: null,
    logo_url: null,
  }),
  getTableOccupied: (...args: unknown[]) => getTableOccupied(...(args as [])),
}));

// The storefront access rule reads Stripe ids in service_role ('server-only')
// only for an expired trial. This tenant is subscribed: the read must not happen.
vi.mock('@/lib/billing/tenant-billing-ids', () => ({
  getTenantBillingIds: () => {
    throw new Error('service_role read for a tenant without an expired trial');
  },
}));

const stub = (name: string) => {
  const C = () => null;
  C.displayName = name;
  return C;
};
vi.mock('@/components/tenant/client/HomeHeaderClient', () => ({
  HomeHeaderClient: stub('HomeHeaderClient'),
}));
vi.mock('@/components/tenant/TableOccupiedNotice', () => ({
  TableOccupiedNotice: stub('TableOccupiedNotice'),
}));
vi.mock('@/components/tenant/client/CategoryTile', () => ({ CategoryTile: stub('CategoryTile') }));
vi.mock('@/components/tenant/client/HomeItemsSection', () => ({
  HomeItemsSection: stub('HomeItemsSection'),
}));
vi.mock('@/components/tenant/client/HomeHero', () => ({ HomeHero: stub('HomeHero') }));
vi.mock('@/components/tenant/client/SectionHeader', () => ({
  SectionHeader: stub('SectionHeader'),
}));
vi.mock('@/components/tenant/client/CategoryIcon', () => ({
  deriveCategoryIconKey: () => 'default',
  getCategoryColors: () => ({ bg: '', fg: '' }),
}));
vi.mock('@/components/tenant/client/Photo', () => ({ Photo: stub('Photo') }));

function findProps(node: ReactNode, name: string): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProps(child, name);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const el = node as ReactElement<Record<string, unknown>>;
  const type = el.type as { displayName?: string };
  if (type.displayName === name) return el.props;
  return findProps(el.props.children as ReactNode, name);
}

async function renderRoot(qrUrl: string) {
  const { default: HomePage } = await import('../page');
  const url = new URL(qrUrl);
  return HomePage({
    params: Promise.resolve({ site: 'resto' }),
    searchParams: Promise.resolve(Object.fromEntries(url.searchParams)),
  });
}

describe('storefront root page - table QR', () => {
  beforeEach(() => getTableOccupied.mockClear());

  it('a printed root QR (/?table=TER-1) hands the table to the client header', async () => {
    const qrUrl = buildQRUrl('https://resto.attabl.com', 'TER-1');
    expect(new URL(qrUrl).pathname).toBe('/');

    const tree = await renderRoot(qrUrl);

    expect(findProps(tree, 'HomeHeaderClient')?.initialTable).toBe('TER-1');
    expect(findProps(tree, 'TableOccupiedNotice')?.tableNumber).toBe('TER-1');
    expect(getTableOccupied).toHaveBeenCalledWith('tenant-1', 'TER-1');
  });

  it('honors the legacy short ?t= param like /menu does', async () => {
    const tree = await renderRoot('https://resto.attabl.com/?t=SAL-2');
    expect(findProps(tree, 'HomeHeaderClient')?.initialTable).toBe('SAL-2');
  });

  it('no table in the url: nothing to persist, no occupancy lookup', async () => {
    const tree = await renderRoot('https://resto.attabl.com/');
    expect(findProps(tree, 'HomeHeaderClient')?.initialTable).toBeUndefined();
    expect(getTableOccupied).not.toHaveBeenCalled();
  });
});
