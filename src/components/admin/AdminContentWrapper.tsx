'use client';

import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { isImmersivePage } from '@/lib/constants';

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

  // Immersive pages (KDS/POS) — no padding, no animation
  if (isImmersive) {
    return <div className="h-full">{children}</div>;
  }

  // Home page — minimal wrapper, dark bg handled by DashboardClient
  if (isHome) {
    return <div className="h-full w-full flex flex-col">{children}</div>;
  }

  const duration = prefersReduced ? 0 : 0.2;

  return (
    <div className="h-full w-full px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 flex flex-col">
      {chrome}
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          className="flex-1 min-h-0 flex flex-col"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
