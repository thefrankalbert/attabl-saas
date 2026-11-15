// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

/**
 * A-06: la page n'ecrit plus le mot de passe elle-meme: elle poste au serveur
 * (/api/reset-password), qui verifie le marqueur de recuperation et l'adresse.
 * Sur EMAIL_MISMATCH elle coupe la session locale et renvoie a la connexion.
 */

const getUser = vi.fn();
const updateUser = vi.fn();
const signOut = vi.fn();
const push = vi.fn();
const fetchMock = vi.fn();

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getUser: (...a: unknown[]) => getUser(...a),
      updateUser: (...a: unknown[]) => updateUser(...a),
      signOut: (...a: unknown[]) => signOut(...a),
    },
  }),
}));
vi.mock('@/components/auth/AuthShell', () => ({
  AuthShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/auth/AuthCard', () => ({
  AuthCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/auth/AuthFormSkeleton', () => ({ AuthFormSkeleton: () => <div /> }));

import ResetPasswordPage from '../page';

function reponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function remplirEtEnvoyer(email: string) {
  render(<ResetPasswordPage />);
  const champEmail = await screen.findByPlaceholderText('accountEmailPlaceholder', undefined, {
    timeout: 3000,
  });
  fireEvent.change(champEmail, { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText('newPasswordPlaceholder'), {
    target: { value: 'MotDePasse-Solide-1' },
  });
  fireEvent.change(screen.getByPlaceholderText('confirmPasswordPlaceholder'), {
    target: { value: 'MotDePasse-Solide-1' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'submit' }));
}

describe('page de reinitialisation (A-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    getUser.mockResolvedValue({ data: { user: { email: 'titulaire@resto.test' } } });
    signOut.mockResolvedValue({ error: null });
  });

  it('ne change jamais le mot de passe dans le navigateur: tout passe par le serveur', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true }));

    await remplirEtEnvoyer('titulaire@resto.test');

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('/api/reset-password');
    expect(JSON.parse(init.body)).toEqual({
      accountEmail: 'titulaire@resto.test',
      password: 'MotDePasse-Solide-1',
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('EMAIL_MISMATCH: deconnexion locale et retour a la connexion', async () => {
    fetchMock.mockResolvedValue(reponse(403, { code: 'EMAIL_MISMATCH' }));

    await remplirEtEnvoyer('victime@autre.test');

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login?error=access_denied'));
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('NO_RECOVERY: affiche l ecran de lien expire', async () => {
    fetchMock.mockResolvedValue(reponse(403, { code: 'NO_RECOVERY' }));

    await remplirEtEnvoyer('titulaire@resto.test');

    await waitFor(() => expect(screen.getByText('expiredTitle')).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });
});
