'use client';

import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

/**
 * Pages that need immersive mode (no padding, no breadcrumbs, no notification bell).
 * The KDS and POS need maximum screen real estate.
 */
const IMMERSIVE_SEGMENTS = ['/kitchen', '/pos'];

interface AdminContentWrapperProps {
  children: React.ReactNode;
  /** Content to show only on non-immersive pages (breadcrumbs, notification bell, etc.) */
  chrome?: React.ReactNode;
}

export function AdminContentWrapper({ children, chrome }: AdminContentWrapperProps) {
  const pathname = usePathname();
  const prefersReduced = useReducedMotion();
  const isImmersive = IMMERSIVE_SEGMENTS.some((seg) => pathname?.includes(`/admin${seg}`));

  // Immersive pages (KDS/POS) — no transition, instant render
  if (isImmersive) {
    return <div className="h-full">{children}</div>;
  }

  const duration = prefersReduced ? 0 : 0.2;

  return (
    <div className="max-w-7xl mx-auto w-full px-3 pb-4 sm:px-4 md:px-6 lg:p-8 pt-14">
      {chrome}
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 10 }}
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
