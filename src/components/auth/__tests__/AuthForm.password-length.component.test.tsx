// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr-FR.json';

/**
 * Contre-audit 4: plus de `minLength` (bulle native dans la langue du
 * navigateur); l'inscription bloque l'envoi elle-meme (useAuthForm). La
 * connexion n'impose AUCUN minimum (un compte de 8 a 11 caracteres se connecte).
 */
vi.mock('@marsidev/react-turnstile', () => ({ Turnstile: () => null }));
vi.mock('../useAuthForm', () => ({
  useAuthForm: (mode: 'login' | 'signup') => ({
    isConfirmed: false,
    isAccountDeleted: false,
    urlError: '',
    loading: false,
    oauthLoading: null,
    error: '',
    email: '',
    setEmail: vi.fn(),
    password: '',
    setPassword: vi.fn(),
    restaurant: '',
    setRestaurant: vi.fn(),
    showPassword: false,
    setShowPassword: vi.fn(),
    confirmationSent: false,
    emailUndelivered: false,
    resending: false,
    resendCooldown: 0,
    honeypotRef: { current: null },
    cfToken: '',
    setCfToken: vi.fn(),
    turnstileSiteKey: '',
    handleOAuthLogin: vi.fn(),
    handleSubmit: vi.fn(),
    handleResendConfirmation: vi.fn(),
    isLogin: mode === 'login',
  }),
}));

import { AuthForm } from '../AuthForm';

function passwordInput(mode: 'login' | 'signup'): HTMLInputElement {
  const { container } = render(
    <NextIntlClientProvider locale="fr-FR" messages={fr}>
      <AuthForm mode={mode} />
    </NextIntlClientProvider>,
  );
  return container.querySelector('#password') as HTMLInputElement;
}

describe('AuthForm: aucune bulle native, connexion sans minimum', () => {
  it('inscription: pas de minLength (blocage par l application, phrase traduite)', () => {
    expect(passwordInput('signup')).not.toHaveAttribute('minLength');
  });

  it('temoin: connexion sans aucun minimum', () => {
    expect(passwordInput('login')).not.toHaveAttribute('minLength');
  });
});
