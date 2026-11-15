'use client';

import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { isImmersivePage } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { BottomNavSpacer } from '@/components/admin/bottom-nav-context';

interface AdminContentWrapperProps {
  children: React.ReactNode;
  chrome?: React.ReactNode;
}

export function AdminContentWrapper({ children, chrome }: AdminContentWrapperProps) {
  const pathname = usePathname();
  const prefersReduced = useReducedMotion();
  const isImmersive = isImmersivePage(pathname);

  // Check if this is the home/dashboard page (path ends with /admin or /admin/)
  const isHome = /\/admin\/?$/.test(pathname ?? '');
  // Full-bleed pages need minimal padding and NO centered max-width column
  // (service floor plan, chevalet/supports editor - both are edge-to-edge canvases).
  const isFullBleed = pathname?.includes('/admin/service') || pathname?.includes('/admin/supports');

  // Immersive pages (KDS/POS) - no padding, no animation, and no `chrome`:
  // these full-screen staff surfaces own their whole height. The frozen /
  // expired-trial redirect is NOT part of `chrome` (LockedSubscriptionRedirect,
  // mounted by the admin layout), so it still runs here.
  if (isImmersive) {
    return <div className="flex-1 min-h-0">{children}</div>;
  }

  // Home page - minimal wrapper, dark bg handled by DashboardClient. It is the
  // post-login landing page: the subscription banners must show here too.
  if (isHome) {
    return (
      <div className="flex-1 min-h-0 w-full flex flex-col">
        {chrome}
        {children}
        <BottomNavSpacer />
      </div>
    );
  }

  const duration = prefersReduced ? 0 : 0.2;

  return (
    <div
      className={cn(
        // overflow-x-clip, NOT overflow-hidden: `hidden` also cut the vertical
        // overflow, so the end of a page taller than the screen could not be
        // reached at all (measured 2026-11-14: Permissions lost its last rows at
        // every width, Tables and Service on phones). `clip` keeps sideways
        // overflow out while main#main-content scrolls the rest (rule 12).
        'flex-1 min-h-0 w-full flex flex-col overflow-x-clip',
        isFullBleed
          ? 'px-2 py-2 sm:px-3 sm:py-3'
          : 'px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8 lg:px-12 lg:py-10 2xl:px-16 2xl:py-12',
      )}
    >
      {chrome}
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          className={cn(
            'flex-1 min-h-0 flex flex-col w-full',
            // Canonical content column: full width, capped + centered. Viewport
            // breakpoints (lg/2xl) per .claude/rules/03-responsive-design.md - the
            // admin must adapt to the VIEWPORT, not the sidebar-shrunk content width.
            !isFullBleed && 'max-w-7xl lg:max-w-[90rem] 2xl:max-w-[100rem] mx-auto',
          )}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration, ease: 'easeOut' }}
        >
          {children}
          {/* After the content, so it stays after the last row even when a long
              page overflows this column. */}
          <BottomNavSpacer />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
