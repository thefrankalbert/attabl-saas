import { cancelFrame, frame } from 'framer-motion';

interface FollowScrollOptions {
  target: Element;
  /** L'effet ne tourne que tant que cette media query est vraie. */
  query: string;
  /** Lit le DOM et renvoie l'ecriture a faire, sans rien ecrire. */
  read: () => () => void;
  /** Rend la page a son etat fixe. */
  reset: () => void;
}

/**
 * Branche un effet lie au defilement sur la boucle unique de framer-motion :
 * toutes les lectures de la page, puis toutes les ecritures. Aucun setState.
 */
export function followScroll({ target, query, read, reset }: FollowScrollOptions): () => void {
  const media = window.matchMedia(query);
  let write = (): void => {};
  const render = (): void => write();
  const update = (): void => {
    write = read();
    frame.render(render);
  };
  const schedule = (): void => {
    if (media.matches) frame.read(update);
  };
  const stop = (): void => {
    cancelFrame(update);
    cancelFrame(render);
    reset();
  };
  const onQueryChange = (): void => {
    if (media.matches) schedule();
    else stop();
  };
  // Polices chargees, question de la FAQ ouverte : les positions changent sans defilement.
  const observer = new ResizeObserver(schedule);

  if (media.matches) read()(); // premier etat pose tout de suite (scroll restaure, ancre)
  observer.observe(target);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  media.addEventListener('change', onQueryChange);

  return () => {
    observer.disconnect();
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    media.removeEventListener('change', onQueryChange);
    stop();
  };
}
