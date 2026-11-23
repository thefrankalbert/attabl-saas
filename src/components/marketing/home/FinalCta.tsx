import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AnimatedWords } from './AnimatedWords';
import { CtaTrail } from './CtaTrail';
import { WHATSAPP_LINK } from './whatsapp';

export async function FinalCta() {
  const t = await getTranslations('marketing.home.finalCta');

  return (
    <CtaTrail>
      <div className="relative z-10 px-5 py-20 text-center lg:py-48">
        <div data-zone-texte className="mx-auto w-fit max-w-full">
          <h2
            data-mots
            id="fin-titre"
            className="mx-auto max-w-[26ch] text-balance font-titre text-[40px] leading-[1.03] tracking-[-0.015em] sm:text-[60px]"
          >
            <AnimatedWords text={t('title')} masked />
          </h2>
          <p className="mt-5 text-[17px] text-encre/70 dark:text-white/70">{t('subtitle')}</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex h-11 items-center justify-center rounded-full bg-encre px-6 text-[16px] font-medium text-white hover:bg-black max-sm:w-full dark:bg-white dark:text-encre dark:hover:bg-white/90"
            >
              {t('ctaPrimary')}
            </Link>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-full border border-encre/30 px-6 text-[16px] font-medium hover:border-encre max-sm:w-full dark:border-white/30 dark:hover:border-white"
            >
              {t('whatsapp')}
            </a>
          </div>
        </div>
      </div>
    </CtaTrail>
  );
}
