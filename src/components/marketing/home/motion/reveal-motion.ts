import { followScroll } from './follow-scroll';
import { MOTION_QUERY, between, easeOut } from './motion-math';

/** Titres mot a mot, montee des blocs et devoilement des photos, lies au defilement. */
export function startRevealMotion(root: HTMLElement): () => void {
  const findAll = (selector: string) => [...root.querySelectorAll<HTMLElement>(selector)];
  const titles = findAll('[data-mots]').map((el) => ({
    el,
    words: [...el.querySelectorAll<HTMLElement>('[data-mot]')],
  }));
  // offset : translation deja posee, retranchee a la lecture de la position.
  const rises = findAll('[data-monte]').map((el) => ({ el, offset: 0 }));
  // Cale sur la photo elle-meme : en colonne unique (sous 1024 px) elle arrive
  // bien apres le haut de sa carte, et l'effet se jouait hors ecran.
  const reveals = findAll('[data-revele]').map((el) => ({
    el,
    image: el.querySelector('img'),
  }));

  const read = (): (() => void) => {
    const screen = window.innerHeight;
    const amplitude = document.documentElement.clientWidth < 768 ? 48 : 100;
    const entered = (el: Element, offset = 0) =>
      1 - (el.getBoundingClientRect().top - offset) / screen;

    const titleProgress = titles.map(({ el }) => entered(el));
    const riseProgress = rises.map(({ el, offset }) =>
      easeOut(between(entered(el, offset), 0, 0.36)),
    );
    const revealProgress = reveals.map(({ el }) => easeOut(between(entered(el), 0.02, 0.6)));

    return () => {
      titles.forEach(({ words }, i) => {
        words.forEach((word, j) => {
          const delay = (j / words.length) * 0.16;
          const e = easeOut(between(titleProgress[i], 0.02 + delay, 0.22 + delay));
          word.style.transform = `translateY(${115 * (1 - e)}%)`;
        });
      });
      rises.forEach((rise, i) => {
        const e = riseProgress[i];
        rise.offset = amplitude * (1 - e);
        rise.el.style.transform = e === 1 ? '' : `translateY(${rise.offset}px)`;
        rise.el.style.opacity = e === 1 ? '' : String(0.2 + 0.8 * e);
      });
      reveals.forEach(({ el, image }, i) => {
        const e = revealProgress[i];
        el.style.clipPath = e === 1 ? '' : `inset(${25 * (1 - e)}% round 20px)`;
        el.style.opacity = e === 1 ? '' : String(e);
        if (image) image.style.transform = e === 1 ? '' : `scale(${1.2 - 0.2 * e})`;
      });
    };
  };

  const reset = (): void => {
    for (const { words } of titles) {
      for (const word of words) word.style.transform = '';
    }
    for (const rise of rises) {
      rise.offset = 0;
      rise.el.style.transform = '';
      rise.el.style.opacity = '';
    }
    for (const { el, image } of reveals) {
      el.style.clipPath = '';
      el.style.opacity = '';
      if (image) image.style.transform = '';
    }
  };

  return followScroll({ target: root, query: MOTION_QUERY, read, reset });
}
