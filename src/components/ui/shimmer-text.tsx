'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface ShimmerTextProps {
  children: React.ReactNode;
  className?: string;
  duration?: number;
  delay?: number;
}

export function ShimmerText({ children, className, duration = 3, delay = 1.5 }: ShimmerTextProps) {
  return (
    <motion.span
      className={cn(
        'inline [--shimmer-contrast:rgba(255,255,255,0.6)] dark:[--shimmer-contrast:rgba(0,0,0,0.5)]',
        className,
      )}
      style={
        {
          WebkitTextFillColor: 'transparent',
          background:
            'currentColor linear-gradient(to right, currentColor 0%, var(--shimmer-contrast) 45%, var(--shimmer-contrast) 55%, currentColor 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '20% 100%',
        } as React.CSSProperties
      }
      initial={{ backgroundPositionX: '-20%' }}
      animate={{ backgroundPositionX: ['-20%', '120%'] }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        repeatDelay: 2,
        ease: 'linear',
      }}
    >
      {children}
    </motion.span>
  );
}

export default ShimmerText;
