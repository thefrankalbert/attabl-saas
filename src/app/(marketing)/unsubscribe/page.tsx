import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { unsubscribeTokenSchema } from '@/lib/validations/unsubscribe.schema';
import { UnsubscribeConfirm } from './_components/UnsubscribeConfirm';

/**
 * Page publique de desinscription des e-mails de relance (R5/T9), sur le
 * domaine principal. Elle ne desinscrit JAMAIS a l'affichage (les scanners de
 * liens prefetchent les URL des e-mails): seul le bouton envoie la demande.
 * Le jeton n'est pas verifie ici, pour ne rien reveler de sa validite.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('unsubscribe');
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
    // Le jeton est dans l'URL: ne pas le transmettre aux ressources tierces.
    referrer: 'no-referrer',
  };
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const parsed = unsubscribeTokenSchema.safeParse(token);
  const t = await getTranslations('unsubscribe');

  return (
    <section className="bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-[560px] px-5 pb-24 pt-20 sm:px-7 sm:pt-[88px]">
        <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] text-zinc-950 dark:text-zinc-50">
          {t('heading')}
        </h1>
        {parsed.success ? (
          <UnsubscribeConfirm token={parsed.data} />
        ) : (
          <p className="mt-4 text-base leading-[1.6] text-zinc-600 dark:text-zinc-400">
            {t('invalidLink')}
          </p>
        )}
      </div>
    </section>
  );
}
