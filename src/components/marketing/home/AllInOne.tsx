import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BlurFade } from '@/components/ui/blur-fade';

const CHIPS = [
  { k: 'menu', href: '/features#fcat-menu' },
  { k: 'register', href: '/features#fcat-caisse' },
  { k: 'kitchen', href: '/features#fcat-cuisine' },
  { k: 'stock', href: '/features#fcat-stock' },
  { k: 'reports', href: '/features#fcat-rapports' },
  { k: 'team', href: '/features#fcat-equipe' },
] as const;

export async function AllInOne() {
  const t = await getTranslations('marketing.home.allInOne');

  return (
    <section className="bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-[1120px] px-5 pt-[110px] text-center sm:px-7">
        <BlurFade inView offset={20} blur="0px" duration={0.7}>
          <h2 className="text-3xl font-semibold leading-tight tracking-[-0.025em] text-zinc-950 sm:text-4xl dark:text-zinc-50">
            {t('title')}
          </h2>
          <p className="mx-auto mt-3.5 max-w-[520px] text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            {t('subtitle')}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
            {CHIPS.map((chip) => (
              <Link
                key={chip.k}
                href={chip.href}
                className="rounded-full border border-zinc-200 bg-zinc-100 px-[17px] py-[9px] text-sm font-semibold text-zinc-900 transition-colors hover:border-zinc-300 hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {t(`chips.${chip.k}`)}
              </Link>
            ))}
          </div>
          <Link
            href="/features"
            className="mt-6 inline-block text-[15px] font-semibold text-zinc-900 transition-colors hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-300"
          >
            {t('link')} &rarr;
          </Link>
        </BlurFade>
      </div>
    </section>
  );
}
