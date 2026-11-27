// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import fr from '@/messages/fr-FR.json';

// Audit d'equipe du 2026-11-27 (convive #41): codes promo coupes = tout code
// refuse. Le restaurateur doit le voir sur sa page Coupons.

const tenant = vi.hoisted(() => ({
  current: { id: 't1', currency: 'XAF', enable_coupons: false },
}));

vi.mock('next/headers', () => ({ headers: async () => ({ get: () => null }) }));
vi.mock('@/lib/cache', () => ({ getTenant: async () => tenant.current }));
vi.mock('@/lib/auth/require-admin-permission', () => ({ requireAdminPermission: async () => {} }));
vi.mock('@/lib/admin-page-metadata', () => ({ adminPageMetadata: async () => ({}) }));
vi.mock('@/lib/timezones', () => ({ resolveTenantTimezone: () => 'Africa/Ouagadougou' }));
vi.mock('@/components/admin/CouponsClient', () => ({ default: () => <div>liste</div> }));
vi.mock('@/components/admin/TenantNotFound', () => ({ default: () => <div>introuvable</div> }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => (fr.coupons as Record<string, string>)[key],
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.order = async () => ({ data: [] });
    return { from: () => b };
  },
}));

import CouponsPage from '../page';

async function renderPage(): Promise<void> {
  render(await CouponsPage({ params: Promise.resolve({ site: 'lepicurien' }) }));
}

describe('page Coupons: reglage coupe', () => {
  it('previent le restaurateur et pointe vers les parametres', async () => {
    tenant.current = { id: 't1', currency: 'XAF', enable_coupons: false };
    await renderPage();
    expect(screen.getByText(fr.coupons.disabledTitle)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: fr.coupons.disabledLink })).toHaveAttribute(
      'href',
      '/sites/lepicurien/admin/settings',
    );
  });

  it('reglage actif: aucun bandeau (temoin)', async () => {
    tenant.current = { id: 't1', currency: 'XAF', enable_coupons: true };
    await renderPage();
    expect(screen.queryByText(fr.coupons.disabledTitle)).not.toBeInTheDocument();
  });
});
