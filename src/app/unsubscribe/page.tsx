import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AuthFrame } from '@/components/auth/AuthFrame';
import { UnsubscribeConfirm } from '@/components/shared/UnsubscribeConfirm';
import { readUnsubscribeToken } from '@/lib/email-unsubscribe-token';

/**
 * Page de desabonnement des relances commerciales (lien du pied de page).
 *
 * Elle verifie seulement que le jeton est authentique: elle ne lit aucune
 * table, donc ne dit rien de l'existence d'un compte. Rien ne change avant le
 * clic sur "Me desabonner" (les apercus de liens et antivirus ouvrent les
 * pages). L'adresse n'est pas affichee: le lien a pu etre transfere.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { t: raw } = await searchParams;
  const token = typeof raw === 'string' ? raw : null;
  const valid = token !== null && readUnsubscribeToken(token) !== null;
  const t = await getTranslations('unsubscribe');

  return (
    <AuthFrame scene="unsubscribe">
      {valid && token ? (
        <UnsubscribeConfirm token={token} />
      ) : (
        <div>
          <h1 className="auth-serif auth-title mb-3">{t('invalidTitle')}</h1>
          <p className="mb-8 text-[15px] leading-relaxed text-[var(--secondary)]">
            {t('invalidBody')}
          </p>
          <Link href="/" className="auth-link text-sm">
            {t('backHome')}
          </Link>
        </div>
      )}
    </AuthFrame>
  );
}
