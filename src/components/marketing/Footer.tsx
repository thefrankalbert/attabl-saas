import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AttablLogo } from './AttablLogo';

const COL_LINK =
  'text-[13px] text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50';

export default async function Footer() {
  const t = await getTranslations('marketing.footer');
  const year = new Date().getFullYear();

  const columns = [
    {
      title: t('columns.product.title'),
      links: [
        { label: t('columns.product.links.features'), href: '/features' },
        { label: t('columns.product.links.pricing'), href: '/pricing' },
        { label: t('columns.product.links.news'), href: '/nouveautes' },
        { label: t('columns.product.links.materiel'), href: '/materiel' },
      ],
    },
    {
      title: t('columns.solutions.title'),
      links: [
        { label: t('columns.solutions.links.restaurants'), href: '/solutions#ind-restaurant' },
        { label: t('columns.solutions.links.hotels'), href: '/solutions#ind-hotel' },
        { label: t('columns.solutions.links.barsCafes'), href: '/solutions#ind-bar' },
      ],
    },
    {
      title: t('columns.company.title'),
      links: [
        { label: t('columns.company.links.about'), href: '/about' },
        { label: t('columns.company.links.blog'), href: '/blog' },
        { label: t('columns.company.links.contact'), href: '/contact' },
        { label: t('columns.company.links.support'), href: '/support' },
      ],
    },
  ];

  return (
    <footer className="border-t border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="mx-auto max-w-[1200px] px-5 py-[52px] sm:px-7">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="col-span-2 lg:col-span-1">
            <AttablLogo size="footer" />
            <p className="mt-3 max-w-[250px] text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              {t('tagline')}
            </p>
            <a
              href="mailto:contact@attabl.com"
              className="mt-3 inline-block text-[13px] font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
            >
              contact@attabl.com
            </a>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <div className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                {col.title}
              </div>
              <div className="mt-3.5 flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <Link key={l.href} href={l.href} className={COL_LINK}>
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-11 border-t border-zinc-200 pt-5 text-[13px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          {t('copyright', { year })}
          {' - '}
          <Link
            href="/legal"
            className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            {t('columns.legal.links.mentions')}
          </Link>
          {' - '}
          <Link
            href="/privacy"
            className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            {t('columns.legal.links.privacy')}
          </Link>
        </div>
      </div>
    </footer>
  );
}
