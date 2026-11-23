import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';
import { AuthFrame } from './AuthFrame';
import type { AuthScene } from './auth-scenes';

/**
 * Shell of the auth screens that share the zinc form style (login, signup,
 * forgot / reset password, email change): the photo frame (see AuthFrame) plus
 * the "secure connection" mention at the bottom of the card.
 *
 * `scene` picks the photo(s) and the sentence laid over them (auth-scenes.ts).
 * The dashboard preview that used to fill the right half was removed on
 * 2026-11-06 (product decision); the photo replaced it on 2026-11-23.
 */
export function AuthShell({ scene, children }: { scene: AuthScene; children: React.ReactNode }) {
  const t = useTranslations('authShell');

  return (
    <AuthFrame
      scene={scene}
      footer={
        <p className="auth-secure mt-8 flex items-center justify-center gap-2 text-[12.5px] text-[var(--muted)]">
          <Lock className="h-3 w-3 shrink-0" />
          {t('secure')}
        </p>
      }
    >
      {children}
    </AuthFrame>
  );
}
