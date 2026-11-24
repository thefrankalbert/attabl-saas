'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  isPasswordTooLong,
  missingPasswordRules,
  parsePasswordIssue,
  PASSWORD_RULES,
} from '@/lib/validations/common.schema';

/**
 * Traduit un message de `passwordSchema` (un code, voir common.schema.ts) en
 * texte de l'interface. Rend `null` pour tout autre message: l'appelant
 * l'affiche alors tel quel.
 */
export function usePasswordIssueText(): (message: string | null | undefined) => string | null {
  const t = useTranslations('auth.passwordRules');
  return useCallback(
    (message) => {
      const issue = parsePasswordIssue(message);
      if (!issue) return null;
      if (issue.kind === 'tooLong') return t('tooLong');
      if (issue.kind === 'tooCommon') return t('tooCommon');
      return t('missing', { rules: issue.missing.map((rule) => t(`rule.${rule}`)).join(', ') });
    },
    [t],
  );
}

/**
 * Les cinq regles du mot de passe, chacune cochee au fil de la saisie (memes
 * regles que le serveur et que la politique Auth de la production).
 */
export function PasswordRulesList({ password }: { password: string }) {
  const t = useTranslations('auth.passwordRules');
  const missing = new Set(missingPasswordRules(password));
  const tooLong = isPasswordTooLong(password);
  return (
    <>
      <ul
        aria-label={t('listLabel')}
        className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11.5px] leading-4"
      >
        {PASSWORD_RULES.map((rule) => {
          const ok = !missing.has(rule);
          return (
            <li key={rule} className={ok ? 'text-[var(--ok-fg)]' : 'text-[var(--muted)]'}>
              <span aria-hidden="true">{ok ? '+ ' : '- '}</span>
              {t(`rule.${rule}`)}
              <span className="sr-only">{ok ? t('ruleMet') : t('ruleMissing')}</span>
            </li>
          );
        })}
      </ul>
      {/* Plafond de GoTrue (72 octets): annonce avant l'envoi (contre-audit 5). */}
      {tooLong && <p className="text-[11.5px] leading-4 text-[var(--err-fg)]">{t('tooLong')}</p>}
    </>
  );
}

/**
 * Version compacte pour l'inscription (contre-audit 4, regle 12 du depot): une
 * seule ligne, a la hauteur de l'ancienne jauge, qui nomme toutes les regles
 * manquantes ("Il manque : majuscule, chiffre") ou dit que tout est bon.
 */
export function PasswordStrengthLine({ id, password }: { id: string; password: string }) {
  const t = useTranslations('auth.passwordRules');
  const missing = missingPasswordRules(password);
  const met = PASSWORD_RULES.length - missing.length;
  // Trop long pour GoTrue (72 octets): jamais "solide", la limite est annoncee.
  const tooLong = isPasswordTooLong(password);
  const strength = tooLong ? 1 : missing.length === 0 ? 3 : missing.length <= 2 ? 2 : 1;
  return (
    // Ecran court (regle 12): la ligne prend sur l'espace qui la suit, pour que
    // l'inscription ne defile pas pendant la saisie (mesure a 660 px de haut).
    <div
      id={id}
      aria-live="polite"
      className="flex items-center gap-1.5 pt-0.5 [@media(max-height:719px)]:-mb-1.5 [@media(max-height:719px)]:pt-0"
    >
      <span aria-hidden="true" className="flex w-14 shrink-0 gap-1">
        {[1, 2, 3].map((segment) => (
          <span
            key={segment}
            className={`h-1 flex-1 rounded-full ${
              segment > strength
                ? 'bg-[var(--border)]'
                : strength === 3
                  ? 'bg-[var(--ok-fg)]'
                  : 'bg-amber-500'
            }`}
          />
        ))}
      </span>
      <span
        className={`text-[11px] leading-4 ${
          tooLong
            ? 'text-[var(--err-fg)]'
            : missing.length === 0
              ? 'text-[var(--ok-fg)]'
              : 'text-[var(--muted)]'
        }`}
      >
        {tooLong
          ? t('tooLongShort')
          : missing.length === 0
            ? t('allMet')
            : t('missingShort', {
                rules: missing.map((rule) => t(`ruleShort.${rule}`)).join(', '),
              })}
        <span className="sr-only">{t('progress', { met, total: PASSWORD_RULES.length })}</span>
      </span>
    </div>
  );
}
