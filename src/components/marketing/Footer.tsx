import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function Footer() {
  const t = await getTranslations('marketing.footer');

  const footerColumns = [
    {
      title: t('columns.product.title'),
      links: [
        { label: t('columns.product.links.features'), href: '/features' },
        { label: t('columns.product.links.pricing'), href: '/pricing' },
        { label: t('columns.product.links.demo'), href: '/signup' },
      ],
    },
    {
      title: t('columns.solutions.title'),
      links: [
        { label: t('columns.solutions.links.restaurants'), href: '/restaurants' },
        { label: t('columns.solutions.links.hotels'), href: '/hotels' },
        { label: t('columns.solutions.links.quickService'), href: '/quick-service' },
        { label: t('columns.solutions.links.barsCafes'), href: '/bars-cafes' },
        { label: t('columns.solutions.links.fastFood'), href: '/fast-food' },
      ],
    },
    {
      title: t('columns.company.title'),
      links: [
        { label: t('columns.company.links.about'), href: '/about' },
        { label: t('columns.company.links.contact'), href: '/contact' },
        { label: t('columns.company.links.blog'), href: '/blog' },
      ],
    },
    {
      title: t('columns.legal.title'),
      links: [
        { label: t('columns.legal.links.terms'), href: '/legal' },
        { label: t('columns.legal.links.privacy'), href: '/privacy' },
      ],
    },
  ];

  const taglineLines = t('tagline').split('\n');

  return (
    <footer className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        {/* Logo + Link columns on one row */}
        <div className="flex flex-col gap-8 sm:flex-row sm:gap-12">
          {/* Logo */}
          <div className="shrink-0">
            <Link
              href="/"
              className="font-[family-name:var(--font-inter)] text-xl font-bold text-white"
            >
              Attabl
            </Link>
            <p className="mt-1 text-xs text-neutral-400">
              {taglineLines.map((line, idx) => (
                <span key={idx}>
                  {line}
                  {idx < taglineLines.length - 1 && <br />}
                </span>
              ))}
            </p>
          </div>

          {/* Link groups */}
          <div className="flex flex-1 flex-wrap gap-8 sm:gap-12">
            {footerColumns.map((column) => (
              <div key={column.title}>
                <h3 className="mb-2 font-[family-name:var(--font-inter)] text-sm font-semibold text-white">
                  {column.title}
                </h3>
                <ul className="space-y-1.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="block text-xs text-neutral-400 transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-8 border-t border-white/10 pt-6">
          <p className="text-xs text-neutral-500">
            {t('copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>
    </footer>
  );
}
