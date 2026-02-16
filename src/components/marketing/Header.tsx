'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, Search, ShoppingCart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const segments = [
  { label: 'Restaurants', href: '/restaurants', description: 'Gastronomie et service à table' },
  { label: 'Hôtels', href: '/hotels', description: 'Room service et multi-venues' },
  { label: 'Quick-Service', href: '/quick-service', description: 'Rapidité et efficacité' },
  { label: 'Bars & Cafés', href: '/bars-cafes', description: 'Comptoir et terrasse' },
  { label: 'Food Trucks', href: '/food-trucks', description: 'Mobile et connecté' },
  { label: 'Boulangeries', href: '/boulangeries', description: 'Artisanat et précision' },
  { label: 'Dark Kitchens', href: '/dark-kitchens', description: 'Optimisé pour la livraison' },
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
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const menuOpen = activeMegaMenu !== null;

  return (
    <>
      {/* Header */}
      <header
        className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
          scrolled || menuOpen ? 'bg-white' : 'bg-transparent'
        }`}
      >
        <div className="flex w-full items-center px-8 py-5">
          {/* Logo - Far Left */}
          <Link
            href="/"
            className={`text-2xl font-bold transition-colors ${
              scrolled || menuOpen ? 'text-black' : 'text-white'
            }`}
          >
            Attabl
          </Link>

          {/* Navigation - Left with spacing */}
          <nav className="ml-16 hidden items-center gap-10 md:flex">
            <button
              type="button"
              onMouseEnter={() => setActiveMegaMenu('solutions')}
              className={`text-base font-semibold transition-colors ${
                scrolled || menuOpen
                  ? 'text-neutral-900 hover:text-neutral-600'
                  : 'text-white hover:text-white/80'
              }`}
            >
              Solutions
            </button>
            <button
              type="button"
              onMouseEnter={() => setActiveMegaMenu('features')}
              className={`text-base font-semibold transition-colors ${
                scrolled || menuOpen
                  ? 'text-neutral-900 hover:text-neutral-600'
                  : 'text-white hover:text-white/80'
              }`}
            >
              Fonctionnalités
            </button>
            <Link
              href="/pricing"
              className={`text-base font-semibold transition-colors ${
                scrolled || menuOpen
                  ? 'text-neutral-900 hover:text-neutral-600'
                  : 'text-white hover:text-white/80'
              }`}
            >
              Tarifs
            </Link>
            <Link
              href="#nouveautes"
              className={`text-base font-semibold transition-colors ${
                scrolled || menuOpen
                  ? 'text-neutral-900 hover:text-neutral-600'
                  : 'text-white hover:text-white/80'
              }`}
            >
              Nouveautés
            </Link>
          </nav>

          {/* Actions - Right */}
          <div className="ml-auto flex items-center gap-6">
            <div className="hidden items-center gap-6 md:flex">
              <Link
                href="/login"
                className={`text-base font-semibold transition-colors ${
                  scrolled || menuOpen
                    ? 'text-neutral-900 hover:text-neutral-600'
                    : 'text-white hover:text-white/80'
                }`}
              >
                Se connecter
              </Link>
              <Link
                href="#support"
                className={`text-base font-semibold transition-colors ${
                  scrolled || menuOpen
                    ? 'text-neutral-900 hover:text-neutral-600'
                    : 'text-white hover:text-white/80'
                }`}
              >
                Support
              </Link>
              <button
                type="button"
                className={`transition-colors ${
                  scrolled || menuOpen
                    ? 'text-neutral-900 hover:text-neutral-600'
                    : 'text-white hover:text-white/80'
                }`}
              >
                <Search className="h-5 w-5" />
              </button>
              <button
                type="button"
                className={`transition-colors ${
                  scrolled || menuOpen
                    ? 'text-neutral-900 hover:text-neutral-600'
                    : 'text-white hover:text-white/80'
                }`}
              >
                <ShoppingCart className="h-5 w-5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className={`inline-flex items-center justify-center rounded-lg p-2 transition-colors md:hidden ${
                scrolled || menuOpen
                  ? 'text-neutral-700 hover:bg-neutral-50'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Fullwidth Mega Menu */}
      {activeMegaMenu && (
        <div
          onMouseLeave={() => setActiveMegaMenu(null)}
          className="fixed left-0 right-0 top-0 z-40 bg-white pt-[77px]"
        >
          <div className="px-8 py-12">
            {activeMegaMenu === 'solutions' && (
              <div className="flex flex-col gap-6">
                {segments.map((seg) => (
                  <Link
                    key={seg.href}
                    href={seg.href}
                    onClick={() => setActiveMegaMenu(null)}
                    className="group flex flex-col gap-1 transition-all hover:translate-x-1"
                  >
                    <span className="text-2xl font-semibold text-neutral-900 group-hover:text-primary">
                      {seg.label}
                    </span>
                    <p className="text-sm text-neutral-600">{seg.description}</p>
                  </Link>
                ))}
              </div>
            )}
            {activeMegaMenu === 'features' && (
              <div className="flex flex-col gap-6">
                {features.map((feat) => (
                  <Link
                    key={feat.href}
                    href={feat.href}
                    onClick={() => setActiveMegaMenu(null)}
                    className="group flex flex-col gap-1 transition-all hover:translate-x-1"
                  >
                    <span className="text-2xl font-semibold text-neutral-900 group-hover:text-primary">
                      {feat.label}
                    </span>
                    <p className="text-sm text-neutral-600">{feat.description}</p>
                  </Link>
                ))}
                <Link
                  href="/features"
                  onClick={() => setActiveMegaMenu(null)}
                  className="mt-4 text-base font-semibold text-primary transition-all hover:translate-x-1"
                >
                  Toutes les fonctionnalités →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-white md:hidden"
          >
            <div className="flex h-full flex-col overflow-y-auto px-4 py-20 sm:px-6">
              <div className="space-y-1">
                {segments.map((seg) => (
                  <Link
                    key={seg.href}
                    href={seg.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-4 py-4 text-base font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    {seg.label}
                  </Link>
                ))}
              </div>
              <div className="mt-8 space-y-1">
                <Link
                  href="/features"
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-xl px-4 py-4 text-base font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Fonctionnalités
                </Link>
                <Link
                  href="/pricing"
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-xl px-4 py-4 text-base font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Tarifs
                </Link>
              </div>
              <div className="mt-auto pt-6">
                <Link
                  href="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="block w-full rounded-xl bg-black px-6 py-4 text-center text-base font-semibold text-white"
                >
                  Commencer gratuitement
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
