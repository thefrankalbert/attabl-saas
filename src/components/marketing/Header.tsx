'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shared/ThemeToggle';

export default function Header() {
  const t = useTranslations('marketing.header');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeMegaMenu, setActiveMegaMenu] = useState<'solutions' | 'features' | null>(null);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const segments = [
    {
      label: t('segments.restaurants.label'),
      href: '/restaurants',
      description: t('segments.restaurants.description'),
    },
    {
      label: t('segments.hotels.label'),
      href: '/hotels',
      description: t('segments.hotels.description'),
    },
    {
      label: t('segments.quickService.label'),
      href: '/quick-service',
      description: t('segments.quickService.description'),
    },
    {
      label: t('segments.barsCafes.label'),
      href: '/bars-cafes',
      description: t('segments.barsCafes.description'),
    },
    {
      label: t('segments.fastFood.label'),
      href: '/fast-food',
      description: t('segments.fastFood.description'),
    },
  ];

  const features = [
    {
      label: t('featuresList.menu.label'),
      href: '/features#menu',
      description: t('featuresList.menu.description'),
    },
    {
      label: t('featuresList.orders.label'),
      href: '/features#orders',
      description: t('featuresList.orders.description'),
    },
    {
      label: t('featuresList.stock.label'),
      href: '/features#stock',
      description: t('featuresList.stock.description'),
    },
    {
      label: t('featuresList.analytics.label'),
      href: '/features#analytics',
      description: t('featuresList.analytics.description'),
    },
    {
      label: t('featuresList.currencies.label'),
      href: '/features#currencies',
      description: t('featuresList.currencies.description'),
    },
  ];

  return (
    <>
      {/* Header */}
      <header className="fixed left-0 right-0 top-0 z-50 bg-white dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex w-full items-center px-4 py-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="text-2xl font-bold text-neutral-900 dark:text-white">
            Attabl
          </Link>

          {/* Navigation */}
          <nav className="ml-8 hidden items-center gap-6 lg:ml-16 md:flex lg:gap-10">
            <Button
              type="button"
              variant="ghost"
              onMouseEnter={() => setActiveMegaMenu('solutions')}
              onClick={() =>
                setActiveMegaMenu((prev) => (prev === 'solutions' ? null : 'solutions'))
              }
              className="text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white h-auto px-2 py-1"
            >
              {t('solutions')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onMouseEnter={() => setActiveMegaMenu('features')}
              onClick={() => setActiveMegaMenu((prev) => (prev === 'features' ? null : 'features'))}
              className="text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white h-auto px-2 py-1"
            >
              {t('features')}
            </Button>
            <Link
              href="/pricing"
              className="text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              {t('pricing')}
            </Link>
            <Link
              href="/nouveautes"
              className="text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              {t('news')}
            </Link>
            <Link
              href="/blog"
              className="text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              {t('blog')}
            </Link>
          </nav>

          {/* Actions */}
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle className="hidden md:flex w-8 h-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors" />
            <Link
              href="/login"
              className="hidden text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors md:block"
            >
              {t('login')}
            </Link>
            <Link
              href="/signup"
              className="hidden bg-neutral-900 text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors md:block"
            >
              {t('getStarted')}
            </Link>

            {/* Mobile hamburger */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Open menu"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="min-h-[44px] min-w-[44px] rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 md:hidden"
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Mega Menu */}
      {activeMegaMenu && (
        <div
          onMouseLeave={() => setActiveMegaMenu(null)}
          className="fixed left-0 right-0 top-0 z-40 bg-white dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 pt-[65px]"
        >
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            {activeMegaMenu === 'solutions' && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {segments.map((seg) => (
                  <Link
                    key={seg.href}
                    href={seg.href}
                    onClick={() => setActiveMegaMenu(null)}
                    className="group rounded-lg p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <span className="text-sm font-semibold text-neutral-900 dark:text-white group-hover:text-neutral-700 dark:group-hover:text-neutral-300">
                      {seg.label}
                    </span>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                      {seg.description}
                    </p>
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
                    className="group rounded-lg p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <span className="text-sm font-semibold text-neutral-900 dark:text-white group-hover:text-neutral-700 dark:group-hover:text-neutral-300">
                      {feat.label}
                    </span>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                      {feat.description}
                    </p>
                  </Link>
                ))}
                <Link
                  href="/features"
                  onClick={() => setActiveMegaMenu(null)}
                  className="rounded-lg p-4 text-sm font-semibold text-neutral-900 dark:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                >
                  {t('allFeatures')} &rarr;
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-white dark:bg-neutral-950 lg:hidden">
          <div className="flex h-full flex-col overflow-y-auto px-4 py-20 pb-[env(safe-area-inset-bottom,20px)] sm:px-6">
            <div className="space-y-1">
              <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                {t('solutions')}
              </p>
              {segments.map((seg) => (
                <Link
                  key={seg.href}
                  href={seg.href}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-lg px-4 py-3 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                >
                  {seg.label}
                </Link>
              ))}
            </div>
            <div className="mt-6 space-y-1">
              <Link
                href="/features"
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-4 py-3 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                {t('features')}
              </Link>
              <Link
                href="/pricing"
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-4 py-3 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                {t('pricing')}
              </Link>
              <Link
                href="/nouveautes"
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-4 py-3 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                {t('news')}
              </Link>
              <Link
                href="/blog"
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-4 py-3 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                {t('blog')}
              </Link>
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-4 py-3 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                {t('login')}
              </Link>
            </div>
            <div className="mt-auto pt-6 space-y-4">
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                  {t('appearance')}
                </span>
                <ThemeToggle className="w-9 h-9 flex items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors" />
              </div>
              <Link
                href="/signup"
                onClick={() => setMobileOpen(false)}
                className="block w-full rounded-lg bg-neutral-900 px-6 py-3 text-center text-sm font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors"
              >
                {t('getStartedFree')}
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
