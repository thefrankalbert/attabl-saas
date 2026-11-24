// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import { toSupportContact, type SupportContact } from '@/lib/support-contact';

const contact: { current: SupportContact | null } = { current: null };

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: 'fr-FR', messages, namespace: namespace as 'adminSupport' }),
  };
});
vi.mock('@/lib/auth/require-admin-permission', () => ({ requireAdminMember: vi.fn() }));
vi.mock('@/lib/cache', () => ({ getTenant: async () => ({ name: "L'Epicurien" }) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('@/services/platform-settings.service', () => ({
  loadSupportContact: async () => contact.current,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import SupportPage from '../page';

async function renderPage() {
  const ui = await SupportPage({ params: Promise.resolve({ site: 'demo' }) });
  render(
    <NextIntlClientProvider locale="fr-FR" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('page Support', () => {
  it("sans numero enregistre, aucun lien WhatsApp (jamais vers le compte d'un tiers)", async () => {
    contact.current = null;
    await renderPage();
    expect(screen.queryByText('Écrire sur WhatsApp')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Écrire un e-mail' })).toBeInTheDocument();
  });

  it('avec le numero enregistre, WhatsApp porte ce numero et le nom du restaurant', async () => {
    contact.current = toSupportContact('+226 70 11 22 33');
    await renderPage();
    const href = screen.getByRole('link', { name: 'Écrire sur WhatsApp' }).getAttribute('href');
    expect(href).toMatch(/^https:\/\/wa\.me\/22670112233\?text=/);
    expect(decodeURIComponent(href ?? '')).toContain("L'Epicurien");
  });
});
