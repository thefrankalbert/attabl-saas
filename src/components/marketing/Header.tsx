'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Menu, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { AttablLogo } from './AttablLogo';
import { LocaleToggle } from './LocaleToggle';

const NAV_LINK =
  'inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50';
const PANEL_BASE =
  'invisible absolute left-0 right-0 top-full z-50 -translate-y-2.5 border-b border-zinc-200 bg-white/95 opacity-0 shadow-[0_26px_44px_-30px_rgba(9,9,11,0.22)] backdrop-blur-md transition-[opacity,transform,visibility] duration-200 dark:border-zinc-800 dark:bg-zinc-950/95';
const PANEL_OPEN = 'visible translate-y-0 opacity-100';
const MEGA_BIG =
  'text-3xl font-semibold tracking-[-0.025em] text-zinc-950 transition-colors group-hover/panel:text-zinc-400 hover:!text-zinc-950 dark:text-zinc-50 dark:group-hover/panel:text-zinc-500 dark:hover:!text-zinc-50';
const CTA_PRIMARY =
  'inline-flex items-center rounded-lg bg-zinc-900 px-[15px] py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200';

export default function Header() {
  const t = useTranslations('marketing.header');
  const [open, setOpen] = useState<string | null>(null);
  const solId = useId();
  const featId = useId();
  const newsId = useId();
  const searchId = useId();

  // Close open menu on Escape or outside click.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-nav-root]')) setOpen(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const solutions = [
    { label: t('segments.restaurants.label'), href: '/solutions#ind-restaurant' },
    { label: t('segments.hotels.label'), href: '/solutions#ind-hotel' },
    { label: t('segments.quickService.label'), href: '/solutions#ind-qsr' },
    { label: t('segments.barsCafes.label'), href: '/solutions#ind-bar' },
  ];
  const fcat = [
    { k: 'menu', href: '/features#fcat-menu' },
    { k: 'checkout', href: '/features#fcat-caisse' },
    { k: 'kitchen', href: '/features#fcat-cuisine' },
    { k: 'stock', href: '/features#fcat-stock' },
    { k: 'reports', href: '/features#fcat-rapports' },
    { k: 'team', href: '/features#fcat-equipe' },
  ];

  const trigger = (key: string, id: string, label: string) => (
    <Button
      type="button"
      variant="ghost"
      aria-haspopup="true"
      aria-expanded={open === key}
      aria-controls={id}
      onClick={() => setOpen(open === key ? null : key)}
      className={cn(NAV_LINK, 'h-auto bg-transparent hover:bg-transparent')}
    >
      {label}
      <ChevronDown
        className={cn(
          'h-[11px] w-[11px] transition-transform duration-200',
          open === key && 'rotate-180',
        )}
      />
    </Button>
  );

  return (
    <header
      data-nav-root
      className="sticky top-0 z-50 flex h-[58px] items-center justify-center border-b border-zinc-200 bg-white/85 backdrop-blur-lg backdrop-saturate-[180%] dark:border-zinc-800 dark:bg-zinc-950/85"
    >
      {/* Frosted overlay dimming the page behind an open mega-menu */}
      {open && (
        <div
          aria-hidden
          className="fixed inset-x-0 bottom-0 top-[58px] z-40 bg-white/55 backdrop-blur-[7px] dark:bg-zinc-950/55"
        />
      )}
      <div className="flex w-full max-w-[1200px] items-center justify-between px-5 sm:px-7">
        <Link href="/" className="shrink-0">
          <AttablLogo size="nav" />
        </Link>

        {/* Center nav (desktop) */}
        <nav className="hidden items-center gap-0.5 lg:flex">
          {/* Solutions */}
          <div
            className="static"
            onMouseEnter={() => setOpen('sol')}
            onMouseLeave={() => setOpen(null)}
          >
            {trigger('sol', solId, t('solutions'))}
            <div id={solId} role="menu" className={cn(PANEL_BASE, open === 'sol' && PANEL_OPEN)}>
              <div className="group/panel mx-auto flex max-w-[1144px] flex-col gap-0.5 px-7 py-11">
                {solutions.map((s) => (
                  <Link key={s.href} role="menuitem" href={s.href} className={MEGA_BIG}>
                    {s.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Fonctionnalites */}
          <div
            className="static"
            onMouseEnter={() => setOpen('feat')}
            onMouseLeave={() => setOpen(null)}
          >
            {trigger('feat', featId, t('features'))}
            <div id={featId} role="menu" className={cn(PANEL_BASE, open === 'feat' && PANEL_OPEN)}>
              <div className="group/panel mx-auto grid max-w-[1144px] grid-cols-1 gap-x-12 gap-y-1 px-7 py-11 sm:grid-cols-2">
                {fcat.map((f) => (
                  <Link key={f.k} role="menuitem" href={f.href} className={MEGA_BIG}>
                    {t(`fcat.${f.k}`)}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <Link href="/pricing" className={NAV_LINK}>
            {t('pricing')}
          </Link>

          {/* Nouveautes */}
          <div
            className="static"
            onMouseEnter={() => setOpen('news')}
            onMouseLeave={() => setOpen(null)}
          >
            {trigger('news', newsId, t('news'))}
            <div id={newsId} role="menu" className={cn(PANEL_BASE, open === 'news' && PANEL_OPEN)}>
              <div className="mx-auto flex max-w-[1144px] flex-col gap-1 px-7 py-11">
                <Link
                  role="menuitem"
                  href="/nouveautes"
                  className="text-sm font-medium text-zinc-700 transition-colors hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
                >
                  {t('newsMenu.releases')}
                </Link>
                <Link
                  role="menuitem"
                  href="/nouveautes"
                  className="text-sm font-medium text-zinc-700 transition-colors hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
                >
                  {t('newsMenu.changelog')}
                </Link>
              </div>
            </div>
          </div>

          <Link href="/blog" className={NAV_LINK}>
            {t('blog')}
          </Link>
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/support" className={cn(NAV_LINK, 'hidden lg:inline-flex')}>
            {t('support')}
          </Link>
          <Link href="/login" className={cn(NAV_LINK, 'hidden lg:inline-flex')}>
            {t('login')}
          </Link>

          {/* Search */}
          <div className="static hidden lg:block" onMouseLeave={() => setOpen(null)}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-haspopup="true"
              aria-expanded={open === 'search'}
              aria-controls={searchId}
              aria-label={t('searchLabel')}
              onClick={() => setOpen(open === 'search' ? null : 'search')}
              className="h-[34px] w-[34px] rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              <Search className="h-[17px] w-[17px]" />
            </Button>
            <div id={searchId} className={cn(PANEL_BASE, open === 'search' && PANEL_OPEN)}>
              <form action="/recherche" className="mx-auto max-w-[1144px] px-7 py-11">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-0 top-2.5 h-[30px] w-[30px] text-zinc-400" />
                  <Input
                    type="search"
                    name="q"
                    placeholder={t('searchPlaceholder')}
                    aria-label={t('searchLabel')}
                    className="h-auto rounded-none border-0 border-b-2 border-zinc-200 bg-transparent px-0 pb-4 pl-[46px] pt-1.5 text-[30px] font-medium tracking-[-0.02em] text-zinc-950 shadow-none focus-visible:border-zinc-900 focus-visible:ring-0 dark:border-zinc-700 dark:text-zinc-50 dark:focus-visible:border-zinc-300"
                  />
                </div>
              </form>
            </div>
          </div>

          <Link href="/signup" className={cn(CTA_PRIMARY, 'hidden lg:inline-flex')}>
            {t('getStarted')}
          </Link>
          <LocaleToggle />

          {/* Mobile menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('openMenu')}
                className="h-[38px] w-[38px] rounded-lg border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 lg:hidden dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
              >
                <Menu className="h-[18px] w-[18px]" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-full max-w-sm border-zinc-200 bg-white p-0 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <SheetHeader className="border-b border-zinc-200 px-5 py-4 text-left dark:border-zinc-800">
                <SheetTitle>
                  <AttablLogo size="nav" />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-0.5 px-4 py-4">
                {[
                  { label: t('solutions'), href: '/solutions' },
                  { label: t('features'), href: '/features' },
                  { label: t('pricing'), href: '/pricing' },
                  { label: t('news'), href: '/nouveautes' },
                  { label: t('blog'), href: '/blog' },
                  { label: t('support'), href: '/support' },
                  { label: t('login'), href: '/login' },
                ].map((l) => (
                  <SheetClose asChild key={`${l.label}-${l.href}`}>
                    <Link
                      href={l.href}
                      className="border-b border-zinc-100 px-2 py-3 text-[15px] font-medium text-zinc-900 dark:border-zinc-900 dark:text-zinc-100"
                    >
                      {l.label}
                    </Link>
                  </SheetClose>
                ))}
                <SheetClose asChild>
                  <Link
                    href="/signup"
                    className="mt-3 justify-center rounded-lg bg-zinc-900 px-4 py-3 text-center text-[15px] font-semibold text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                  >
                    {t('getStartedFree')}
                  </Link>
                </SheetClose>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
