'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AUTH_SCENES, useAuthSceneOverride, type AuthScene } from './auth-scenes';

const SLIDE_MS = 6000;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

// ponytail: module-level memory so the slideshow keeps its photo when the
// visitor goes from /login to /signup. They are two routes with two layouts, so
// the shell is remounted on the way; a shared route-group layout would keep it
// mounted, at the price of moving the route folders.
let savedIndex = 0;
let savedReach = 0;
let savedPaused = false;

function subscribeReducedMotion(notify: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
}

const subscribeNever = () => () => {};

/**
 * Photo side of the auth frame: full-screen photo from 1024px, banner below.
 * From 1024px the sentence is centred in the right half (owner's choice on
 * 2026-11-23; the mock-up had it at the bottom), with a soft shadow because it
 * then sits on the subject of the photo, sometimes on a light area.
 * One photo is fixed; several make a slideshow (0.8s fade, one photo every 6s,
 * pause button). With reduced motion the first photo stays and there is no
 * button. The first photo is the only one preloaded: each following photo is
 * requested one slide ahead, so the others never delay the first paint.
 */
export function AuthPhotoPanel({ scene: sceneProp }: { scene: AuthScene }) {
  const t = useTranslations('authShell');
  const scene = useAuthSceneOverride() ?? sceneProp;
  const photos = AUTH_SCENES[scene];
  const count = photos.length;

  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
  const [slide, setSlide] = useState(() => ({ index: savedIndex, reach: savedReach }));
  const [paused, setPaused] = useState(() => savedPaused);

  const isSlideshow = count > 1 && !reducedMotion;
  const running = isSlideshow && !paused;
  const active = isSlideshow && hydrated ? slide.index % count : 0;

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setSlide((current) => {
        const index = (current.index + 1) % count;
        return { index, reach: Math.max(current.reach, index) };
      });
    }, SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [running, count]);

  useEffect(() => {
    if (count > 1) {
      savedIndex = slide.index;
      savedReach = slide.reach;
    }
  }, [count, slide]);

  const togglePause = () => {
    savedPaused = !paused;
    setPaused(!paused);
  };

  return (
    <aside
      aria-label={t('photoLabel')}
      className="relative order-1 h-[38svh] min-h-[240px] overflow-hidden lg:absolute lg:inset-0 lg:h-auto lg:min-h-0"
    >
      {/* Parent POSITIONNE des images `fill` (Next/Image l'exige, sinon avertissement
          en console). `absolute inset-0` couvre exactement l'aside, qui etait deja
          le bloc de reference des images: le rendu ne change pas. */}
      <div className="absolute inset-0" aria-hidden="true">
        {photos.map((src, i) =>
          i === 0 || (isSlideshow && hydrated && i <= slide.reach + 1) ? (
            <Image
              key={src}
              src={src}
              alt=""
              fill
              preload={i === 0}
              sizes="100vw"
              className={cn(
                'object-cover transition-opacity duration-[800ms] ease-in-out motion-reduce:transition-none',
                i === active ? 'opacity-100' : 'opacity-0',
              )}
            />
          ) : null,
        )}
      </div>
      <div className="auth-voile absolute inset-0" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-0 bg-[url(/auth/grain-256.webp)] bg-[length:256px] bg-repeat opacity-35 mix-blend-overlay"
        aria-hidden="true"
      />

      <div className="absolute inset-x-0 bottom-0 px-5 pb-12 lg:inset-y-0 lg:left-1/2 lg:right-0 lg:flex lg:items-center lg:justify-center lg:px-16 lg:pb-0">
        <p className="auth-serif max-w-[16ch] text-[30px] leading-[1.05] tracking-[-0.01em] text-balance text-white sm:text-[38px] lg:max-w-[15ch] lg:text-center lg:text-[48px] lg:[text-shadow:0_2px_28px_rgba(0,0,0,0.6),0_1px_3px_rgba(0,0,0,0.4)]">
          {t(`phrases.${scene}`)}
        </p>
      </div>

      {isSlideshow && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={togglePause}
          aria-label={paused ? t('play') : t('pause')}
          className="absolute right-4 top-4 h-10 w-10 rounded-full bg-black/45 text-white opacity-85 hover:bg-black/60 hover:text-white focus-visible:ring-2 focus-visible:ring-white lg:bottom-4 lg:top-auto"
        >
          {paused ? (
            <Play className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Pause className="h-3.5 w-3.5 fill-current" />
          )}
        </Button>
      )}
    </aside>
  );
}
