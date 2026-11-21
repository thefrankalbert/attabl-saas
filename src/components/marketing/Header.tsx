'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Menu, Search, Utensils } from 'lucide-react';
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
import { LocaleToggle } from './LocaleToggle';

const NAV_LINK =
  'inline-flex items-center gap-1 rounded-full px-3 py-2 text-[15px] font-normal text-encre transition-colors hover:bg-gris dark:text-white';
const PANEL_BASE =
  'invisible absolute inset-x-0 top-full z-50 -translate-y-2.5 border-b border-trait bg-white text-encre opacity-0 shadow-[0_26px_44px_-30px_rgba(9,9,11,0.22)] transition-[opacity,transform,visibility] duration-200 motion-reduce:transition-none dark:bg-encre dark:text-white';
const PANEL_OPEN = 'visible translate-y-0 opacity-100';
const MEGA_BIG =
  'text-[30px] font-semibold tracking-[-0.025em] transition-colors group-hover/panel:text-encre/35 hover:!text-encre dark:group-hover/panel:text-white/35 dark:hover:!text-white';
const NEWS_LINK =
  'text-[15px] font-medium text-encre/75 hover:text-encre dark:text-white/75 dark:hover:text-white';
const CTA_PRIMARY =
  'inline-flex h-10 items-center rounded-full bg-encre px-5 text-[15px] font-medium text-white hover:bg-black dark:bg-white dark:text-encre dark:hover:bg-white/90';
// Intention de survol : delai avant de fermer ou de basculer vers un autre
// menu, pour descendre en diagonale vers les liens du panneau sans le perdre.
const HOVER_GRACE_MS = 180;

function Brand() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex size-[30px] items-center justify-center rounded-[8px] bg-encre text-white dark:bg-white dark:text-encre">
        <Utensils className="size-[17px]" strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="text-[20px] font-semibold tracking-[-0.03em]">Attabl</span>
    </span>
  );
}

export default function Header() {
  const t = useTranslations('marketing.header');
  const [open, setOpen] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const solId = useId();
  const featId = useId();
  const newsId = useId();
  const searchId = useId();

  const clearGrace = () => {
    if (graceTimer.current) {
      clearTimeout(graceTimer.current);
      graceTimer.current = null;
    }
  };
  const afterGrace = (fn: () => void) => {
    clearGrace();
    graceTimer.current = setTimeout(fn, HOVER_GRACE_MS);
  };

  // Minuterie de survol nettoyee au demontage.
  useEffect(() => clearGrace, []);

  // Close open menu on Escape (focus back to its button) or outside click.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const button = rootRef.current?.querySelector<HTMLElement>(`[data-menu-btn="${open}"]`);
      clearGrace();
      setOpen(null);
      button?.focus();
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

  // Search panel: focus the field once it is shown. Le panneau reste en
  // visibility: hidden au tout debut de sa transition et le navigateur refuse
  // alors le focus : on reessaie a chaque image (30 au plus).
  useEffect(() => {
    if (open !== 'search') return;
    let frame = 0;
    let tries = 0;
    const tryFocus = () => {
      const input = document.getElementById(searchId)?.querySelector('input');
      input?.focus();
      if (document.activeElement !== input && tries++ < 30) {
        frame = requestAnimationFrame(tryFocus);
      }
    };
    frame = requestAnimationFrame(tryFocus);
    return () => cancelAnimationFrame(frame);
  }, [open, searchId]);

  const hoverProps = (key: string) => ({
    onMouseEnter: () => {
      if (open && open !== key) {
        afterGrace(() => setOpen(key));
      } else {
        clearGrace();
        setOpen(key);
      }
    },
    onMouseLeave: () => {
      if (open === key) afterGrace(() => setOpen(null));
    },
  });

  const toggle = (key: string) => {
    clearGrace();
    setOpen(open === key ? null : key);
  };

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
      data-menu-btn={key}
      aria-haspopup="true"
      aria-expanded={open === key}
      aria-controls={id}
      onClick={() => toggle(key)}
      className={cn(NAV_LINK, 'h-auto bg-transparent dark:hover:bg-gris [&_svg]:size-[11px]')}
    >
      {label}
      <ChevronDown
        className={cn(
          'size-[11px] transition-transform duration-200 motion-reduce:transition-none',
          open === key && 'rotate-180',
        )}
        strokeWidth={2.5}
      />
    </Button>
  );

  return (
    <header
      ref={rootRef}
      data-nav-root
      className="sticky top-0 z-50 border-b border-trait bg-white text-encre dark:bg-encre dark:text-white"
    >
      {/* Frosted overlay dimming the page behind an open mega-menu */}
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-0 top-16 z-40 bg-white/55 opacity-0 backdrop-blur-[7px] transition-opacity duration-200 motion-reduce:transition-none dark:bg-encre/55',
          open && 'opacity-100',
        )}
      />
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-6 px-5 lg:px-8">
        <Link href="/" className="inline-flex shrink-0 items-center">
          <Brand />
        </Link>

        {/* Center nav (desktop) */}
        <nav className="hidden items-center gap-0.5 lg:flex">
          {/* Solutions */}
          <div className="static" {...hoverProps('sol')}>
            {trigger('sol', solId, t('solutions'))}
            <div
              id={solId}
              role="menu"
              data-menu-panel="sol"
              className={cn(PANEL_BASE, open === 'sol' && PANEL_OPEN)}
            >
              <div className="group/panel mx-auto flex max-w-[1376px] flex-col gap-0.5 px-8 py-11">
                {solutions.map((s) => (
                  <Link key={s.href} role="menuitem" href={s.href} className={MEGA_BIG}>
                    {s.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Fonctionnalites */}
          <div className="static" {...hoverProps('feat')}>
            {trigger('feat', featId, t('features'))}
            <div
              id={featId}
              role="menu"
              data-menu-panel="feat"
              className={cn(PANEL_BASE, open === 'feat' && PANEL_OPEN)}
            >
              <div className="group/panel mx-auto grid max-w-[1376px] grid-cols-1 gap-x-12 gap-y-1 px-8 py-11 sm:grid-cols-2">
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
          <div className="static" {...hoverProps('news')}>
            {trigger('news', newsId, t('news'))}
            <div
              id={newsId}
              role="menu"
              data-menu-panel="news"
              className={cn(PANEL_BASE, open === 'news' && PANEL_OPEN)}
            >
              <div className="mx-auto flex max-w-[1376px] flex-col gap-1 px-8 py-11">
                <Link role="menuitem" href="/nouveautes" className={NEWS_LINK}>
                  {t('newsMenu.releases')}
                </Link>
                <Link role="menuitem" href="/nouveautes" className={NEWS_LINK}>
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
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link href="/support" className={cn(NAV_LINK, 'hidden lg:inline-flex')}>
            {t('support')}
          </Link>
          <Link href="/login" className={cn(NAV_LINK, 'hidden lg:inline-flex')}>
            {t('login')}
          </Link>

          {/* Recherche. PAS de survol ici, contrairement aux menus
              voisins: ce panneau s'ouvre au CLIC, et son champ de saisie
              s'affiche dans une barre pleine largeur SOUS l'en-tete. Le bloc
              qui porterait l'evenement, lui, ne fait que la taille de l'icone.
              La souris qui descend vers le champ traverse forcement l'en-tete,
              donc elle "sort" du bloc et tout se refermait avant qu'on puisse
              taper. Mesure du 2026-11-06: ferme 40px apres l'icone, bien avant
              d'atteindre le champ.

              La fermeture reste assuree par le code plus haut dans ce fichier:
              touche Echap, clic en dehors de l'en-tete, ou second clic sur
              l'icone. */}
          <div className="static hidden lg:block">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-menu-btn="search"
              aria-haspopup="true"
              aria-expanded={open === 'search'}
              aria-controls={searchId}
              aria-label={t('searchLabel')}
              onClick={() => toggle('search')}
              className="size-10 rounded-full text-encre hover:bg-gris dark:text-white dark:hover:bg-gris [&_svg]:size-[18px]"
            >
              <Search className="size-[18px]" />
            </Button>
            <div
              id={searchId}
              data-menu-panel="search"
              className={cn(PANEL_BASE, open === 'search' && PANEL_OPEN)}
            >
              <form action="/recherche" className="mx-auto max-w-[1376px] px-8 py-11">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-0 top-2.5 size-[30px] text-encre/40 dark:text-white/40" />
                  <Input
                    type="search"
                    name="q"
                    placeholder={t('searchPlaceholder')}
                    aria-label={t('searchLabel')}
                    className="h-auto rounded-none border-0 border-b-2 border-trait bg-transparent px-0 pb-4 pl-[46px] pt-1.5 text-[30px] font-medium tracking-[-0.02em] text-encre shadow-none placeholder:text-encre/35 focus-visible:border-encre focus-visible:ring-0 md:text-[30px] dark:bg-transparent dark:text-white dark:placeholder:text-white/35 dark:focus-visible:border-white"
                  />
                </div>
              </form>
            </div>
          </div>

          <Link href="/signup" className={cn(CTA_PRIMARY, 'hidden lg:inline-flex')}>
            {t('getStarted')}
          </Link>
          <LocaleToggle className="h-10 rounded-full border-0 bg-transparent px-3 font-mono text-[13px] font-normal text-encre hover:bg-gris hover:text-encre dark:text-white dark:hover:bg-gris dark:hover:text-white" />

          {/* Mobile menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('openMenu')}
                className="size-10 rounded-full border border-trait bg-transparent text-encre hover:bg-gris lg:hidden dark:text-white dark:hover:bg-gris [&_svg]:size-[18px]"
              >
                <Menu className="size-[18px]" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              // Focus sur le premier lien a l'ouverture (Radix viserait sinon le
              // premier element focusable du panneau).
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).querySelector<HTMLElement>('nav a')?.focus();
              }}
              className="w-full max-w-sm border-trait bg-white p-0 text-encre dark:bg-encre dark:text-white"
            >
              <SheetHeader className="flex h-16 justify-center border-b border-trait px-5 text-left">
                <SheetTitle className="text-[20px] font-semibold tracking-[-0.03em]">
                  Attabl
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col px-4 py-4">
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
                      className="border-b border-trait px-2 py-3 text-[15px] font-medium"
                    >
                      {l.label}
                    </Link>
                  </SheetClose>
                ))}
                <SheetClose asChild>
                  <Link
                    href="/signup"
                    className="mt-4 rounded-full bg-encre px-4 py-3 text-center text-[15px] font-semibold text-white dark:bg-white dark:text-encre"
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
