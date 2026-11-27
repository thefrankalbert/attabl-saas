// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr-FR.json';
import en from '@/messages/en-US.json';

/**
 * Contre-audit 4: la page d'invitation n'affiche plus de bulle native; elle
 * bloque l'envoi sous les regles du mot de passe, avec la phrase traduite.
 */
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('token=jeton-de-test'),
}));
vi.mock('@/components/auth/AuthFrame', () => ({
  AuthFrame: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import AcceptInvitePage from '../page';

const fetchMock = vi.fn();

async function renderPage(locale: 'fr-FR' | 'en-US') {
  render(
    <NextIntlClientProvider locale={locale} messages={locale === 'fr-FR' ? fr : en}>
      <AcceptInvitePage />
    </NextIntlClientProvider>,
  );
  // Le formulaire n'apparait qu'une fois le jeton verifie par le serveur.
  await waitFor(() => expect(document.querySelector('form')).not.toBeNull());
}

function fillAndSubmit(password: string) {
  fireEvent.change(document.querySelector('#fullName') as HTMLInputElement, {
    target: { value: 'Awa Traore' },
  });
  for (const id of ['#password', '#confirmPassword']) {
    fireEvent.change(document.querySelector(id) as HTMLInputElement, {
      target: { value: password },
    });
  }
  fireEvent.submit(document.querySelector('form') as HTMLFormElement);
}

const acceptCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/invitations/accept'));

describe('page d invitation: mot de passe', () => {
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('11 caracteres: aucun envoi, phrase traduite, aucun minLength natif', async () => {
    await renderPage('fr-FR');
    expect(document.querySelector('#password')).not.toHaveAttribute('minLength');
    fillAndSubmit('Maquis-2026');
    expect(await screen.findByText('Il manque : 12 caractères.')).toBeInTheDocument();
    expect(acceptCalls()).toHaveLength(0);
  });

  it('en-US: titre et phrase en anglais', async () => {
    await renderPage('en-US');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('You have been invited!');
    fillAndSubmit('maquis-2026!');
    expect(await screen.findByText('Still missing: an uppercase letter.')).toBeInTheDocument();
    expect(acceptCalls()).toHaveLength(0);
  });

  it('temoin: un mot de passe conforme est envoye', async () => {
    await renderPage('fr-FR');
    fillAndSubmit('Maquis-2026!Awa');
    await waitFor(() => expect(acceptCalls()).toHaveLength(1));
  });
});
