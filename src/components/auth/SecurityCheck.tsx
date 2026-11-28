'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Turnstile } from '@marsidev/react-turnstile';

interface SecurityCheckProps {
  siteKey: string;
  token: string;
  onToken: (token: string) => void;
}

/** Au-dela, on dit au visiteur que la verification tarde (reseau lent, bloqueur). */
const SLOW_AFTER_MS = 8000;

/**
 * Controle anti-robot (Cloudflare Turnstile) ET son explication.
 *
 * Le bouton d'envoi reste grise tant que le controle n'a pas abouti. Avant, rien
 * ne le disait: un bouton grise sans raison, et pour toujours si le script
 * Cloudflare ne se chargeait pas (audit d'equipe du 2026-11-27, onboarding C4).
 * Le message vit sous le bouton, dans une region `aria-live`.
 */
export function SecurityCheck({ siteKey, token, onToken }: SecurityCheckProps) {
  const t = useTranslations('auth.form');
  const [failed, setFailed] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (token) return;
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [token]);

  const message = token
    ? null
    : failed
      ? t('securityCheckFailed')
      : slow
        ? t('securityCheckSlow')
        : t('securityCheckPending');

  return (
    <>
      <p
        aria-live="polite"
        className={`min-h-[1lh] text-center text-[12px] leading-snug ${failed ? 'text-[var(--destructive)]' : 'text-[var(--muted)]'}`}
      >
        {message}
      </p>
      <Turnstile
        siteKey={siteKey}
        onSuccess={(value) => {
          setFailed(false);
          setSlow(false);
          onToken(value);
        }}
        onExpire={() => onToken('')}
        onError={() => {
          setFailed(true);
          onToken('');
        }}
        options={{ theme: 'auto', size: 'flexible', appearance: 'interaction-only' }}
      />
    </>
  );
}
