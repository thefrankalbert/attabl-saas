// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

/**
 * A-06: le lien de reinitialisation ouvre une session sur le compte qui l'a
 * demande. Le mot de passe ne change que si la personne retape l'adresse de CE
 * compte (celle de `auth.getUser()`).
 */

const getUser = vi.fn();
const updateUser = vi.fn();
const push = vi.fn();

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
    getUser.mockResolvedValue({ data: { user: { email: 'titulaire@resto.test' } } });
    updateUser.mockResolvedValue({ error: null });
  });

  it('refuse et ne change pas le mot de passe quand l adresse saisie n est pas celle du compte', async () => {
    await remplirEtEnvoyer('victime@autre.test');

    await waitFor(() => expect(screen.getByText('accountEmailMismatch')).toBeInTheDocument());
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('TEMOIN: change le mot de passe quand l adresse du compte est retapee', async () => {
    await remplirEtEnvoyer('  Titulaire@Resto.test ');

    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith({ password: 'MotDePasse-Solide-1' }),
    );
  });
});
