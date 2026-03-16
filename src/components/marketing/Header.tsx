'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

const segments = [
  { label: 'Restaurants', href: '/restaurants', description: 'Gastronomie et service à table' },
  { label: 'Hôtels', href: '/hotels', description: 'Room service et multi-venues' },
  { label: 'Quick-Service', href: '/quick-service', description: 'Rapidité et efficacité' },
  { label: 'Bars & Cafés', href: '/bars-cafes', description: 'Comptoir et terrasse' },
  { label: 'Fast-Food', href: '/fast-food', description: 'Vitesse et volume optimisés' },
];

const features = [
  { label: 'Menu Digital', href: '/features#menu', description: 'QR code, bilingue, modifiers' },
  { label: 'Commandes', href: '/features#orders', description: '4 modes de service' },
  { label: 'Stock & Recettes', href: '/features#stock', description: 'Déstockage automatique' },
  { label: 'Analytics', href: '/features#analytics', description: 'Rapports en temps réel' },
  { label: 'Multi-devises', href: '/features#currencies', description: 'XAF, EUR, USD' },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeMegaMenu, setActiveMegaMenu] = useState<'solutions' | 'features' | null>(null);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <>
      {/* Header */}
      <header className="fixed left-0 right-0 top-0 z-50 bg-white border-b border-neutral-200">
        <div className="flex w-full items-center px-4 py-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="text-2xl font-bold text-neutral-900">
            Attabl
          </Link>

          {/* Navigation */}
          <nav className="ml-8 hidden items-center gap-6 lg:ml-16 lg:flex lg:gap-10">
            <button
              type="button"
              onMouseEnter={() => setActiveMegaMenu('solutions')}
              onClick={() =>
                setActiveMegaMenu((prev) => (prev === 'solutions' ? null : 'solutions'))
              }
              className="text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              Solutions
            </button>
            <button
              type="button"
              onMouseEnter={() => setActiveMegaMenu('features')}
              onClick={() => setActiveMegaMenu((prev) => (prev === 'features' ? null : 'features'))}
              className="text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              Fonctionnalités
            </button>
            <Link
              href="/pricing"
              className="text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              Tarifs
            </Link>
            <Link
              href="/nouveautes"
              className="text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              Nouveautés
            </Link>
            <Link
              href="/blog"
              className="text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              Blog
            </Link>
          </nav>

          {/* Actions */}
          <div className="ml-auto flex items-center gap-4">
            <Link
              href="/login"
              className="hidden text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors lg:block"
            >
              Se connecter
            </Link>
            <Link
              href="/signup"
              className="hidden bg-neutral-900 text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:bg-neutral-800 transition-colors lg:block"
            >
              Démarrer
            </Link>

            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-neutral-700 hover:bg-neutral-50 transition-colors lg:hidden"
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mega Menu */}
      {activeMegaMenu && (
        <div
          onMouseLeave={() => setActiveMegaMenu(null)}
          className="fixed left-0 right-0 top-0 z-40 bg-white border-b border-neutral-200 pt-[65px]"
        >
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            {activeMegaMenu === 'solutions' && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {segments.map((seg) => (
                  <Link
                    key={seg.href}
                    href={seg.href}
                    onClick={() => setActiveMegaMenu(null)}
                    className="group rounded-lg p-4 hover:bg-neutral-50 transition-colors"
                  >
                    <span className="text-sm font-semibold text-neutral-900 group-hover:text-neutral-700">
                      {seg.label}
                    </span>
                    <p className="text-sm text-neutral-500 mt-1">{seg.description}</p>
                  </Link>
                ))}
              </div>
            )}
            {activeMegaMenu === 'features' && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {features.map((feat) => (
                  <Link
                    key={feat.href}
                    href={feat.href}
                    onClick={() => setActiveMegaMenu(null)}
                    className="group rounded-lg p-4 hover:bg-neutral-50 transition-colors"
                  >
                    <span className="text-sm font-semibold text-neutral-900 group-hover:text-neutral-700">
                      {feat.label}
                    </span>
                    <p className="text-sm text-neutral-500 mt-1">{feat.description}</p>
                  </Link>
                ))}
                <Link
                  href="/features"
                  onClick={() => setActiveMegaMenu(null)}
                  className="rounded-lg p-4 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 transition-colors"
                >
                  Toutes les fonctionnalités &rarr;
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-white lg:hidden">
          <div className="flex h-full flex-col overflow-y-auto px-4 py-20 pb-[env(safe-area-inset-bottom,20px)] sm:px-6">
            <div className="space-y-1">
              <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Solutions
              </p>
              {segments.map((seg) => (
                <Link
                  key={seg.href}
                  href={seg.href}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-lg px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  {seg.label}
                </Link>
              ))}
            </div>
            <div className="mt-6 space-y-1">
              <Link
                href="/features"
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Fonctionnalités
              </Link>
              <Link
                href="/pricing"
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Tarifs
              </Link>
              <Link
                href="/nouveautes"
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Nouveautés
              </Link>
              <Link
                href="/blog"
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Blog
              </Link>
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Se connecter
              </Link>
            </div>
            <div className="mt-auto pt-6">
              <Link
                href="/signup"
                onClick={() => setMobileOpen(false)}
                className="block w-full rounded-lg bg-neutral-900 px-6 py-3 text-center text-sm font-semibold text-white hover:bg-neutral-800 transition-colors"
              >
                Démarrer gratuitement
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
