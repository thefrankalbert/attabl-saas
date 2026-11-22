import { followScroll } from './follow-scroll';
import { startSceneCompletion } from './scene-completion';
import {
  HEADER_HEIGHT,
  NARROW,
  SCENE_QUERY,
  TRAVEL,
  WIDE,
  between,
  clamp01,
  easeIn,
  fieldEntryEnd,
  fieldWordEntry,
  heroWordExit,
  mediaFrame,
} from './motion-math';

/** Hero + champ de tuiles : le media du hero devient une tuile au defilement. */
export function startSceneMotion(track: HTMLElement): () => void {
  const find = (selector: string) => track.querySelector<HTMLElement>(selector);
  const findAll = (selector: string) => [...track.querySelectorAll<HTMLElement>(selector)];

  const scene = find('[data-scene]');
  const hero = find('[data-hero]');
  const media = find('[data-media]');
  const shade = find('[data-hero-voile]');
  const subtitle = find('[data-sort="sous"]');
  const actions = find('[data-sort="cta"]');
  const proof = find('[data-sort="preuve"]');
  if (!scene || !hero || !media || !shade || !subtitle || !actions || !proof) return () => {};

  const heroWords = findAll('[data-hero] h1 [data-mot]');
  const fieldWords = findAll('[data-champ] h2 [data-mot]');
  const tiles = findAll('[data-tuile]').map((el) => ({ el, image: el.querySelector('img') }));
  const narrow = window.matchMedia('(max-width: 767.98px)');

  const read = (): (() => void) => {
    // clientHeight (100svh - 64) et non innerHeight : ne bouge pas quand la barre
    // d'adresse mobile se replie.
    const height = scene.clientHeight;
    const width = scene.clientWidth;
    const side = parseFloat(getComputedStyle(tiles[0].el).width);
    const q = Math.max(0, HEADER_HEIGHT - track.getBoundingClientRect().top) / (TRAVEL * height);
    const p = clamp01(q);
    const endY = (narrow.matches ? NARROW : WIDE).y[2] * height;
    const box = mediaFrame({ progress: p, width, height, side, endY });

    return () => {
      media.style.transform = `translateY(${box.y}px) scale(${box.scale})`;
      media.style.clipPath = `inset(${box.insetY}px ${box.insetX}px round ${box.radius}px)`;
      shade.style.opacity = String(1 - 0.8 * p); // la tuile finit aussi claire que les autres
      for (const { el, image } of tiles) {
        el.style.transform = `scale(${0.25 + 0.75 * p})`;
        el.style.opacity = String(p);
        if (image) image.style.transform = `scale(${1.5 - 0.5 * p})`;
      }
      heroWords.forEach((word, i) => {
        const e = heroWordExit(q, i);
        word.style.transform = `translateY(${-81 * e}px)`;
        word.style.opacity = String(1 - e);
      });
      proof.style.opacity = String(1 - between(q, 0, 0.4));
      subtitle.style.opacity = String(1 - between(q, 0.08, 0.36));
      const exit = easeIn(between(q, 0.2, 0.62));
      actions.style.opacity = String(1 - exit);
      actions.style.transform = `translateY(${-44 * exit}px)`;
      actions.inert = exit > 0.95;
      hero.style.pointerEvents = p > 0.7 ? 'none' : '';
      fieldWords.forEach((word, i) => {
        const e = fieldWordEntry(q, i);
        word.style.transform = `translateY(${115 * (1 - e)}%)`;
        word.style.opacity = String(0.2 + 0.8 * e);
      });
    };
  };

  const reset = (): void => {
    // Pas de removeAttribute('style') : les tuiles portent leur position en variables CSS.
    const animated = [media, shade, subtitle, actions, proof, ...heroWords, ...fieldWords];
    for (const { el, image } of tiles) {
      animated.push(el);
      if (image) image.style.transform = '';
    }
    for (const el of animated) {
      el.style.transform = '';
      el.style.opacity = '';
    }
    media.style.clipPath = '';
    hero.style.pointerEvents = '';
    actions.inert = false;
  };

  // L'effet est fini quand le dernier mot du titre est en place, pas a la tuile.
  const effectEnd = (): number =>
    Math.ceil(fieldEntryEnd(fieldWords.length) * TRAVEL * scene.clientHeight) + 2;

  const stopMotion = followScroll({ target: scene, query: SCENE_QUERY, read, reset });
  const stopCompletion = startSceneCompletion(track, effectEnd);
  return () => {
    stopCompletion();
    stopMotion();
  };
}
