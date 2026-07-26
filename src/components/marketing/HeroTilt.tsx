'use client';

import { motion, useReducedMotion } from 'framer-motion';

/**
 * Entrance tilt for the hero product frame: mounts leaning back
 * (rotateX + slight scale/lift) and straightens flat over ~1.2s.
 * The marketing shell scrolls in an inner container (not window), so a
 * scroll-linked effect would not track; a one-shot mount entrance is used
 * instead. Disabled under prefers-reduced-motion (renders a static frame).
 */
export function HeroTilt({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div style={{ perspective: 1600 }}>
      <motion.div
        initial={{ rotateX: 14, scale: 0.96, y: 20, opacity: 0 }}
        animate={{ rotateX: 0, scale: 1, y: 0, opacity: 1 }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: '50% 0%', transformPerspective: 1600, willChange: 'transform' }}
        className={className}
      >
        {children}
      </motion.div>
    </div>
  );
}
