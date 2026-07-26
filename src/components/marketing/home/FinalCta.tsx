import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { BlurFade } from '@/components/ui/blur-fade';

export async function FinalCta() {
  const t = await getTranslations('marketing.home.finalCta');

  return (
    <section className="bg-white px-5 pb-[110px] sm:px-7 dark:bg-zinc-950">
      <BlurFade
        inView
        offset={20}
        blur="0px"
        duration={0.7}
        className="relative mx-auto max-w-[1120px] overflow-hidden rounded-3xl bg-zinc-950 px-6 py-20 text-center sm:px-10 sm:py-[84px] dark:bg-zinc-900"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)] bg-[length:26px_26px]" />
        <div className="relative">
          <h2 className="mx-auto max-w-[620px] text-3xl font-semibold leading-[1.08] tracking-[-0.03em] text-white sm:text-[44px]">
            {t('title')}
          </h2>
          <p className="mx-auto mt-4 max-w-[460px] text-base leading-relaxed text-zinc-400">
            {t('subtitle')}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center rounded-xl bg-white px-[26px] py-3.5 text-[15px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              {t('ctaPrimary')}
            </Link>
            <a
              href="https://wa.me/237658651050"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-[22px] py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-white/[0.12]"
            >
              <MessageCircle className="h-4 w-4" />
              {t('whatsapp')}
            </a>
          </div>
          <p className="mt-6 text-[13px] text-zinc-500">{t('trust')}</p>
        </div>
      </BlurFade>
    </section>
  );
}
