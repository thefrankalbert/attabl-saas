import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

const COL_LINK = 'inline-block py-1 hover:text-white';
const LEGAL_LINK = 'inline-block py-1 underline-offset-4 hover:text-white hover:underline';

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
    <footer className="bg-nuit text-white">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-16 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <span className="text-[20px] font-semibold tracking-[-0.03em]">Attabl</span>
          <p className="mt-3 text-[15px] text-white/60">{t('tagline')}</p>
          <a
            href="mailto:contact@attabl.com"
            className="mt-3 inline-block py-1.5 text-[15px] text-white/80 hover:text-white"
          >
            contact@attabl.com
          </a>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <p className="surtitre text-white/50">{col.title}</p>
            <ul className="mt-3 space-y-1 text-[15px] text-white/80">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={COL_LINK}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto max-w-[1440px] border-t border-white/15 px-5 py-6 text-[13px] text-white/50 lg:px-8">
        {t('copyright', { year })}{' '}
        <Link href="/legal" className={LEGAL_LINK}>
          {t('columns.legal.links.mentions')}
        </Link>
        .{' '}
        <Link href="/privacy" className={LEGAL_LINK}>
          {t('columns.legal.links.privacy')}
        </Link>
        .
      </div>
    </footer>
  );
}
