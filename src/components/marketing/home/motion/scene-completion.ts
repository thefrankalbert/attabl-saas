import { animate } from 'framer-motion';
import { HEADER_HEIGHT, SCENE_QUERY, clamp01 } from './motion-math';

/** Pause du defilement avant de finir l'effet, en ms. */
const IDLE_MS = 140;
/** En dessous, ce n'est pas un defilement voulu. */
const DEAD_ZONE = 8;
/** Au-dela de cet ecart avec la position posee, quelqu'un d'autre fait defiler. */
const FOREIGN_SCROLL = 4;

/**
 * L'effet ne reste jamais arrete a mi-course (releve sur squareup.com le
 * 2026-11-22) : lache vers le bas il se termine, lache vers le haut le hero
 * revient. La main de l'utilisateur reprend toujours la priorite.
 */
export function startSceneCompletion(track: HTMLElement, effectEnd: () => number): () => void {
  const media = window.matchMedia(SCENE_QUERY);
  let running: ReturnType<typeof animate> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastY = window.scrollY;
  let expectedY = 0;
  let goingUp = false;
  let held = false; // doigt pose, ou barre de defilement tenue

  const complete = (): void => {
    if (held || !media.matches) return;
    const travelled = HEADER_HEIGHT - track.getBoundingClientRect().top;
    const end = effectEnd();
    if (travelled <= DEAD_ZONE || travelled >= end - 2) return;

    const from = window.scrollY;
    expectedY = from;
    // Non passif le temps de l'animation : le navigateur attend qu'elle soit
    // arretee pour appliquer la molette, au lieu de la voir annulee par scrollTo.
    window.addEventListener('wheel', takeOver, { passive: false });
    const target = Math.max(0, from - travelled + (goingUp ? 0 : end));
    running = animate(from, target, {
      duration: 0.35 + 0.35 * clamp01(Math.abs(target - from) / end),
      ease: [0.45, 0, 0.25, 1],
      onUpdate: (top) => {
        expectedY = top;
        window.scrollTo({ top, behavior: 'instant' });
      },
      onComplete: () => stop(),
    });
  };
  const wait = (): void => {
    clearTimeout(timer);
    timer = setTimeout(complete, IDLE_MS);
  };
  const stop = (): void => {
    running?.stop();
    running = null;
    window.removeEventListener('wheel', takeOver);
    clearTimeout(timer);
    lastY = window.scrollY;
  };
  const onScroll = (): void => {
    const y = window.scrollY;
    if (running) {
      if (Math.abs(y - expectedY) <= FOREIGN_SCROLL) return;
      stop(); // ancre, barre de defilement, clavier : la main reprend
      goingUp = y < expectedY;
      lastY = y;
    }
    if (y !== lastY) goingUp = y < lastY;
    lastY = y;
    wait();
  };
  const takeOver = (): void => {
    stop();
    wait();
  };
  const hold = (): void => {
    held = true;
    stop();
  };
  const release = (): void => {
    if (!held) return;
    held = false;
    wait();
  };
  // La barre de defilement n'envoie pas toujours mouseup.
  const onMouseMove = ({ buttons }: MouseEvent): void => {
    if (buttons === 0) release();
  };

  const listeners = new AbortController();
  const options = { passive: true, signal: listeners.signal } as const;
  window.addEventListener('scroll', onScroll, options);
  window.addEventListener('wheel', wait, options);
  window.addEventListener('keydown', takeOver, options);
  window.addEventListener('touchstart', hold, options);
  window.addEventListener('touchend', release, options);
  window.addEventListener('touchcancel', release, options);
  window.addEventListener('mousedown', hold, options);
  window.addEventListener('mouseup', release, options);
  window.addEventListener('mousemove', onMouseMove, options);
  media.addEventListener('change', stop, options);

  return () => {
    listeners.abort();
    stop();
  };
}
