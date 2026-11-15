import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthCard } from '@/components/auth/AuthCard';
import { verifyEmailChangeToken, type EmailChangeClaims } from '@/lib/auth/email-change-token';

export const dynamic = 'force-dynamic';

/**
 * Page d'approbation d'une etape du changement d'adresse (A-09).
 *
 * Ouvrir le lien (GET) n'applique RIEN: la page affiche seulement un bouton
 * "Confirmer" qui poste vers /auth/confirm. Sans cela, un scanner de courriel ou
 * un apercu de lien suffirait a approuver le changement a la place de la personne.
 */
function readClaims(token: string | undefined): EmailChangeClaims | null {
  if (!token) return null;
  try {
    return verifyEmailChangeToken(token);
  } catch {
    return null;
  }
}

export default async function ConfirmEmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string }>;
}) {
  const { token, done } = await searchParams;
  const t = await getTranslations('auth.emailChange');
  const claims = done === 'current' ? null : readClaims(token);

  return (
    <AuthShell>
      <div className="w-full">
        <AuthCard>
          <div className="flex flex-col gap-3 py-2 text-center">
            {done === 'current' ? (
              <>
                <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--heading)]">
                  {t('doneTitle')}
                </h1>
                <p className="text-sm text-[var(--secondary)]">{t('doneCurrentBody')}</p>
              </>
            ) : claims && token ? (
              <>
                <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--heading)]">
                  {t('title')}
                </h1>
                <p className="text-sm text-[var(--secondary)]">
                  {claims.step === 'current'
                    ? t('currentBody', { email: claims.toEmail })
                    : t('newBody', { email: claims.toEmail })}
                </p>
                <form method="post" action="/auth/confirm">
                  <Input type="hidden" name="token" value={token} readOnly />
                  <Button
                    type="submit"
                    className="mt-1 h-10 w-full rounded-lg bg-[var(--fg)] text-sm font-medium text-[var(--primary-fg)] transition-colors hover:bg-[var(--fg-hover)]"
                  >
                    {t('confirmButton')}
                  </Button>
                </form>
              </>
            ) : (
              <>
                <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--heading)]">
                  {t('invalidTitle')}
                </h1>
                <p className="text-sm text-[var(--secondary)]">{t('invalidBody')}</p>
                <Link
                  href="/login"
                  className="text-sm font-medium text-[var(--fg)] underline underline-offset-4"
                >
                  {t('backToLogin')}
                </Link>
              </>
            )}
          </div>
        </AuthCard>
      </div>
    </AuthShell>
  );
}
