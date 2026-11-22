'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

/** Video du hero : lecture en sourdine, jamais lancee sous prefers-reduced-motion. */
export function HeroVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (reduce) {
      video.pause();
      return;
    }
    video.play().catch(() => {
      // Lecture auto refusee par le navigateur : l'affiche reste visible.
    });
  }, [reduce]);

  return (
    <video
      ref={ref}
      data-video
      className="absolute inset-0 size-full object-cover"
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden="true"
    />
  );
}
