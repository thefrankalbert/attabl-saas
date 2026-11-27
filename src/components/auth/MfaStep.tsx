'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { actionVerifyMfaCode } from '@/app/actions/mfa';
import { MfaCodeForm } from '@/components/shared/mfa/MfaCodeForm';
import { MfaEnrollPanel } from '@/components/shared/mfa/MfaEnrollPanel';
import { AuthCard } from './AuthCard';

const inputClass =
  'auth-input placeholder:text-[var(--muted)] focus-visible:border-[var(--fg)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] focus-visible:ring-offset-0';
const labelClass = 'text-[13.5px] font-medium text-[var(--fg)]';

/**
 * Contenu de la page /auth/mfa: le code de connexion (`challenge`) ou
 * l'activation obligatoire du super administrateur (`enroll`). Apres succes,
 * navigation COMPLETE vers `next` (deja filtre par le serveur): les layouts
 * serveur relisent alors la session aal2 depuis les cookies.
 */
export function MfaStep({ mode, next }: { mode: 'challenge' | 'enroll'; next: string }) {
  const t = useTranslations('mfa');
  const go = () => window.location.assign(next);

  const verify = async (code: string): Promise<string | null> => {
    const result = await actionVerifyMfaCode({ code });
    if (!result.success) return t(`errors.${result.error}`);
    go();
    return null;
  };

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="auth-serif auth-title mb-2">
          {mode === 'challenge' ? t('challengeTitle') : t('requiredTitle')}
        </h1>
        <p className="text-[15px] text-[var(--secondary)]">
          {mode === 'challenge' ? t('challengeSub') : t('requiredSub')}
        </p>
      </div>

      <AuthCard>
        {mode === 'challenge' ? (
          <MfaCodeForm
            onSubmitCode={verify}
            submitLabel={t('challengeSubmit')}
            autoFocus
            inputClassName={inputClass}
            labelClassName={labelClass}
            buttonClassName="auth-btn-primary"
          />
        ) : (
          <MfaEnrollPanel
            startLabel={t('requiredStart')}
            onEnrolled={go}
            buttonClassName="auth-btn-primary"
            secondaryButtonClassName="auth-btn-secondary"
            inputClassName={inputClass}
            labelClassName={labelClass}
            textClassName="text-[var(--secondary)]"
          />
        )}
      </AuthCard>

      {/* Deconnexion: la meme route que le menu du compte (POST, origine verifiee). */}
      <form action="/api/auth/signout" method="post" className="mt-6 text-center">
        <Button
          type="submit"
          variant="link"
          className="min-h-[44px] text-[13.5px] text-[var(--secondary)]"
        >
          {t('otherAccount')}
        </Button>
      </form>
    </div>
  );
}
