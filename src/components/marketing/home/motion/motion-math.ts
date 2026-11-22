/*
 * Valeurs de la maquette animee du studio (mouvement.js) : courbes, bornes et
 * positions. Fonctions pures, sans DOM.
 */

/** Meme condition que la mise en page de la scene dans home-motion.css. */
export const SCENE_QUERY =
  '(prefers-reduced-motion: no-preference) and (min-height: 644px) and (scripting: enabled)';
export const MOTION_QUERY = '(prefers-reduced-motion: no-preference)';

export const HEADER_HEIGHT = 64;
/** Part de la zone sous l'en-tete a faire defiler pour que le media devienne une tuile. */
export const TRAVEL = 0.35;
/** Piste : l'ecran, puis (TRACK - 1) fois la zone sous l'en-tete. */
export const TRACK = 1.62;

export const MOSAIC_TILES = [
  'patron',
  'poisson',
  'bar',
  'douceurs',
  'comptoir',
  'chef',
  'associes',
  'verres',
  'accueil',
  'serveuse',
  'maitre',
  'gerante',
  'bureau',
  'pintade',
  'rire',
  'laiton',
  'tasses',
] as const;

interface Layout {
  x4: readonly number[];
  x5: readonly number[];
  y: readonly number[];
}

// Centres des cases en part de la scene : 4, 5, 5 et 4 cases par rangee.
export const WIDE: Layout = {
  x4: [0.172, 0.391, 0.61, 0.829],
  x5: [0.062, 0.281, 0.5, 0.719, 0.938],
  y: [0.088, 0.305, 0.745, 0.922],
};
export const NARROW: Layout = {
  x4: [-0.2, 0.256, 0.744, 1.2],
  x5: [-0.46, 0.013, 0.5, 0.987, 1.46],
  y: [0.075, 0.25, 0.79, 0.935],
};

/** Les 17 cases : la case centrale de la 3e rangee est laissee au media du hero. */
export function tileCenters({ x4, x5, y }: Layout): { x: number; y: number }[] {
  return y.flatMap((top, row) =>
    (row === 0 || row === 3 ? x4 : x5)
      .filter((_, column) => row !== 2 || column !== 2)
      .map((x) => ({ x, y: top })),
  );
}

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
export const between = (value: number, from: number, to: number): number =>
  clamp01((value - from) / (to - from));
export const easeOut = (value: number): number => 1 - (1 - value) ** 3;
export const easeIn = (value: number): number => value * value;

export const heroWordExit = (q: number, index: number): number =>
  easeIn(between(q, 0.06 + index * 0.035, 0.36 + index * 0.035));
/** Valeur de q a laquelle le dernier mot du titre du champ est en place. */
export const fieldEntryEnd = (words: number): number => 1 + Math.max(0, words - 1) * 0.035;
export const fieldWordEntry = (q: number, index: number): number =>
  easeOut(between(q, 0.68 + index * 0.035, 1 + index * 0.035));

interface MediaInput {
  progress: number;
  width: number;
  height: number;
  /** Cote d'une tuile, en pixels. */
  side: number;
  /** Centre de la case d'arrivee, en pixels depuis le haut de la scene. */
  endY: number;
}

interface MediaFrame {
  y: number;
  scale: number;
  insetX: number;
  insetY: number;
  radius: number;
}

/** Le media du hero se reduit, se decoupe et descend jusqu'a sa case. */
export function mediaFrame({ progress, width, height, side, endY }: MediaInput): MediaFrame {
  const square = Math.min(width, height);
  return {
    y: (endY - height / 2) * progress,
    scale: 1 - (1 - side / square) * progress,
    insetX: ((width - square) / 2) * progress,
    insetY: ((height - square) / 2) * progress,
    radius: ((20 * square) / side) * progress,
  };
}
