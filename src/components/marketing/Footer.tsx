import Link from 'next/link';

const footerColumns = [
  {
    title: 'Produit',
    links: [
      { label: 'Fonctionnalités', href: '/features' },
      { label: 'Tarifs', href: '/pricing' },
      { label: 'Démo', href: '/signup' },
    ],
  },
  {
    title: 'Solutions',
    links: [
      { label: 'Restaurants', href: '/restaurants' },
      { label: 'Hôtels', href: '/hotels' },
      { label: 'Quick-Service', href: '/quick-service' },
      { label: 'Bars & Cafés', href: '/bars-cafes' },
      { label: 'Fast-Food', href: '/fast-food' },
    ],
  },
  {
    title: 'Entreprise',
    links: [
      { label: 'À propos', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'Blog', href: '/blog' },
    ],
  },
  {
    title: 'Légal',
    links: [
      { label: 'CGU', href: '/legal' },
      { label: 'Confidentialité', href: '/privacy' },
    ],
  },
] as const;

export default function Footer() {
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
              La plateforme moderne
              <br />
              pour la restauration
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
          <p className="text-xs text-neutral-500">&copy; 2026 Attabl. Tous droits réservés.</p>
        </div>
      </div>
    </footer>
  );
}
