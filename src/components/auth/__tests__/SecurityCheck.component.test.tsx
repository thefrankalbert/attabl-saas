// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr-FR.json';

// Audit d'equipe du 2026-11-27 (onboarding C4): bouton grise sans explication,
// et aucun message si le controle anti-robot echoue.

const turnstile = vi.hoisted(() => ({ props: null as null | { onError: () => void } }));
vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: (props: { onError: () => void }) => {
    turnstile.props = props;
    return null;
  },
}));

import { SecurityCheck } from '../SecurityCheck';

function wrap(token: string): void {
  render(
    <NextIntlClientProvider locale="fr-FR" messages={fr}>
      <SecurityCheck siteKey="k" token={token} onToken={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => vi.useRealTimers());

describe('SecurityCheck', () => {
  it('explique pourquoi le bouton attend', () => {
    wrap('');
    expect(screen.getByText(fr.auth.form.securityCheckPending)).toBeInTheDocument();
  });

  it('previent si la verification tarde', () => {
    vi.useFakeTimers();
    wrap('');
    act(() => vi.advanceTimersByTime(8000));
    expect(screen.getByText(fr.auth.form.securityCheckSlow)).toBeInTheDocument();
  });

  it('signale l echec du controle', () => {
    wrap('');
    act(() => turnstile.props?.onError());
    expect(screen.getByText(fr.auth.form.securityCheckFailed)).toBeInTheDocument();
  });

  it('controle reussi: aucun message (temoin)', () => {
    wrap('jeton-ok');
    expect(screen.queryByText(fr.auth.form.securityCheckPending)).not.toBeInTheDocument();
  });
});
