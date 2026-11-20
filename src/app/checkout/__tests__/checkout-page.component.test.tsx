// @vitest-environment happy-dom
import React, { StrictMode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import CheckoutPage from '../page';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('plan=pro&interval=yearly&tenant=demo'),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('@/components/checkout/CheckoutView', () => ({
  CheckoutView: ({ clientSecret }: { clientSecret: string }) => (
    <div data-testid="view">{clientSecret}</div>
  ),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <StrictMode>
    <NextIntlClientProvider locale="fr-FR" messages={messages}>
      {children}
    </NextIntlClientProvider>
  </StrictMode>
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('page /checkout', () => {
  it('ne demande qu une session, meme quand React rejoue l effet (sinon le serveur ferme celle affichee)', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ clientSecret: 'cs_test_secret_unique' }, { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<CheckoutPage />, { wrapper });
    await waitFor(() =>
      expect(screen.getByTestId('view')).toHaveTextContent('cs_test_secret_unique'),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("montre l'ecran d'erreur quand le serveur refuse", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'refus' }, { status: 409 })),
    );
    render(<CheckoutPage />, { wrapper });
    await waitFor(() =>
      expect(screen.getByText("Le paiement ne s'est pas chargé")).toBeInTheDocument(),
    );
  });
});
