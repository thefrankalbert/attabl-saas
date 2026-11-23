'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { MOSAIC_TILES, MOTION_QUERY } from './motion/motion-math';

const STEP = 110;
const MAX_PHOTOS = 8;
const TEXT_MARGIN = 60;

/** Section du CTA final : trainee de photos au pointeur fin, jamais pres du texte. */
export function CtaTrail({ children }: { children: ReactNode }) {
  const zoneRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const zone = zoneRef.current;
    const text = zone?.querySelector('[data-zone-texte]');
    if (!zone || !text) return;

    const finePointer = window.matchMedia(`${MOTION_QUERY} and (hover: hover) and (pointer: fine)`);
    const photos = new Set<HTMLImageElement>();
    let last: { x: number; y: number } | null = null;
    let count = 0;

    const onMove = ({ clientX: x, clientY: y, pointerType }: PointerEvent) => {
      if (pointerType === 'touch' || !finePointer.matches || photos.size >= MAX_PHOTOS) return;
      if (last && Math.hypot(x - last.x, y - last.y) < STEP) return;
      const box = text.getBoundingClientRect();
      const nearText =
        x > box.left - TEXT_MARGIN &&
        x < box.right + TEXT_MARGIN &&
        y > box.top - TEXT_MARGIN &&
        y < box.bottom + TEXT_MARGIN;
      if (nearText) return;

      last = { x, y };
      const origin = zone.getBoundingClientRect();
      const photo = document.createElement('img');
      photo.src = `/marketing/home/mosaique/${MOSAIC_TILES[count++ % MOSAIC_TILES.length]}.webp`;
      photo.alt = '';
      photo.className = 'home-trainee';
      photo.dataset.trainee = '';
      photo.style.left = `${x - origin.left}px`;
      photo.style.top = `${y - origin.top}px`;
      zone.prepend(photo);
      photos.add(photo);

      const animation = photo.animate(
        [
          { transform: 'scale(.25)', opacity: 0 },
          { transform: 'scale(1)', opacity: 1, offset: 0.25 },
          { transform: 'scale(1)', opacity: 1, offset: 0.6 },
          { transform: 'scale(.7)', opacity: 0 },
        ],
        { duration: 1100, easing: 'cubic-bezier(0,0,.2,1)' },
      );
      animation.onfinish = () => {
        photo.remove();
        photos.delete(photo);
      };
    };

    zone.addEventListener('pointermove', onMove);
    return () => {
      zone.removeEventListener('pointermove', onMove);
      for (const photo of photos) {
        photo.getAnimations().forEach((animation) => animation.cancel());
        photo.remove();
      }
    };
  }, []);

  return (
    <section
      ref={zoneRef}
      data-zone-trainee
      className="relative isolate overflow-hidden bg-gris text-encre dark:text-white"
      aria-labelledby="fin-titre"
    >
      {children}
    </section>
  );
}
